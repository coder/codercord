import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/discord/channels.js";
import { buildWalkthroughStart } from "@ui/walkthrough.js";

import {
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  MessageFlags,
  type PublicThreadChannel,
  SlashCommandBuilder,
} from "discord.js";

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

    const walkthroughMessage = await buildWalkthroughStart(
      channel.client,
      channel.id,
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
