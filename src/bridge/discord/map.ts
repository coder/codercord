import type { Message as DiscordMessage } from "discord.js";

import { config } from "@lib/config.js";
import type { HelpThread } from "@lib/discord/helpThread.js";

import type {
  Attachment,
  Author,
  CustomEmoji,
  Message,
  Post,
  Reaction,
  SourceAttachment,
} from "@bridge/core/model.js";
import {
  dedupeReferences,
  discordThreadReferences,
  githubReferences,
  type Reference,
} from "@bridge/core/references.js";

const SOURCE = "discord" as const;

// Maps a Discord forum post onto the canonical Post. Attachments are not
// composed into the body: the opening message becomes the issue description as
// text only, matching the hub's existing shape.
export async function toPost(
  help: HelpThread,
  starter: DiscordMessage | null,
): Promise<Post> {
  const content = starter?.content ?? "";
  return {
    ref: { source: SOURCE, id: help.thread.id, url: help.url },
    title: help.title,
    body: starter ? (await renderText(starter)).trim() : "",
    author: starter ? authorOf(starter) : undefined,
    customEmojis: customEmojisIn(content),
    references: referencesOf(content),
    labels: help.tags,
    lifecycle: help.isClosed ? "closed" : "open",
    waiting: help.waiting,
    closedAt: help.closedAt,
    createdAt: starter?.createdAt,
    attachment: attachmentOf(help),
    openNote: `(open in [Discord Desktop](discord://-/channels/${config.serverId}/${help.thread.id}))`,
  };
}

// Maps a Discord message onto the canonical Message (never the starter, which is
// represented by the Post).
export async function toMessage(message: DiscordMessage): Promise<Message> {
  const content = message.content ?? "";
  return {
    ref: { source: SOURCE, id: message.id, url: message.url },
    author: authorOf(message),
    text: await renderText(message),
    attachments: attachmentsOf(message),
    customEmojis: customEmojisIn(content),
    references: referencesOf(content),
    replyToId: message.reference?.messageId,
    createdAt: message.createdAt,
  };
}

// Whether a message is the forum starter (its id equals the thread id).
export function isStarter(message: DiscordMessage): boolean {
  return message.id === message.channelId;
}

// Maps a Discord emoji onto a hub reaction: a registered discord-<id> shortcode
// for custom emojis (which the hub must register first), or the unicode
// character for standard ones.
export function toReaction(emoji: {
  id: string | null;
  name: string | null;
  animated?: boolean | null;
}): Reaction {
  if (emoji.id) {
    return {
      key: `discord-${emoji.id}`,
      custom: { id: emoji.id, animated: emoji.animated ?? false },
    };
  }
  return { key: emoji.name ?? "" };
}

// Message text with mentions and custom emojis resolved for the hub.
async function renderText(message: DiscordMessage): Promise<string> {
  return resolveEmojis(await resolveMentions(message));
}

// Resolves user and role mentions the hub can't resolve from ids. User mentions
// become a link to the Discord profile; role mentions become @name. Channel
// mentions are left for reference linking. The message's own mention collections
// are unreliable for backfilled/edited messages, so ids are resolved from cache
// and fetched as a fallback.
async function resolveMentions(message: DiscordMessage): Promise<string> {
  const content = message.content ?? "";

  const users = new Map<string, string>();
  for (const m of content.matchAll(/<@!?(\d+)>/g)) {
    const id = m[1];
    if (users.has(id)) continue;
    const name = await userName(message, id);
    if (name) users.set(id, name);
  }

  const roles = new Map<string, string>();
  for (const m of content.matchAll(/<@&(\d+)>/g)) {
    const id = m[1];
    if (roles.has(id)) continue;
    const name = await roleName(message, id);
    if (name) roles.set(id, name);
  }

  return content
    .replace(/<@!?(\d+)>/g, (m, id) =>
      users.has(id)
        ? `[@${users.get(id)}](https://discord.com/users/${id})`
        : m,
    )
    .replace(/<@&(\d+)>/g, (m, id) =>
      roles.has(id) ? `@${roles.get(id)}` : m,
    );
}

// Guild display name (nickname) if resolvable, else the global username.
async function userName(
  message: DiscordMessage,
  id: string,
): Promise<string | null> {
  const member =
    message.mentions.members?.get(id) ??
    message.guild?.members.cache.get(id) ??
    (await message.guild?.members.fetch(id).catch(() => null));
  if (member) return member.displayName;

  const user =
    message.mentions.users.get(id) ??
    message.client.users.cache.get(id) ??
    (await message.client.users.fetch(id).catch(() => null));
  return user?.username ?? null;
}

async function roleName(
  message: DiscordMessage,
  id: string,
): Promise<string | null> {
  const role =
    message.mentions.roles.get(id) ??
    message.guild?.roles.cache.get(id) ??
    (await message.guild?.roles.fetch(id).catch(() => null));
  return role?.name ?? null;
}

// Rewrites custom emojis (<:name:id>, <a:name:id>) as :discord-<id>: shortcodes
// that resolve to the registered hub emojis.
function resolveEmojis(content: string): string {
  return content.replace(/<a?:\w+:(\d+)>/g, (_m, id) => `:discord-${id}:`);
}

function customEmojisIn(content: string): CustomEmoji[] {
  const seen = new Set<string>();
  const emojis: CustomEmoji[] = [];
  for (const [, animated, id] of content.matchAll(/<(a?):\w+:(\d+)>/g)) {
    if (seen.has(id)) continue;
    seen.add(id);
    emojis.push({ id, animated: animated === "a" });
  }
  return emojis;
}

function attachmentsOf(message: DiscordMessage): Attachment[] {
  return [...message.attachments.values()].map((a) => ({
    name: a.name,
    url: a.url,
    contentType: a.contentType,
    isImage: a.contentType?.startsWith("image/") ?? false,
  }));
}

function referencesOf(content: string): Reference[] {
  return dedupeReferences([
    ...githubReferences(content),
    ...discordThreadReferences(content, config.serverId),
  ]);
}

function authorOf(message: DiscordMessage): Author {
  const handle = message.author.username;
  const displayName =
    message.member?.displayName ?? message.author.displayName ?? handle;
  return {
    name: displayName === handle ? handle : `${displayName} (${handle})`,
    iconUrl:
      message.member?.displayAvatarURL() ?? message.author.displayAvatarURL(),
  };
}

function attachmentOf(help: HelpThread): SourceAttachment {
  return {
    title: "Discord thread",
    subtitle: subtitle(help),
    metadata: {
      threadId: help.thread.id,
      tagIds: help.tags.map((t) => t.id),
      tagNames: help.tags.map((t) => t.name),
      status: help.status,
      waiting: help.waiting,
    },
  };
}

function subtitle(help: HelpThread): string {
  const parts = ["#help"];
  if (help.isClosed) parts.push("closed");
  if (help.waiting) parts.push(`waiting: ${help.waiting}`);
  if (help.tags.length > 0) {
    parts.push(`tags: ${help.tags.map((t) => t.name).join(", ")}`);
  }
  return parts.join(" - ");
}
