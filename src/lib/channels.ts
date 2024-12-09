import { config } from "@lib/config.js";

import {
  type ChatInputCommandInteraction,
  ChannelType,
  type ThreadChannel,
  type GuildTextBasedChannel,
  PermissionsBitField,
  type GuildMember,
} from "discord.js";

export async function getChannelFromInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<GuildTextBasedChannel> {
  return (
    interaction.channel ??
    (interaction.client.channels.fetch(
      interaction.channelId,
    ) as Promise<GuildTextBasedChannel>)
  );
}

async function isForumPost(channel: GuildTextBasedChannel) {
  // If the channel is a thread, then we check if its parent is a Forum channel, if it is, then we are in a forum post.
  if (channel.isThread()) {
    const parentChannel = await channel.client.channels.fetch(channel.parentId);

    return parentChannel.type === ChannelType.GuildForum;
  }

  return false;
}

export async function isHelpPost(channel: GuildTextBasedChannel) {
  return (
    (await isForumPost(channel)) && channel.parent.id === config.helpChannel.id
  );
}

export async function canMemberInteractWithThread(
  channel: ThreadChannel,
  member: GuildMember,
) {
  if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return true;
  } else {
    // Sometimes fetchOwner() will fail, so this is just a failsafe
    const owner =
      (await channel.fetchOwner())?.guildMember ??
      (await channel.fetchStarterMessage()).member;

    return member.id === owner.id;
  }
}
