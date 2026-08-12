import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/discord/channels.js";
import { getCommandMention } from "@lib/discord/commands.js";
import issueCategorySelector from "@components/issueCategorySelector.js";
import productSelector from "@components/productSelector.js";
import operatingSystemFamilySelector from "@components/operatingSystemFamilySelector.js";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  Colors,
  ComponentType,
  ContainerBuilder,
  type GuildTextBasedChannel,
  type Message,
  MessageFlags,
  type PublicThreadChannel,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  type StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextDisplayBuilder,
} from "discord.js";

type ResourceLink = { label: string; url: string };

// Documentation resources keyed by product value. Products without an entry
// (for example code-server) simply get no resource links.
const productResources: Record<string, ResourceLink[]> = {
  coder: [
    {
      label: "Where to find logs",
      url: "https://coder.com/docs/admin/monitoring/logs",
    },
    {
      label: "Troubleshooting templates",
      url: "https://coder.com/docs/admin/templates/troubleshooting",
    },
    {
      label: "Troubleshooting networking",
      url: "https://coder.com/docs/admin/networking/troubleshooting",
    },
  ],
};

// The walkthrough steps, in order. Each selector fills the data field with the
// matching name.
const steps = [
  { field: "Category", selector: issueCategorySelector },
  { field: "Product", selector: productSelector },
  { field: "Platform", selector: operatingSystemFamilySelector },
];

function getLabelFromValue(
  value: string,
  selector: (typeof steps)[number]["selector"],
) {
  return selector.options.find((option) => option.data.value === value)?.data
    .label;
}

// Resolves the resources for a product from the label shown in the data text.
function resourcesForProduct(productLabel: string): ResourceLink[] {
  const option = productSelector.options.find(
    (o) => o.data.label === productLabel,
  );
  return (option && productResources[option.data.value ?? ""]) || [];
}

// The data text summarizes the answers so far. Each field lives on its own line
// so a step can update just its line in place.
function buildDataText(channelId: string) {
  return [
    `### <#${channelId}>`,
    ...steps.map((step) => `**${step.field}:** N/A`),
    "",
    "Please post any relevant logs/error messages.",
  ].join("\n");
}

function setDataField(dataText: string, field: string, value: string) {
  return dataText.replace(
    new RegExp(`\\*\\*${field}:\\*\\* .*`),
    `**${field}:** ${value}`,
  );
}

function productFromDataText(dataText: string) {
  return dataText.match(/\*\*Product:\*\* (.+)/)?.[1] ?? "";
}

// Reads the text-display contents (data, then resources) back out of a
// walkthrough message so the next step can rebuild it.
function readTextDisplays(message: Message) {
  const contents: string[] = [];

  // biome-ignore lint/suspicious/noExplicitAny: walking nested V2 components
  const walk = (components: readonly any[]) => {
    for (const component of components) {
      if (component.type === ComponentType.TextDisplay) {
        contents.push(component.content);
      } else if (Array.isArray(component.components)) {
        walk(component.components);
      }
    }
  };

  walk(message.components);
  return contents;
}

async function buildResourcesText(
  client: ChatInputCommandInteraction["client"],
) {
  return `When your issue is resolved, use ${await getCommandMention(client, "close")} to close this issue. Use ${await getCommandMention(client, "reopen")} to reopen it if needed.`;
}

// Assembles the walkthrough message from its current state: an info container
// with the data summary, the lifecycle commands, and (once complete) a
// documentation button per product resource, plus the current question and
// selector while the walkthrough is running.
function buildWalkthroughMessage(
  dataText: string,
  resourcesText: string,
  step?: { question: string; selector: StringSelectMenuBuilder },
  resources: ResourceLink[] = [],
) {
  const info = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({ content: dataText }))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder({ content: resourcesText }),
    );

  if (resources.length > 0) {
    info.addSeparatorComponents(new SeparatorBuilder());
    for (const resource of resources) {
      info.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({ content: resource.label }),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Docs")
              .setURL(resource.url),
          ),
      );
    }
  }

  const components: (
    | ContainerBuilder
    | ActionRowBuilder<StringSelectMenuBuilder>
  )[] = [info];

  if (step) {
    components.push(
      new ContainerBuilder()
        .setAccentColor(Colors.White)
        .addTextDisplayComponents(
          new TextDisplayBuilder({ content: step.question }),
        ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        step.selector,
      ),
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components,
  };
}

export async function doWalkthrough(
  channel: GuildTextBasedChannel,
  interaction?: ChatInputCommandInteraction,
) {
  if (await isHelpThread(channel)) {
    const threadChannel = channel as PublicThreadChannel; // necessary type cast, isHelpThread does the check already

    // Check for tags in the forum post
    const appliedTags = threadChannel.appliedTags ?? [];
    if (!appliedTags.includes(config.helpChannel.openedTag)) {
      appliedTags.push(config.helpChannel.openedTag);
      threadChannel.setAppliedTags(appliedTags);
    }

    const walkthroughMessage = buildWalkthroughMessage(
      buildDataText(channel.id),
      await buildResourcesText(channel.client),
      {
        question: "What are you creating this issue for?",
        selector: issueCategorySelector,
      },
    );

    // Send the walkthrough message (or reply to the user if they're running the command)
    if (interaction) {
      // If the bot has sent a message with components in the first 30 messages, then we assume it's the walkthrough message
      const firstMessage = await threadChannel.fetchStarterMessage();
      const existingWalkthrough = await threadChannel.messages
        .fetch({ around: firstMessage.id, limit: 30 })
        .then((messages) =>
          messages
            .filter(
              (message) =>
                message.author.id === interaction.client.user.id &&
                message.components.length > 0,
            )
            .at(0),
        );

      if (existingWalkthrough) {
        await interaction.reply({
          content: `You cannot run the walkthrough command because a walkthrough already exists in this channel.\n(${existingWalkthrough.url})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply(walkthroughMessage);
    } else {
      await channel.send(walkthroughMessage);
    }
  }
}

// Advances the walkthrough one step by editing the same message: fills the
// answered field, asks the next question, or on the last step drops the
// question/selector and shows the product's documentation buttons.
export async function handleSelection(
  interaction: StringSelectMenuInteraction,
) {
  const index = steps.findIndex(
    (step) => step.selector.data.custom_id === interaction.customId,
  );
  if (index === -1) {
    return;
  }

  const lastStep = index + 1 === steps.length;
  const [dataText, resourcesText] = readTextDisplays(interaction.message);

  const label = getLabelFromValue(interaction.values[0], steps[index].selector);
  const updatedData = setDataField(
    dataText,
    steps[index].field,
    label ?? "N/A",
  );

  const nextStep = steps[index + 1];
  const messageData = lastStep
    ? buildWalkthroughMessage(
        updatedData,
        resourcesText,
        undefined,
        resourcesForProduct(productFromDataText(updatedData)),
      )
    : buildWalkthroughMessage(updatedData, resourcesText, {
        question:
          nextStep.selector === productSelector
            ? "What product are you using?"
            : `What operating system are you running ${label} on?`,
        selector: nextStep.selector,
      });

  await interaction.update(messageData);

  if (lastStep) {
    await interaction.message.pin();
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("walkthrough")
    .setDescription(
      "Sends the walkthrough message in case the bot didn't automatically send it.",
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const interactionChannel = (await interaction.client.channels.fetch(
      interaction.channelId,
    )) as GuildTextBasedChannel;

    return doWalkthrough(interactionChannel, interaction);
  },
};
