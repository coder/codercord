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

// The walkthrough asks one selector per field, in this order.
const steps = [
  { field: "Category", menu: issueCategorySelector },
  { field: "Product", menu: productSelector },
  { field: "Platform", menu: operatingSystemFamilySelector },
] as const;

type Field = (typeof steps)[number]["field"];

const text = (content: string) => new TextDisplayBuilder({ content });

const labelForValue = (menu: StringSelectMenuBuilder, value: string) =>
  menu.options.find((o) => o.data.value === value)?.data.label ?? "N/A";

// Maps the product label shown in the summary back to its resource links.
function resourcesForProduct(productLabel: string): ResourceLink[] {
  const value = productSelector.options.find(
    (o) => o.data.label === productLabel,
  )?.data.value;
  return (value && productResources[value]) || [];
}

// The answers summary is stored as the info container's first text display, so
// it survives between steps. render/parse keep that text and the answer state
// in sync.
function renderSummary(channelId: string, answers: Record<Field, string>) {
  return [
    `### <#${channelId}>`,
    ...steps.map((step) => `**${step.field}:** ${answers[step.field]}`),
    "",
    "Please post any relevant logs/error messages.",
  ].join("\n");
}

function parseSummary(summary: string) {
  const channelId = summary.match(/<#(\d+)>/)?.[1] ?? "";
  const answers = Object.fromEntries(
    steps.map((step) => [
      step.field,
      summary.match(new RegExp(`\\*\\*${step.field}:\\*\\* (.+)`))?.[1] ??
        "N/A",
    ]),
  ) as Record<Field, string>;
  return { channelId, answers };
}

// Reads the container text displays (summary, then lifecycle text) back out of
// a walkthrough message.
function textDisplays(message: Message): string[] {
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

async function lifecycleText(client: Client) {
  const close = await getCommandMention(client, "close");
  const reopen = await getCommandMention(client, "reopen");
  return `When your issue is resolved, use ${close} to close this issue. Use ${reopen} to reopen it if needed.`;
}

const docSection = ({ label, url }: ResourceLink) =>
  new SectionBuilder()
    .addTextDisplayComponents(text(label))
    .setButtonAccessory(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Docs")
        .setURL(url),
    );

// Assembles the single walkthrough message: an info container (summary,
// lifecycle commands, and documentation buttons once complete) plus the current
// question and selector while the walkthrough is running.
function buildMessage(
  summary: string,
  lifecycle: string,
  question?: { prompt: string; menu: StringSelectMenuBuilder },
  docs: ResourceLink[] = [],
) {
  const info = new ContainerBuilder()
    .addTextDisplayComponents(text(summary))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(lifecycle));

  if (docs.length > 0) {
    info.addSeparatorComponents(new SeparatorBuilder());
    info.addSectionComponents(...docs.map(docSection));
  }

  const components: (
    | ContainerBuilder
    | ActionRowBuilder<StringSelectMenuBuilder>
  )[] = [info];

  if (question) {
    components.push(
      new ContainerBuilder()
        .setAccentColor(Colors.White)
        .addTextDisplayComponents(text(question.prompt)),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        question.menu,
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

  const emptyAnswers = Object.fromEntries(
    steps.map((step) => [step.field, "N/A"]),
  ) as Record<Field, string>;

  const walkthroughMessage = buildMessage(
    renderSummary(channel.id, emptyAnswers),
    await lifecycleText(channel.client),
    {
      prompt: "What are you creating this issue for?",
      menu: issueCategorySelector,
    },
  );

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

// Advances the walkthrough one step by editing the same message: fills the
// answered field and either asks the next question or, on the last step, drops
// the question/selector and shows the product's documentation buttons.
export async function handleSelection(
  interaction: StringSelectMenuInteraction,
) {
  const index = steps.findIndex(
    (step) => step.menu.data.custom_id === interaction.customId,
  );
  if (index === -1) {
    return;
  }

  const [summary, lifecycle] = textDisplays(interaction.message);
  const { channelId, answers } = parseSummary(summary);
  answers[steps[index].field] = labelForValue(
    steps[index].menu,
    interaction.values[0],
  );

  const next = steps[index + 1];
  const message = next
    ? buildMessage(renderSummary(channelId, answers), lifecycle, {
        prompt:
          next.menu === productSelector
            ? "What product are you using?"
            : `What operating system are you running ${answers.Product} on?`,
        menu: next.menu,
      })
    : buildMessage(
        renderSummary(channelId, answers),
        lifecycle,
        undefined,
        resourcesForProduct(answers.Product),
      );

  await interaction.update(message);

  if (!next) {
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
