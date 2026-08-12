import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/discord/channels.js";
import { getCommandMention } from "@lib/discord/commands.js";
import issueCategorySelector from "@components/issueCategorySelector.js";

import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type Client,
  Colors,
  EmbedBuilder,
  type GuildTextBasedChannel,
  MessageFlags,
  type PublicThreadChannel,
  SlashCommandBuilder,
  type StringSelectMenuBuilder,
} from "discord.js";

type ResourceLink = { label: string; url: string };

// Documentation resources keyed by product. Products without an entry (for
// example code-server) simply get no resource links.
export const productResources: Record<string, ResourceLink[]> = {
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

// The data embed tracks the walkthrough answers. Its fields line up with the
// walkthrough selectors (Category, Product, Platform) so each step can fill the
// matching field in place.
export function buildDataEmbed(channelId: string) {
  return new EmbedBuilder().setTitle(`<#${channelId}>`).addFields([
    { name: "Category", value: "N/A", inline: true },
    { name: "Product", value: "N/A", inline: true },
    { name: "Platform", value: "N/A", inline: true },
    { name: "Logs", value: "Please post any relevant logs/error messages." },
  ]);
}

// The resources embed always points at the post lifecycle commands and grows a
// documentation link per product resource once the product is known.
export async function buildResourcesEmbed(
  client: Client,
  resources: ResourceLink[],
) {
  const embed = new EmbedBuilder()
    .setColor(Colors.White)
    .setDescription(
      `When your issue is resolved, use ${await getCommandMention(client, "close")} to close this issue. Use ${await getCommandMention(client, "reopen")} to reopen it if needed.`,
    );

  if (resources.length > 0) {
    embed.addFields(
      resources.map((resource) => ({
        name: resource.label,
        value: `[Docs](${resource.url})`,
        inline: true,
      })),
    );
  }

  return embed;
}

// A single walkthrough message: the data embed, the resources embed, the
// current question, and the current selector. Every step edits this same
// message instead of sending new ones.
export async function buildWalkthroughMessage(channel: GuildTextBasedChannel) {
  return {
    embeds: [
      buildDataEmbed(channel.id),
      await buildResourcesEmbed(channel.client, []),
      new EmbedBuilder()
        .setColor(Colors.White)
        .setDescription("What are you creating this issue for?"),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        issueCategorySelector,
      ),
    ],
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

    const walkthroughMessage = await buildWalkthroughMessage(channel);

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
