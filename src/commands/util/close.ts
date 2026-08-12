import { config } from "@lib/config.js";

import {
  canMemberInteractWithThread,
  getChannelFromInteraction,
  isHelpPost,
} from "@lib/discord/channels.js";
import { getCommandMention } from "@lib/discord/commands.js";
import { orderAppliedTags } from "@lib/discord/tags.js";

import {
  type ThreadChannel,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

// TODO: find a better way to do this
const getStateWord = (close) => (close ? "closed" : "reopened");
const getStateVerb = (close) => (close ? "close" : "reopen");

export function getTagsForCloseState(close: boolean) {
  return {
    tagToAdd: close
      ? config.helpChannel.closedTag
      : config.helpChannel.openedTag,
    tagToRemove: close
      ? config.helpChannel.openedTag
      : config.helpChannel.closedTag,
  };
}

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

  const { tagToAdd, tagToRemove } = getTagsForCloseState(close);

  try {
    // Add the target state tag, drop its opposite, and reorder so status
    // tags follow the channel's configured order (open/closed first).
    const nextTags = orderAppliedTags(threadChannel, [
      ...threadChannel.appliedTags.filter((t) => t !== tagToRemove),
      tagToAdd,
    ]);

    await threadChannel.setAppliedTags(nextTags, "Thread lifecycle");

    const reopenHint =
      close && !lock
        ? ` You can reopen this issue by doing ${await getCommandMention(
            interaction.client,
            "reopen",
          )}.`
        : "";

    await interaction.reply({
      content: `${interaction.user.toString()} ${stateWord} ${lock ? "and locked " : ""}the thread.${reopenHint}`,
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
  } catch {
    await interaction.reply({
      content: `Could not ${stateVerb} the thread because of an unexpected error.`,
      flags: [MessageFlags.Ephemeral],
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
        flags: [MessageFlags.Ephemeral],
      });
    }
  } else {
    await interaction.reply({
      content: `You can only run this command in a <#${config.helpChannel.id}> issue.`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Closes your issue")
    .addBooleanOption((option) =>
      option.setName("lock").setDescription("Whether to lock the issue or not"),
    ),

  execute: (interaction: ChatInputCommandInteraction) =>
    handleIssueStateCommand(
      interaction,
      true,
      interaction.options.getBoolean("lock"),
    ),
};
