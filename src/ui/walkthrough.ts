import { config } from "@lib/config.js";
import { getCommandMention } from "@lib/discord/commands.js";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  Colors,
  type Embed,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from "discord.js";

type Answers = Record<string, string>;

// A single walkthrough step. `field` is the data embed field this step fills,
// and `question` can depend on the answers collected so far (the OS step
// references the previously chosen product).
interface WalkthroughStep {
  customId: string;
  field: string;
  question: string | ((answers: Answers) => string);
  selector: StringSelectMenuBuilder;
}

type ResourceLink = { label: string; url: string };

const PRODUCT_FIELD = "Product";

const LOGS_FIELD = {
  name: "Logs",
  value: "Please post any relevant logs/error messages.",
};

function selectMenu(
  customId: string,
  placeholder: string,
  options: StringSelectMenuOptionBuilder[],
) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options);
}

// The walkthrough is driven entirely by this ordered list. To add a question,
// append a step; the engine below advances through them generically.
const steps: WalkthroughStep[] = [
  {
    customId: "issueCategorySelector",
    field: "Category",
    question: "What are you creating this issue for?",
    selector: selectMenu("issueCategorySelector", "Choose an issue category", [
      new StringSelectMenuOptionBuilder()
        .setLabel("Help needed")
        .setValue("help"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Bug report")
        .setValue("bug"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Feature request")
        .setValue("feature"),
      new StringSelectMenuOptionBuilder().setLabel("Other").setValue("other"),
    ]),
  },
  {
    customId: "productSelector",
    field: PRODUCT_FIELD,
    question: "What product are you using?",
    selector: selectMenu("productSelector", "Choose a product", [
      new StringSelectMenuOptionBuilder()
        .setLabel("Coder (v2)")
        .setValue("coder")
        .setEmoji(config.emojis.coder),
      new StringSelectMenuOptionBuilder()
        .setLabel("code-server")
        .setValue("code-server")
        .setEmoji(config.emojis.vscode),
    ]),
  },
  {
    customId: "operatingSystemFamilySelector",
    field: "Platform",
    question: (answers) =>
      `What operating system are you running ${answers[PRODUCT_FIELD]} on?`,
    selector: selectMenu(
      "operatingSystemFamilySelector",
      "Choose an operating system family",
      [
        new StringSelectMenuOptionBuilder()
          .setLabel("Linux")
          .setValue("linux")
          .setEmoji(config.emojis.linux),
        new StringSelectMenuOptionBuilder()
          .setLabel("Windows")
          .setValue("windows")
          .setEmoji(config.emojis.windows),
        new StringSelectMenuOptionBuilder()
          .setLabel("macOS")
          .setValue("macos")
          .setEmoji(config.emojis.macos),
      ],
    ),
  },
];

const productStep = steps.find((step) => step.field === PRODUCT_FIELD);

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

function resolveQuestion(step: WalkthroughStep, answers: Answers) {
  return typeof step.question === "function"
    ? step.question(answers)
    : step.question;
}

function labelFor(step: WalkthroughStep, value: string) {
  const option = step.selector.options.find((o) => o.data.value === value);
  return option?.data.label ?? value;
}

function fieldValue(embed: EmbedBuilder, name: string) {
  return embed.data.fields?.find((f) => f.name === name)?.value ?? "";
}

function setField(embed: EmbedBuilder, name: string, value: string) {
  const field = embed.data.fields?.find((f) => f.name === name);
  if (field) {
    field.value = value;
  }
}

function collectAnswers(embed: EmbedBuilder): Answers {
  const answers: Answers = {};
  for (const field of embed.data.fields ?? []) {
    answers[field.name] = field.value;
  }
  return answers;
}

// Resolves the resources for a product from the label shown in the data embed.
function resourcesForProduct(productLabel: string): ResourceLink[] {
  const option = productStep?.selector.options.find(
    (o) => o.data.label === productLabel,
  );
  return (option && productResources[option.data.value ?? ""]) || [];
}

// The data embed tracks the walkthrough answers. Its fields follow the step
// order (Category, Product, Platform) so each step fills the matching field in
// place, plus a trailing Logs field.
export function buildDataEmbed(channelId: string) {
  return new EmbedBuilder()
    .setTitle(`<#${channelId}>`)
    .addFields(
      ...steps.map((step) => ({
        name: step.field,
        value: "N/A",
        inline: true,
      })),
      LOGS_FIELD,
    );
}

// The resources embed points users at the post lifecycle commands. It stays the
// same for the whole walkthrough.
export async function buildResourcesEmbed(client: Client) {
  return new EmbedBuilder()
    .setColor(Colors.White)
    .setDescription(
      `When your issue is resolved, use ${await getCommandMention(client, "close")} to close this issue. Use ${await getCommandMention(client, "reopen")} to reopen it if needed.`,
    );
}

// Assembles the single walkthrough message from its current state: the data and
// resources embeds, the current question and selector (while the walkthrough is
// running), and a documentation button per resource of the selected product.
function buildWalkthroughMessage(
  dataEmbed: EmbedBuilder,
  resourcesEmbed: EmbedBuilder | Embed,
  step?: WalkthroughStep,
  answers: Answers = {},
) {
  const embeds: (EmbedBuilder | Embed)[] = [dataEmbed, resourcesEmbed];
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (step) {
    embeds.push(
      new EmbedBuilder()
        .setColor(Colors.White)
        .setDescription(resolveQuestion(step, answers)),
    );
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        step.selector,
      ),
    );
  }

  const resources = resourcesForProduct(fieldValue(dataEmbed, PRODUCT_FIELD));
  if (resources.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        resources.map((resource) =>
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(resource.label)
            .setURL(resource.url),
        ),
      ),
    );
  }

  return { embeds, components };
}

// Builds the initial walkthrough message: a fresh data embed, the resources
// embed, and the first question.
export async function buildWalkthroughStart(client: Client, channelId: string) {
  return buildWalkthroughMessage(
    buildDataEmbed(channelId),
    await buildResourcesEmbed(client),
    steps[0],
  );
}

// Advances the walkthrough one step whenever a step selector is used. Records
// the chosen answer, edits the message in place, then either asks the next
// question or finalises and pins.
export async function handleSelection(
  interaction: StringSelectMenuInteraction,
) {
  const stepIndex = steps.findIndex((s) => s.customId === interaction.customId);
  if (stepIndex === -1) {
    return;
  }

  const step = steps[stepIndex];
  const dataEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
  setField(dataEmbed, step.field, labelFor(step, interaction.values[0]));

  const nextStep = steps[stepIndex + 1];
  await interaction.update(
    buildWalkthroughMessage(
      dataEmbed,
      interaction.message.embeds[1],
      nextStep,
      collectAnswers(dataEmbed),
    ),
  );

  if (!nextStep) {
    await interaction.message.pin();
  }
}
