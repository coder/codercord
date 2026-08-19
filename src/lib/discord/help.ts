import { bus } from "@lib/bus.js";
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

// A Discord forum tag applied to a help post.
export interface HelpTag {
  id: string;
  name: string;
}

// Enriched snapshot of a help post, shared by the domain events.
export interface HelpThreadContext {
  thread: ThreadChannel;
  url: string;
  title: string;
  status: "open" | "closed";
  waiting: "user" | "team" | null;
  // Applied tags (minus open/closed), resolved to id + name.
  tags: HelpTag[];
}

// A help post message paired with its resolved author.
export interface HelpMessageContext {
  thread: ThreadChannel;
  message: Message;
  member: GuildMember | null;
  isTeam: boolean;
}

// A help post whose status or waiting state just changed.
export interface HelpThreadStatusContext extends HelpThreadContext {
  reason: "closed" | "reopened" | "waiting-changed";
}

// Resolves applied tag ids to id + name using the parent forum's tag list,
// dropping the open/closed lifecycle tags.
function resolveTags(thread: ThreadChannel): HelpTag[] {
  const forum = thread.parent;
  const available =
    forum && "availableTags" in forum ? forum.availableTags : [];
  const nameById = new Map(available.map((t) => [t.id, t.name]));

  const { closedTag, openedTag } = config.helpChannel;
  return thread.appliedTags
    .filter((id) => id !== closedTag && id !== openedTag)
    .map((id) => ({ id, name: nameById.get(id) ?? id }));
}

// Builds an enriched snapshot of a help post from its applied tags.
export function getHelpThreadContext(thread: ThreadChannel): HelpThreadContext {
  const { closedTag, waitingForTeamTag, waitingForUserTag } =
    config.helpChannel;
  const tags = thread.appliedTags;

  return {
    thread,
    url: thread.url,
    title: thread.name,
    status: tags.includes(closedTag) ? "closed" : "open",
    waiting: tags.includes(waitingForTeamTag)
      ? "team"
      : tags.includes(waitingForUserTag)
        ? "user"
        : null,
    tags: resolveTags(thread),
  };
}

// Emits a status-change event for a help post.
export function emitStatusChange(
  thread: ThreadChannel,
  reason: HelpThreadStatusContext["reason"],
): void {
  bus.emit("helpThreadStatusChanged", {
    ...getHelpThreadContext(thread),
    reason,
  });
}

// Message types that represent an actual interaction from a person, as opposed
// to system notices (pins, joins, etc).
const humanMessageTypes = new Set([MessageType.Default, MessageType.Reply]);

function isHumanMessage(message: Message): boolean {
  return !message.author.bot && humanMessageTypes.has(message.type);
}

// Picks the waiting tag for a help post based on who sent the last message.
// When the last interaction comes from a community member the team still needs
// to respond, so we apply waitingForTeamTag; when it comes from the Coder team
// we apply waitingForUserTag. Adding one always removes the other.
export async function applyWaitingTag(
  thread: ThreadChannel,
  lastFromTeam: boolean,
): Promise<void> {
  const { waitingForUserTag, waitingForTeamTag, closedTag } =
    config.helpChannel;

  // Leave closed posts untouched.
  if (thread.appliedTags.includes(closedTag)) return;

  const desired = lastFromTeam ? waitingForUserTag : waitingForTeamTag;
  const opposite = lastFromTeam ? waitingForTeamTag : waitingForUserTag;

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

  emitStatusChange(thread, "waiting-changed");
}

async function resolveMember(message: Message): Promise<GuildMember | null> {
  if (message.member) return message.member;

  try {
    return await message.guild?.members.fetch(message.author.id);
  } catch {
    return null;
  }
}

// Builds a message context for a human help-post message, resolving the author
// once. Returns null for bot/system messages.
export async function buildHelpMessageContext(
  message: Message,
): Promise<HelpMessageContext | null> {
  if (!isHumanMessage(message)) return null;

  const member = await resolveMember(message);
  return {
    thread: message.channel as ThreadChannel,
    message,
    member,
    isTeam: member ? isTeamMember(member) : false,
  };
}

// Applies the waiting tag for a help post based on who sent the given message.
async function applyWaitingTagFromMessage(
  thread: ThreadChannel,
  message: Message,
): Promise<void> {
  const member = await resolveMember(message);
  await applyWaitingTag(thread, member ? isTeamMember(member) : false);
}

// Reconciles a single help post from a freshly received message, returning the
// message context so callers can forward it to the domain bus.
export async function reconcileFromMessage(
  message: Message,
): Promise<HelpMessageContext | null> {
  const ctx = await buildHelpMessageContext(message);
  if (!ctx) return null;
  await applyWaitingTag(ctx.thread, ctx.isTeam);
  return ctx;
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
      console.error(`Failed to reconcile help post ${thread.id}:`, err);
    }
  }
}
