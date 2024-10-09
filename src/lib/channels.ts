import { config } from "@lib/config.js";

import { type ChatInputCommandInteraction, ChannelType, type ThreadChannel, type User, Channel, GuildChannel, Guild, GuildTextBasedChannel } from "discord.js";

export async function getChannelFromInteraction(interaction: ChatInputCommandInteraction): Promise<GuildTextBasedChannel> {
    return interaction.channel ?? (interaction.client.channels.fetch(interaction.channelId) as Promise<GuildTextBasedChannel>);
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
    return (await isForumPost(channel)) && channel.parent.id == config.helpChannel.id;
}

export async function canUserInteractWithThread(channel: ThreadChannel, user: User) {
    /*const threadChannel: ThreadChannel<true> = await interaction.client.channels.fetch(interaction.channelId) as ThreadChannel;

    const firstMessage = await threadChannel.fetchStarterMessage();*/

    // TODO: actually check
    return true;
}