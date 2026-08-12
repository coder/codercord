import { config } from "@lib/config.js";
import {
  getChannelFromInteraction,
  isHelpPost,
} from "@lib/discord/channels.js";
import { reconcileThread } from "@lib/discord/help.js";

import {
  type ChatInputCommandInteraction,
  type ThreadChannel,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("update-thread")
    .setDescription(
      "Re-sync this help post's waiting tag with the last message",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const channel = await getChannelFromInteraction(interaction);

    if (!(await isHelpPost(channel))) {
      await interaction.reply({
        content: `You can only run this command in a <#${config.helpChannel.id}> post.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "You do not have permission to run this command.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await reconcileThread(channel as ThreadChannel);

    await interaction.reply({
      content: "Updated this post's waiting tag.",
      flags: [MessageFlags.Ephemeral],
    });
  },
};
