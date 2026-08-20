// Extracts cross-references from mirrored content: links to other conversations
// or external issues that may already map to a hub issue. The extractors are
// source-agnostic so every connector can reuse them; the orchestrator resolves
// each reference against the hub and rewrites it to a hub issue link.

import type { Reference } from "@bridge/core/model.js";

export type { Reference };

// GitHub issue and pull request references (full URLs).
export function githubReferences(content: string): Reference[] {
  const re = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+/g;
  return [...content.matchAll(re)].map((m) => ({ url: m[0], token: m[0] }));
}

// Discord thread references: channel mentions (<#id>) and message/thread URLs,
// normalized to the canonical thread URL for the guild.
export function discordThreadReferences(
  content: string,
  guildId: string,
): Reference[] {
  const refs: Reference[] = [];
  for (const m of content.matchAll(/<#(\d+)>/g)) {
    refs.push({ token: m[0], url: threadUrl(guildId, m[1]) });
  }
  const urlRe =
    /https?:\/\/(?:\w+\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)(?:\/\d+)?/g;
  for (const m of content.matchAll(urlRe)) {
    refs.push({ token: m[0], url: threadUrl(m[1], m[2]) });
  }
  return refs;
}

function threadUrl(guildId: string, threadId: string): string {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

// Removes duplicate references that share a token, keeping the first.
export function dedupeReferences(refs: Reference[]): Reference[] {
  const byToken = new Map<string, Reference>();
  for (const ref of refs) {
    if (!byToken.has(ref.token)) byToken.set(ref.token, ref);
  }
  return [...byToken.values()];
}
