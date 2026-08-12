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
  type Client,
  Colors,
  ContainerBuilder,
  type GuildTextBasedChannel,
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

// The walkthrough asks one selector per field, in this order. The prompt for a
// step may reference the labels chosen in earlier steps.
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
    prompt: (labels: string[]) =>
      `What operating system are you running ${labels[1]} on?`,
  },
] as const;

// Answered values are carried between steps in the selector's custom id, so the
// walkthrough never has to read its state back out of the message.
const CUSTOM_ID = "walkthrough";

const text = (content: string) => new TextDisplayBuilder({ content });

const labelForValue = (menu: StringSelectMenuBuilder, value: string) =>
  menu.options.find((o) => o.data.value === value)?.data.label ?? "N/A";

const docSection = ({ label, url }: ResourceLink) =>
  new SectionBuilder()
    .addTextDisplayComponents(text(label))
    .setButtonAccessory(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Docs")
        .setURL(url),
    );

async function lifecycleText(client: Client) {
  const close = await getCommandMention(client, "close");
  const reopen = await getCommandMention(client, "reopen");
  return `When your issue is resolved, use ${close} to close this issue. Use ${reopen} to reopen it if needed.`;
}

// Builds the walkthrough message from the answered values so far. While steps
// remain it shows the next question and selector; once complete it drops those
// and shows the selected product's documentation buttons.
async function buildMessage(
  client: Client,
  channelId: string,
  values: string[],
) {
  const labels = values.map((value, i) => labelForValue(steps[i].menu, value));

  const info = new ContainerBuilder()
    .addTextDisplayComponents(
      text(
        [
          `### <#${channelId}>`,
          ...steps.map((step, i) => `**${step.field}:** ${labels[i] ?? "N/A"}`),
          "",
          "Please post any relevant logs/error messages.",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(await lifecycleText(client)));

  const step = steps[values.length];

  if (!step) {
    for (const resource of productResources[values[1]] ?? []) {
      info.addSeparatorComponents(new SeparatorBuilder());
      info.addSectionComponents(docSection(resource));
    }
    return { flags: MessageFlags.IsComponentsV2 as const, components: [info] };
  }

  const menu = StringSelectMenuBuilder.from(step.menu).setCustomId(
    [CUSTOM_ID, ...values].join(":"),
  );

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [
      info,
      new ContainerBuilder()
        .setAccentColor(Colors.White)
        .addTextDisplayComponents(text(step.prompt(labels))),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  };
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
