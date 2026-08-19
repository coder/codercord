import { config } from "@lib/config.js";
import type { HelpThread } from "@lib/discord/helpThread.js";

import type { Message } from "discord.js";

import * as linear from "./api.js";

// Caches the create/lookup promise per thread so concurrent listeners resolve
// to a single issue instead of racing to create duplicates.
const issueByThread = new Map<string, Promise<string>>();

function threadMetadata(help: HelpThread): Record<string, unknown> {
  return {
    threadId: help.thread.id,
    tagIds: help.tags.map((t) => t.id),
    tagNames: help.tags.map((t) => t.name),
    status: help.status,
    waiting: help.waiting,
  };
}

function attachmentSubtitle(help: HelpThread): string {
  const parts = ["#help"];
  if (help.status === "closed") parts.push("closed");
  if (help.waiting) parts.push(`waiting: ${help.waiting}`);
  if (help.tags.length > 0) {
    parts.push(`tags: ${help.tags.map((t) => t.name).join(", ")}`);
  }
  return parts.join(" - ");
}

function attachmentFields(help: HelpThread): linear.ThreadAttachmentFields {
  return {
    url: help.url,
    title: "Discord thread",
    subtitle: attachmentSubtitle(help),
    metadata: threadMetadata(help),
  };
}

function authorLabel(message: Message, isTeam: boolean): string {
  const name = message.member?.displayName ?? message.author.username;
  return isTeam ? `${name} (Coder team)` : name;
}

async function buildDescription(help: HelpThread): Promise<string> {
  const starter = await help.thread.fetchStarterMessage().catch(() => null);
  const body = starter?.content?.trim();
  const link = `[Discord thread](${help.url})`;
  return body ? `${body}\n\n${link}` : link;
}

// Ensures a Linear issue exists for a help thread, reusing an existing mapping
// (from the thread-URL attachment) or creating a new issue with its attachment.
export async function ensureIssueForThread(help: HelpThread): Promise<string> {
  const cached = issueByThread.get(help.thread.id);
  if (cached) return cached;

  const pending = (async () => {
    const mapping = await linear.findThreadMapping(help.url);
    if (mapping) return mapping.issueId;

    const issueId = await linear.createIssue({
      title: help.title,
      description: await buildDescription(help),
    });
    await linear.createThreadAttachment(issueId, attachmentFields(help));
    return issueId;
  })();

  issueByThread.set(help.thread.id, pending);
  try {
    return await pending;
  } catch (err) {
    issueByThread.delete(help.thread.id);
    throw err;
  }
}

// Reconciles the issue's group labels to match the thread's current tags.
async function syncLabels(issueId: string, help: HelpThread): Promise<void> {
  if (!config.linearBridge.labels.enabled) return;

  const groupId = await linear.ensureLabelGroup(
    config.linearBridge.labels.groupName,
  );
  const groupLabels = await linear.getGroupLabels(groupId);
  const byTagId = new Map<string, linear.GroupLabel>();
  for (const label of groupLabels) {
    if (label.description) byTagId.set(label.description, label);
  }

  const desiredIds: string[] = [];
  for (const tag of help.tags) {
    let label = byTagId.get(tag.id);
    if (!label) {
      label = await linear.createLabel({
        name: tag.name,
        tagId: tag.id,
        groupId,
      });
      byTagId.set(tag.id, label);
    } else if (label.name !== tag.name) {
      await linear.renameLabel(label.id, tag.name);
    }
    desiredIds.push(label.id);
  }

  const removedIds = groupLabels
    .map((l) => l.id)
    .filter((id) => !desiredIds.includes(id));

  await linear.setIssueGroupLabels(issueId, desiredIds, removedIds);
}

export async function mirrorThreadCreated(help: HelpThread): Promise<void> {
  const issueId = await ensureIssueForThread(help);
  await syncLabels(issueId, help);
}

export async function mirrorMessage(
  help: HelpThread,
  message: Message,
  isTeam: boolean,
): Promise<void> {
  // The forum starter message becomes the issue description, not a comment.
  // Its id equals the thread id for forum posts.
  if (message.id === help.thread.id) return;

  const content = message.content?.trim();
  if (!content) return;

  const issueId = await ensureIssueForThread(help);
  await linear.addComment(
    issueId,
    `**${authorLabel(message, isTeam)}**\n\n${content}`,
  );
}

export async function mirrorStatus(
  help: HelpThread,
  reason?: "closed" | "reopened",
): Promise<void> {
  const issueId = await ensureIssueForThread(help);

  await linear.upsertThreadAttachment(issueId, attachmentFields(help));
  await syncLabels(issueId, help);

  if (reason === "closed") {
    await linear.setIssueState(issueId, "completed");
    await linear.addComment(issueId, "_Thread closed on Discord._");
  } else if (reason === "reopened") {
    await linear.setIssueState(issueId, "started");
    await linear.addComment(issueId, "_Thread reopened on Discord._");
  }
}
