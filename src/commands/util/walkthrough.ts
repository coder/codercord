import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/discord/channels.js";
import issueCategorySelector from "@components/issueCategorySelector.js";

import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  type StringSelectMenuBuilder,
  EmbedBuilder,
  type Embed,
  Colors,
  type PublicThreadChannel,
  type GuildTextBasedChannel,
  FetchMessageOptions,
} from "discord.js";

export function generateQuestion(
  question: string,
  component: StringSelectMenuBuilder,
  embeds: (EmbedBuilder | Embed)[] = [],
) {
  return {
    embeds: [
      ...embeds,
      new EmbedBuilder().setColor(Colors.White).setDescription(question),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(component),
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
    if (!threadChannel.appliedTags || threadChannel.appliedTags.length === 0) {
      threadChannel.setAppliedTags([config.helpChannel.openedTag]);
    }

    // Generate the message with the action row
    const message = generateQuestion(
      "What are you creating this issue for?",
      issueCategorySelector,
    );

    if (interaction) {
      // If the bot has sent a message that contains an embed in the first 30 messages, then we assume it's the walkthrough message
      const firstMessage = await threadChannel.fetchStarterMessage();
      const walkthroughMessage = await threadChannel.messages
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

      if (walkthroughMessage) {
        await interaction.reply({
          content: `You cannot run the walkthrough command because a walkthrough already exists in this channel.\n(${walkthroughMessage.url})`,
          ephemeral: true,
        });
      } else {
        return interaction.reply(message);
      }
    } else {
      return channel.send(message);
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
