import { config } from "@lib/config.js";

import type { Author, ExternalRef, Message, Post } from "@bridge/core/model.js";
import { composeBody } from "@bridge/core/model.js";
import type {
  IssueState,
  LinkedIssue,
  ReactionTarget,
  Target,
} from "@bridge/core/connector.js";

import {
  addReaction,
  removeReaction,
  type ReactionTarget as LinearReactionTarget,
} from "./reactions.js";
import {
  createThreadAttachment,
  findThreadMapping,
  upsertThreadAttachment,
  type ThreadAttachmentFields,
} from "./attachments.js";
import {
  createIssue,
  deleteIssue,
  getIssueRef,
  reconcileIssue,
  relateIssues,
  resolveIssueByUrl,
  setIssueDescription,
} from "./issues.js";
import {
  addComment,
  deleteComment,
  editComment,
  findCommentByMessage,
  mirroredMessageIds,
  resolveReplyParent,
} from "./comments.js";
import { getIssueState, setIssueState } from "./state.js";
import { ensureLabel, setNamespacedLabels } from "./labels.js";
import { ensureEmoji } from "./emojis.js";
import { uploadFile } from "./assets.js";

// Linear as the hub store, adapting the source-agnostic model onto the Linear
// SDK modules. Attachment shape, comment markers and timestamps are kept
// byte-compatible with issues already mirrored into Linear.
export class LinearConnector implements Target {
  findIssueId(ref: ExternalRef): Promise<string | null> {
    return findThreadMapping(ref.url).then((m) => m?.issueId ?? null);
  }

  async ensureIssue(post: Post): Promise<string> {
    const mapping = await findThreadMapping(post.ref.url);
    if (mapping) return mapping.issueId;

    const issueId = await createIssue({
      title: post.title,
      description: post.body,
      author: this.attribution(post.author),
      createdAt: post.createdAt,
    });
    await createThreadAttachment(issueId, this.attachment(post));
    return issueId;
  }

  async deleteIssue(ref: ExternalRef): Promise<void> {
    const mapping = await findThreadMapping(ref.url);
    if (mapping) await deleteIssue(mapping.issueId);
  }

  async reconcile(issueId: string, post: Post): Promise<void> {
    await upsertThreadAttachment(issueId, this.attachment(post));
    await reconcileIssue(issueId, post.title);
    await this.syncLabels(issueId, post);
  }

  async syncLabels(issueId: string, post: Post): Promise<void> {
    if (!config.linearBridge.labels.enabled) return;
    const prefix = `${config.linearBridge.labels.namespace} > `;
    const desiredIds: string[] = [];
    for (const label of post.labels) {
      desiredIds.push(await ensureLabel(`${prefix}${label.name}`, label.id));
    }
    await setNamespacedLabels(issueId, prefix, desiredIds);
  }

  setDescription(issueId: string, text: string): Promise<void> {
    return setIssueDescription(issueId, text);
  }

  async updateDescription(issueId: string, message: Message): Promise<void> {
    await this.ensureEmojis(message);
    await setIssueDescription(issueId, await this.renderBody(message));
  }

  async addComment(
    issueId: string,
    message: Message,
    parentId?: string,
  ): Promise<void> {
    await this.ensureEmojis(message);
    const fast = composeBody(message.text, message.attachments, (a) => a.url);
    await addComment(
      issueId,
      fast,
      this.attribution(message.author),
      { source: message.ref.source, id: message.ref.id },
      parentId,
      message.createdAt,
    );

    // Attachments mirror instantly as CDN links (which expire), then the comment
    // is edited to swap in permanent Linear-hosted URLs.
    if (message.attachments.length > 0) {
      await editComment(
        issueId,
        { source: message.ref.source, id: message.ref.id },
        await this.renderBody(message),
      );
    }
  }

  async editComment(issueId: string, message: Message): Promise<boolean> {
    await this.ensureEmojis(message);
    return editComment(
      issueId,
      { source: message.ref.source, id: message.ref.id },
      await this.renderBody(message),
    );
  }

  deleteComment(issueId: string, ref: ExternalRef): Promise<boolean> {
    return deleteComment(issueId, { source: ref.source, id: ref.id });
  }

  mirroredMessageIds(issueId: string): Promise<Set<string>> {
    return mirroredMessageIds(issueId);
  }

  resolveReplyParent(
    issueId: string,
    messageId: string,
  ): Promise<string | null> {
    return resolveReplyParent(issueId, messageId);
  }

  findCommentId(issueId: string, messageId: string): Promise<string | null> {
    return findCommentByMessage(issueId, messageId);
  }

  note(issueId: string, body: string, createdAt?: Date): Promise<void> {
    return addComment(
      issueId,
      body,
      undefined,
      undefined,
      undefined,
      createdAt,
    );
  }

  getState(issueId: string): Promise<IssueState | null> {
    return getIssueState(issueId);
  }

  setState(
    issueId: string,
    type: "completed" | "triage" | "started",
    name?: string,
  ): Promise<void> {
    return setIssueState(issueId, type, name);
  }

  async addReaction(
    target: ReactionTarget,
    reaction: { key: string; custom?: { id: string; animated: boolean } },
  ): Promise<void> {
    if (reaction.custom) {
      await ensureEmoji(reaction.custom.id, reaction.custom.animated);
    }
    await addReaction(target as LinearReactionTarget, reaction.key);
  }

  removeReaction(
    target: ReactionTarget,
    reaction: { key: string },
  ): Promise<void> {
    return removeReaction(target as LinearReactionTarget, reaction.key);
  }

  resolveByUrl(url: string): Promise<LinkedIssue | null> {
    return resolveIssueByUrl(url);
  }

  relate(issueId: string, otherId: string): Promise<void> {
    return relateIssues(issueId, otherId);
  }

  issueRef(issueId: string): Promise<{ identifier: string; url: string }> {
    return getIssueRef(issueId);
  }

  // Body with attachments re-hosted in Linear for permanence, falling back to
  // the CDN URL for any upload that fails.
  private async renderBody(message: Message): Promise<string> {
    const assetByUrl = new Map<string, string>();
    for (const a of message.attachments) {
      const asset = await uploadFile(a.url, a.name, a.contentType);
      if (asset) assetByUrl.set(a.url, asset);
    }
    return composeBody(
      message.text,
      message.attachments,
      (a) => assetByUrl.get(a.url) ?? a.url,
    );
  }

  private async ensureEmojis(message: Message): Promise<void> {
    for (const e of message.customEmojis) await ensureEmoji(e.id, e.animated);
  }

  private attachment(post: Post): ThreadAttachmentFields {
    return {
      url: post.ref.url,
      title: post.attachment.title,
      subtitle: post.attachment.subtitle,
      metadata: post.attachment.metadata,
    };
  }

  // External-author attribution, gated by createAsUser (a personal API key
  // rejects these fields, so they're dropped when the mode is off).
  private attribution(author?: Author): Author | undefined {
    return config.linearBridge.createAsUser ? author : undefined;
  }
}
