import { config } from "@lib/config.js";
import {
  getHelpThreadContext,
  type HelpMessageContext,
  type HelpThreadContext,
  type HelpThreadStatusContext,
} from "@lib/discord/help.js";

import * as linear from "./api.js";

// Caches the create/lookup promise per thread so concurrent events (e.g. thread
// creation racing with the initial waiting-tag change) resolve to one issue.
const issueByThread = new Map<string, Promise<string>>();

function threadMetadata(ctx: HelpThreadContext): Record<string, unknown> {
  return {
    threadId: ctx.thread.id,
    tagIds: ctx.tags.map((t) => t.id),
    tagNames: ctx.tags.map((t) => t.name),
    status: ctx.status,
    waiting: ctx.waiting,
  };
}

function attachmentSubtitle(ctx: HelpThreadContext): string {
  const parts = ["#help"];
  if (ctx.status === "closed") parts.push("closed");
  if (ctx.waiting) parts.push(`waiting: ${ctx.waiting}`);
  if (ctx.tags.length > 0) {
    parts.push(`tags: ${ctx.tags.map((t) => t.name).join(", ")}`);
  }
  return parts.join(" - ");
}

function authorLabel(ctx: HelpMessageContext): string {
  const name = ctx.member?.displayName ?? ctx.message.author.username;
  return ctx.isTeam ? `${name} (Coder team)` : name;
}

function attachmentFields(
  ctx: HelpThreadContext,
): linear.ThreadAttachmentFields {
  return {
    url: ctx.url,
    title: "Discord thread",
    subtitle: attachmentSubtitle(ctx),
    metadata: threadMetadata(ctx),
  };
}

async function buildDescription(ctx: HelpThreadContext): Promise<string> {
  const starter = await ctx.thread.fetchStarterMessage().catch(() => null);
  const body = starter?.content?.trim();
  const link = `[Discord thread](${ctx.url})`;
  return body ? `${body}\n\n${link}` : link;
}

// Ensures a Linear issue exists for a help thread, reusing an existing mapping
// (from the thread-URL attachment) or creating a new issue with its attachment.
export async function ensureIssueForThread(
  ctx: HelpThreadContext,
): Promise<string> {
  const cached = issueByThread.get(ctx.thread.id);
  if (cached) return cached;

  const pending = (async () => {
    const mapping = await linear.findThreadMapping(ctx.url);
    if (mapping) return mapping.issueId;

    const issueId = await linear.createIssue({
      title: ctx.title,
      description: await buildDescription(ctx),
    });
    await linear.createThreadAttachment(issueId, attachmentFields(ctx));
    return issueId;
  })();

  issueByThread.set(ctx.thread.id, pending);
  try {
    return await pending;
  } catch (err) {
    issueByThread.delete(ctx.thread.id);
    throw err;
  }
}

// Reconciles the issue's group labels to match the thread's current tags.
async function syncLabels(
  issueId: string,
  ctx: HelpThreadContext,
): Promise<void> {
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
  for (const tag of ctx.tags) {
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

export async function mirrorThreadCreated(
  ctx: HelpThreadContext,
): Promise<void> {
  const issueId = await ensureIssueForThread(ctx);
  await syncLabels(issueId, ctx);
}

export async function mirrorMessage(ctx: HelpMessageContext): Promise<void> {
  // The forum starter message becomes the issue description, not a comment.
  // Its id equals the thread id for forum posts.
  if (ctx.message.id === ctx.thread.id) return;

  const content = ctx.message.content?.trim();
  if (!content) return;

  const issueId = await ensureIssueForThread(getHelpThreadContext(ctx.thread));
  await linear.addComment(issueId, `**${authorLabel(ctx)}**\n\n${content}`);
}

export async function mirrorStatus(
  ctx: HelpThreadStatusContext,
): Promise<void> {
  const issueId = await ensureIssueForThread(ctx);

  await linear.upsertThreadAttachment(issueId, attachmentFields(ctx));
  await syncLabels(issueId, ctx);

  if (ctx.reason === "closed") {
    await linear.setIssueState(issueId, "completed");
    await linear.addComment(issueId, "_Thread closed on Discord._");
  } else if (ctx.reason === "reopened") {
    await linear.setIssueState(issueId, "started");
    await linear.addComment(issueId, "_Thread reopened on Discord._");
  }
}
