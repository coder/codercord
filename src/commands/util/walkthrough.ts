import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/channels.js";
import issueCategorySelector from "@components/issueCategorySelector.js";

import {
  type ChatInputCommandInteraction, SlashCommandBuilder,
  ActionRowBuilder, type StringSelectMenuBuilder, EmbedBuilder, type Embed, Colors,
  type PublicThreadChannel,
  type GuildTextBasedChannel
} from "discord.js";

export function generateMessage(question: string, component: StringSelectMenuBuilder, embeds: (EmbedBuilder | Embed)[] = []) {
  return {
    embeds: [
      ...embeds,
      new EmbedBuilder()
        .setColor(Colors.White)
        .setDescription(question)
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(component),
    ]
  }
}

export async function doWalkthrough(channel: GuildTextBasedChannel, interaction?: ChatInputCommandInteraction) {
  if (await isHelpThread(channel)) {
    const threadChannel = channel as PublicThreadChannel; // necessary type cast, isHelpThread does the check already

    // Check for tags in the forum post
    if (!threadChannel.appliedTags || threadChannel.appliedTags.length === 0) {
      threadChannel.setAppliedTags([config.helpChannel.openedTag]);
    }

    // Generate the message with the action row
    const message = generateMessage("What are you creating this issue for?", issueCategorySelector);

    if(interaction) {
      // TODO: check if walkthrough has already been sent
      return interaction.reply(message);
    } else {
      return channel.send(message);
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("walkthrough")
    .setDescription("Sends the walkthrough message in case the bot didn't automatically send it."),

  async execute(interaction: ChatInputCommandInteraction) {
    const interactionChannel = await interaction.client.channels.fetch(interaction.channelId) as GuildTextBasedChannel;

    return doWalkthrough(interactionChannel);
  }
};
