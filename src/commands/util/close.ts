import { config } from "@lib/config.js";

import {
  canMemberInteractWithThread,
  getChannelFromInteraction,
  isHelpPost,
} from "@lib/channels.js";

import {
  type ThreadChannel,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

// TODO: find a better way to do this
const getStateWord = (close) => (close ? "closed" : "reopened");
const getStateVerb = (close) => (close ? "close" : "reopen");

export async function handleIssueState(
  interaction: ChatInputCommandInteraction,
  close = true,
  lock = false,
) {
  const threadChannel = (await getChannelFromInteraction(
    interaction,
  )) as ThreadChannel;

  const stateWord = getStateWord(close);
  const stateVerb = getStateVerb(close);

  const tagToAdd = close
    ? config.helpChannel.closedTag
    : config.helpChannel.openedTag;
  const tagToRemove = close
    ? config.helpChannel.openedTag
    : config.helpChannel.closedTag;

  const postTags = threadChannel.appliedTags;

  try {
    // Update tags
    if (!postTags.includes(tagToAdd)) {
      postTags.push(tagToAdd);
    }

    if (postTags.includes(tagToRemove)) {
      postTags.splice(postTags.indexOf(tagToRemove), 1);
    }

    await threadChannel.setAppliedTags(postTags, "Thread lifecycle");

    await interaction.reply({
      content: `${interaction.user.toString()} ${stateWord} ${lock ? "and locked " : ""}the thread.`,
      flags: [MessageFlags.SuppressNotifications],
    });

    // Archive/lock the thread if necessary (it seems we can't lock a thread if it's already been archived)
    if (close && !threadChannel.archived) {
      try {
        if (lock) {
          await threadChannel.setLocked(lock);
        } else {
          await threadChannel.setArchived(true);
        }
      } catch (err) {
        console.error("Error archiving thread:", err);
      }
    }
  } catch (e) {
    await interaction.reply({
      content: `Could not ${stateVerb} the thread because of an unexpected error.`,
      ephemeral: true,
    });
  }
}

export async function handleIssueStateCommand(
  interaction: ChatInputCommandInteraction,
  close: boolean,
  lock = false,
) {
  const interactionChannel = await getChannelFromInteraction(interaction);
  const stateVerb = getStateVerb(close);

  // Check if thread is a help post and if user can interact
  if (await isHelpPost(interactionChannel)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (
      await canMemberInteractWithThread(
        interaction.channel as ThreadChannel,
        member,
      )
    ) {
      return handleIssueState(interaction, close, lock);
    } else {
      await interaction.reply({
        content: `You cannot ${stateVerb} this thread since you are not the OP.`,
        ephemeral: true,
      });
    }
  } else {
    await interaction.reply({
      content: `You can only run this command in a <#${config.helpChannel.id}> post.`,
      ephemeral: true,
    });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Closes your post")
    .addBooleanOption((option) =>
      option.setName("lock").setDescription("Whether to lock the post or not"),
    ),

  execute: (interaction: ChatInputCommandInteraction) =>
    handleIssueStateCommand(
      interaction,
      true,
      interaction.options.getBoolean("lock"),
    ),
};
