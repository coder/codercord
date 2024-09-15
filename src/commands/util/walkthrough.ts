import { config } from "lib/config.js";
import { messageData as issueCategorySelectorMessageData } from "components/issueCategorySelector.js";

import { ChannelType, type CommandInteraction, SlashCommandBuilder } from "discord.js";

async function doWalkthrough(interaction: CommandInteraction) {
  await interaction.client.channels.fetch(interaction.channelId);

  if (interaction.channel.type === ChannelType.PublicThread) {
    const parentChannel = await interaction.client.channels.fetch(interaction.channel.parentId);

    if (parentChannel.type === ChannelType.GuildForum) {
      // Check for tags in the forum post
      if (!interaction.channel.appliedTags || interaction.channel.appliedTags.length === 0) {
        interaction.channel.setAppliedTags([config.helpChannel.openedTag]);
      }

      /*const starterMessage = await interaction.channel.fetchStarterMessage();
      const firstMessages = await interaction.channel.messages.fetch({
        limit: 10,
        around: starterMessage.id
      });*/

      // Create the message with the action row and set the content
      await interaction.reply(issueCategorySelectorMessageData);
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("walkthrough")
    .setDescription("Sends the walkthrough message in case the bot didn't automatically send it."),

  execute: doWalkthrough
};
