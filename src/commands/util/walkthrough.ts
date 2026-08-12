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
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  Colors,
  ContainerBuilder,
  type GuildTextBasedChannel,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type PublicThreadChannel,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
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

// The walkthrough asks one selector per field, in this order.
const steps = [
  {
    field: "Category",
    menu: issueCategorySelector,
    prompt: () => "What are you creating this issue for?",
  },
  {
    field: "Product",
    menu: productSelector,
    prompt: () => "What product are you using?",
  },
  {
    field: "Platform",
    menu: operatingSystemFamilySelector,
    prompt: (product: string) =>
      `What operating system are you running ${product} on?`,
  },
] as const;

// Answered values are carried between steps in the selector's custom id, so the
// walkthrough never has to read its state back out of the message.
const CUSTOM_ID = "walkthrough";

const text = (content: string) => new TextDisplayBuilder({ content });

// A field row: the field name with a disabled button showing the chosen option
// (label and emoji), or "N/A" until it is answered.
function fieldSection(
  field: string,
  menu: StringSelectMenuBuilder,
  value?: string,
) {
  const option = menu.options.find((o) => o.data.value === value)?.data;

  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setCustomId(`${CUSTOM_ID}:field:${field}`)
    .setDisabled(!option)
    .setLabel(option?.label ?? "N/A");

  if (option?.emoji) {
    button.setEmoji(option.emoji);
  }

  return new SectionBuilder()
    .addTextDisplayComponents(text(field))
    .setButtonAccessory(button);
}

async function lifecycleText(client: Client) {
  const close = await getCommandMention(client, "close");
  const reopen = await getCommandMention(client, "reopen");
  return `When your issue is resolved, use ${close} to close it.\nUse ${reopen} to reopen it if needed.`;
}

// Builds the walkthrough message from the answered values so far: an info
// container with a field row per answer, the current question and selector while
// steps remain, and the selected product's documentation buttons at the bottom.
async function buildMessage(
  client: Client,
  channelId: string,
  values: string[],
) {
  const info = new ContainerBuilder()
    .setAccentColor(Colors.Blurple)
    .addTextDisplayComponents(text(`<#${channelId}>`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      fieldSection("Category", issueCategorySelector, values[0]),
      fieldSection("Product", productSelector, values[1]),
      fieldSection("Platform", operatingSystemFamilySelector, values[2]),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(await lifecycleText(client)));

  const components: (
    | ContainerBuilder
    | ActionRowBuilder<MessageActionRowComponentBuilder>
  )[] = [info];

  const step = steps[values.length];
  if (step) {
    const product = productSelector.options.find(
      (o) => o.data.value === values[1],
    )?.data.label;

    components.push(
      new ContainerBuilder()
        .setAccentColor(Colors.Blurple)
        .addTextDisplayComponents(text(step.prompt(product ?? "N/A"))),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        StringSelectMenuBuilder.from(step.menu).setCustomId(
          [CUSTOM_ID, ...values].join(":"),
        ),
      ),
    );
  }

  const docs = productResources[values[1]] ?? [];
  if (docs.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        docs.map((doc) =>
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(doc.label)
            .setURL(doc.url),
        ),
      ),
    );
  }

  return { flags: MessageFlags.IsComponentsV2 as const, components };
}

export async function doWalkthrough(
  channel: GuildTextBasedChannel,
  interaction?: ChatInputCommandInteraction,
) {
  if (!(await isHelpThread(channel))) {
    return;
  }

  const threadChannel = channel as PublicThreadChannel; // necessary type cast, isHelpThread does the check already

  // Check for tags in the forum post
  const appliedTags = threadChannel.appliedTags ?? [];
  if (!appliedTags.includes(config.helpChannel.openedTag)) {
    appliedTags.push(config.helpChannel.openedTag);
    threadChannel.setAppliedTags(appliedTags);
  }

  const walkthroughMessage = await buildMessage(channel.client, channel.id, []);

  // Slash-command runs reply to the user; auto-runs post to the thread.
  if (!interaction) {
    await channel.send(walkthroughMessage);
    return;
  }

  // If the bot already posted a walkthrough (a message with components) near the
  // start of the thread, don't post another one.
  const firstMessage = await threadChannel.fetchStarterMessage();
  const existing = await threadChannel.messages
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

  if (existing) {
    await interaction.reply({
      content: `You cannot run the walkthrough command because a walkthrough already exists in this channel.\n(${existing.url})`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply(walkthroughMessage);
}

// Advances the walkthrough one step by editing the same message with the newly
// answered value appended.
export async function handleSelection(
  interaction: StringSelectMenuInteraction,
) {
  if (!interaction.customId.startsWith(CUSTOM_ID)) {
    return;
  }

  const values = [
    ...interaction.customId.split(":").slice(1),
    interaction.values[0],
  ];

  await interaction.update(
    await buildMessage(interaction.client, interaction.channelId, values),
  );

  if (values.length === steps.length) {
    await interaction.message.pin();
  }
}

// The answer buttons only summarize the walkthrough answers, so a click just
// tells the user they can't be edited.
export async function handleFieldButton(interaction: ButtonInteraction) {
  if (interaction.customId.startsWith(`${CUSTOM_ID}:field:`)) {
    await interaction.reply({
      content: "This is just a summary of your answers, you can't edit it.",
      flags: MessageFlags.Ephemeral,
    });
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
