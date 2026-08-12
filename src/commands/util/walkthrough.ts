import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/discord/channels.js";
import { getCommandMention } from "@lib/discord/commands.js";
import issueCategorySelector from "@components/issueCategorySelector.js";
import productSelector from "@components/productSelector.js";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Client,
  Colors,
  type Embed,
  EmbedBuilder,
  type GuildTextBasedChannel,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type PublicThreadChannel,
  SlashCommandBuilder,
  type StringSelectMenuBuilder,
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

// Resolves the resources for a product from the label shown in the data embed.
function resourcesForProduct(productLabel: string): ResourceLink[] {
  const option = productSelector.options.find(
    (o) => o.data.label === productLabel,
  );
  return (option && productResources[option.data.value ?? ""]) || [];
}

// The data embed tracks the walkthrough answers. Its fields line up with the
// walkthrough selectors (Category, Product, Platform) so each step fills the
// matching field in place.
export function buildDataEmbed(channelId: string) {
  return new EmbedBuilder().setTitle(`<#${channelId}>`).addFields([
    { name: "Category", value: "N/A", inline: true },
    { name: "Product", value: "N/A", inline: true },
    { name: "Platform", value: "N/A", inline: true },
    { name: "Logs", value: "Please post any relevant logs/error messages." },
  ]);
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
export function buildWalkthroughMessage(
  dataEmbed: EmbedBuilder,
  resourcesEmbed: EmbedBuilder | Embed,
  step?: { question: string; selector: StringSelectMenuBuilder },
) {
  const embeds: (EmbedBuilder | Embed)[] = [dataEmbed, resourcesEmbed];
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (step) {
    embeds.push(
      new EmbedBuilder().setColor(Colors.White).setDescription(step.question),
    );
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        step.selector,
      ),
    );
  }

  const resources = resourcesForProduct(
    dataEmbed.data.fields?.[1]?.value ?? "",
  );
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
      buildDataEmbed(channel.id),
      await buildResourcesEmbed(channel.client),
      {
        question: "What are you creating this issue for?",
        selector: issueCategorySelector,
      },
    );

    // Send the walkthrough message (or reply to the user if they're running the command)
    if (interaction) {
      // If the bot has sent a message that contains an embed in the first 30 messages, then we assume it's the walkthrough message
      const firstMessage = await threadChannel.fetchStarterMessage();
      const existingWalkthrough = await threadChannel.messages
        .fetch({ around: firstMessage.id, limit: 30 })
        .then((messages) =>
          messages
            .filter(
              (message) =>
                message.author.id === interaction.client.user.id &&
                message.embeds.length > 0,
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
