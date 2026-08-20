import { config } from "@lib/config.js";
import { isTeamMember } from "@lib/discord/users.js";

import {
  type Client,
  type GuildMember,
  type Message,
  type ThreadChannel,
  ChannelType,
  MessageType,
} from "discord.js";

// Message types that represent an actual interaction from a person, as opposed
// to system notices (pins, joins, etc).
const humanMessageTypes = new Set([MessageType.Default, MessageType.Reply]);

export function isHumanMessage(message: Message): boolean {
  return !message.author.bot && humanMessageTypes.has(message.type);
}

// Picks the waiting tag for a help post. A post waits on the user once the team
// has the last word, and waits on the team otherwise. Adding one always removes
// the other.
export async function applyWaitingTag(
  thread: ThreadChannel,
  awaitingUser: boolean,
): Promise<void> {
  const { waitingForUserTag, waitingForTeamTag, closedTag } =
    config.helpChannel;

  // Leave closed posts untouched.
  if (thread.appliedTags.includes(closedTag)) return;

  const desired = awaitingUser ? waitingForUserTag : waitingForTeamTag;
  const opposite = awaitingUser ? waitingForTeamTag : waitingForUserTag;

  const alreadyCorrect =
    thread.appliedTags.includes(desired) &&
    !thread.appliedTags.includes(opposite);
  if (alreadyCorrect) return;

  // Forum posts allow at most 5 tags. Keep the desired tag and drop the
  // opposite one, trimming any overflow from the least recent tags.
  const nextTags = [
    desired,
    ...thread.appliedTags.filter((t) => t !== desired && t !== opposite),
  ].slice(0, 5);

  await thread.setAppliedTags(nextTags, "Help post waiting state");
}

export async function resolveMember(
  message: Message,
): Promise<GuildMember | null> {
  if (message.member) return message.member;

  try {
    return (await message.guild?.members.fetch(message.author.id)) ?? null;
  } catch {
    return null;
  }
}

// Applies the waiting tag for a help post based on who sent the given message.
// A post only waits on the user when the last message is from a team member who
// is not the OP; a team member asking their own question still waits on the
// team, as does any message from the OP or a community member.
async function applyWaitingTagFromMessage(
  thread: ThreadChannel,
  message: Message,
): Promise<void> {
  const member = await resolveMember(message);
  const fromTeam = member ? isTeamMember(member) : false;
  const isOp = message.author.id === thread.ownerId;
  await applyWaitingTag(thread, fromTeam && !isOp);
}

// Reconciles a single help post from a freshly received message.
export async function reconcileFromMessage(message: Message): Promise<void> {
  if (!isHumanMessage(message)) return;
  await applyWaitingTagFromMessage(message.channel as ThreadChannel, message);
}

// Reconciles a help post by inspecting its most recent human message.
export async function reconcileThread(thread: ThreadChannel): Promise<void> {
  const messages = await thread.messages.fetch({ limit: 10 });
  const lastHuman = messages.find(isHumanMessage);
  if (!lastHuman) return;
  await applyWaitingTagFromMessage(thread, lastHuman);
}

// On startup, reconcile the most recently active open help posts so their
// waiting tag reflects the last interaction even if messages were missed while
// the bot was offline.
export async function catchUpHelpPosts(client: Client): Promise<void> {
  const forum = await client.channels.fetch(config.helpChannel.id);
  if (!forum || forum.type !== ChannelType.GuildForum) return;

  const { threads } = await forum.threads.fetchActive();

  const openPosts = [...threads.values()]
    .filter((t) => !t.appliedTags.includes(config.helpChannel.closedTag))
    .sort((a, b) =>
      (b.lastMessageId ?? "").localeCompare(a.lastMessageId ?? ""),
    )
    .slice(0, config.startupCatchupLimit);

  for (const thread of openPosts) {
    try {
      await reconcileThread(thread);
    } catch (err) {
      console.error("[help]", "failed to reconcile post", thread.id, err);
    }
  }
}
