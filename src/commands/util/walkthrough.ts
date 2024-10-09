import { config } from "@lib/config.js";
import issueCategorySelector from "@components/issueCategorySelector.js";

import { 
  ChannelType,
  type CommandInteraction, SlashCommandBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, type Embed, Colors
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
      await interaction.reply(generateMessage("What are you creating this issue for?", issueCategorySelector));
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("walkthrough")
    .setDescription("Sends the walkthrough message in case the bot didn't automatically send it."),

  execute: doWalkthrough
};
