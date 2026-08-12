import { config } from "@lib/config.js";

import {
  canMemberInteractWithThread,
  isHelpPost as isHelpThread,
} from "@lib/discord/channels.js";
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
  type ThreadChannel,
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

const optionOf = (menu: StringSelectMenuBuilder, value?: string) =>
  menu.options.find((o) => o.data.value === value)?.data;

const row = (...components: MessageActionRowComponentBuilder[]) =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

// A field row: the field name with a button showing the chosen option (label
// and emoji), or a disabled "N/A" button until it is answered. The button
// carries the field index and the answers so far so a click can reopen that
// question for editing.
function fieldSection(
  index: number,
  field: string,
  menu: StringSelectMenuBuilder,
  values: string[],
) {
  const option = optionOf(menu, values[index]);

  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setCustomId([CUSTOM_ID, "field", index, ...values].join(":"))
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
  editIndex?: number,
) {
  const info = new ContainerBuilder()
    .setAccentColor(Colors.Blurple)
    .addTextDisplayComponents(text(`<#${channelId}>`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      fieldSection(0, "Category", issueCategorySelector, values),
      fieldSection(1, "Product", productSelector, values),
      fieldSection(2, "Platform", operatingSystemFamilySelector, values),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(await lifecycleText(client)));

  const components: (
    | ContainerBuilder
    | ActionRowBuilder<MessageActionRowComponentBuilder>
  )[] = [info];

  const product = optionOf(productSelector, values[1])?.label ?? "N/A";

  // While editing, reopen the chosen field's selector instead of the next
  // unanswered step. Otherwise ask the next question if any remain.
  const step =
    editIndex !== undefined ? steps[editIndex] : steps[values.length];
  if (step) {
    const prompt =
      editIndex !== undefined
        ? `(Editing ${step.field})\n${step.prompt(product)}`
        : step.prompt(product);
    const selectId =
      editIndex !== undefined
        ? [CUSTOM_ID, "edit", editIndex, ...values].join(":")
        : [CUSTOM_ID, ...values].join(":");

    components.push(
      new ContainerBuilder()
        .setAccentColor(Colors.Blurple)
        .addTextDisplayComponents(text(prompt)),
      row(StringSelectMenuBuilder.from(step.menu).setCustomId(selectId)),
    );
  }

  const docs = productResources[values[1]] ?? [];
  if (docs.length > 0) {
    components.push(
      row(
        ...docs.map((doc) =>
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
// answered value appended. An "edit" selection instead replaces an existing
// answer in place, leaving any later answers untouched.
export async function handleSelection(
  interaction: StringSelectMenuInteraction,
) {
  if (!interaction.customId.startsWith(CUSTOM_ID)) {
    return;
  }

  const parts = interaction.customId.split(":");

  if (parts[1] === "edit") {
    if (!(await canEditWalkthrough(interaction))) {
      await denyEdit(interaction);
      return;
    }

    const index = Number(parts[2]);
    const values = parts.slice(3);
    values[index] = interaction.values[0];

    await interaction.update(
      await buildMessage(interaction.client, interaction.channelId, values),
    );
    return;
  }

  const values = [...parts.slice(1), interaction.values[0]];

  await interaction.update(
    await buildMessage(interaction.client, interaction.channelId, values),
  );

  if (values.length === steps.length) {
    await interaction.message.pin();
  }
}

// Whether the interacting member may edit the walkthrough: the post owner or a
// moderator with Manage Channels.
async function canEditWalkthrough(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const channel = interaction.channel;
  if (!channel?.isThread()) {
    return false;
  }

  const member = await interaction.guild?.members.fetch(interaction.user.id);
  return member
    ? canMemberInteractWithThread(channel as ThreadChannel, member)
    : false;
}

function denyEdit(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  return interaction.reply({
    content: "Only the OP or a moderator can edit the walkthrough answers.",
    flags: MessageFlags.Ephemeral,
  });
}

// Clicking a field's button reopens that question so the answer can be changed.
export async function handleFieldButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith(`${CUSTOM_ID}:field:`)) {
    return;
  }

  if (!(await canEditWalkthrough(interaction))) {
    await denyEdit(interaction);
    return;
  }

  const parts = interaction.customId.split(":");
  const index = Number(parts[2]);
  const values = parts.slice(3);

  await interaction.update(
    await buildMessage(
      interaction.client,
      interaction.channelId,
      values,
      index,
    ),
  );
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
