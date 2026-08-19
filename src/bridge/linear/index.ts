import { config } from "@lib/config.js";
import type { HelpThread } from "@lib/discord/helpThread.js";

import type { Message } from "discord.js";

import * as linear from "./api.js";

// Caches the create/lookup promise per thread so concurrent listeners resolve
// to a single issue instead of racing to create duplicates.
const issueByThread = new Map<string, Promise<string>>();

// Mirrors a single #help thread onto its Linear issue. Wrap a HelpThread and
// call the mirror methods; issue lookup/creation is deduped per thread.
export class LinearMirror {
  constructor(private readonly help: HelpThread) {}

  async ensureIssue(): Promise<string> {
    const { id } = this.help.thread;
    const cached = issueByThread.get(id);
    if (cached) return cached;

    const pending = this.findOrCreateIssue();
    issueByThread.set(id, pending);
    try {
      return await pending;
    } catch (err) {
      issueByThread.delete(id);
      throw err;
    }
  }

  // Mirrors a newly created thread: issue (with the opening post as its body),
  // linking attachment, and labels.
  async create(): Promise<void> {
    const issueId = await this.ensureIssue();
    await this.syncLabels(issueId);
  }

  // Mirrors a thread message as an issue comment.
  async addMessage(message: Message): Promise<void> {
    // The forum starter message is the issue description, not a comment; its id
    // equals the thread id for forum posts.
    if (message.id === this.help.thread.id) return;

    const content = message.content?.trim();
    if (!content) return;

    const issueId = await this.ensureIssue();
    const parentId = await this.replyParent(issueId, message);
    await linear.addComment(
      issueId,
      content,
      this.author(message),
      message.id,
      parentId,
    );
  }

  // Reflects a Discord message edit onto its mirrored comment, or the issue
  // description for the opening post. No-op if the thread isn't mirrored.
  async editMessage(message: Message): Promise<void> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (!mapping) return;

    const content = message.content?.trim() ?? "";
    if (message.id === this.help.thread.id) {
      await linear.setIssueDescription(mapping.issueId, content);
    } else if (content) {
      await linear.editComment(mapping.issueId, message.id, content);
    }
  }

  // Deletes the mirrored comment for a deleted Discord message. The opening
  // post maps to the description, so it is left untouched here.
  async deleteMessage(messageId: string): Promise<void> {
    if (messageId === this.help.thread.id) return;
    const mapping = await linear.findThreadMapping(this.help.url);
    if (mapping) await linear.deleteComment(mapping.issueId, messageId);
  }

  // Refreshes the attachment metadata and labels, then moves the issue between
  // Done and Triage to match the thread. Transitions are decided against the
  // Linear issue state, not a Discord old/new diff, so bot-initiated closes
  // (e.g. the /close command) are detected reliably.
  async syncStatus(): Promise<void> {
    const issueId = await this.ensureIssue();
    await linear.upsertThreadAttachment(issueId, this.attachment());
    await this.syncLabels(issueId);

    const stateType = await linear.getIssueStateType(issueId);
    if (this.help.isClosed && stateType !== "completed") {
      await linear.setIssueState(issueId, "completed");
      await linear.addComment(issueId, "_Thread closed on Discord._");
    } else if (this.help.isOpen && stateType === "completed") {
      await linear.setIssueState(issueId, "triage");
      await linear.addComment(issueId, "_Thread reopened on Discord._");
    }
  }

  // Trashes the mirrored issue when its Discord thread is deleted.
  async delete(): Promise<void> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (mapping) await linear.deleteIssue(mapping.issueId);
    issueByThread.delete(this.help.thread.id);
  }

  private async findOrCreateIssue(): Promise<string> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (mapping) return mapping.issueId;

    // The opening post is the issue body, and its author owns the issue.
    const starter = await this.help.thread
      .fetchStarterMessage()
      .catch(() => null);

    const issueId = await linear.createIssue({
      title: this.help.title,
      description: starter?.content?.trim() ?? "",
      author: this.author(starter),
    });
    await linear.createThreadAttachment(issueId, this.attachment());
    return issueId;
  }

  // Reconciles the issue's group labels to match the thread's current tags.
  private async syncLabels(issueId: string): Promise<void> {
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
    for (const tag of this.help.tags) {
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

  private attachment(): linear.ThreadAttachmentFields {
    return {
      url: this.help.url,
      title: "Discord thread",
      subtitle: this.subtitle(),
      metadata: {
        threadId: this.help.thread.id,
        tagIds: this.help.tags.map((t) => t.id),
        tagNames: this.help.tags.map((t) => t.name),
        status: this.help.status,
        waiting: this.help.waiting,
      },
    };
  }

  private subtitle(): string {
    const parts = ["#help"];
    if (this.help.isClosed) parts.push("closed");
    if (this.help.waiting) parts.push(`waiting: ${this.help.waiting}`);
    if (this.help.tags.length > 0) {
      parts.push(`tags: ${this.help.tags.map((t) => t.name).join(", ")}`);
    }
    return parts.join(" - ");
  }

  // Resolves the parent Linear comment for a Discord reply, when the referenced
  // message was mirrored as a comment. Returns undefined otherwise (e.g. a
  // reply to the opening post, which is the issue description).
  private async replyParent(
    issueId: string,
    message: Message,
  ): Promise<string | undefined> {
    const referencedId = message.reference?.messageId;
    if (!referencedId) return undefined;
    return (
      (await linear.resolveReplyParent(issueId, referencedId)) ?? undefined
    );
  }

  // External-author fields for app-actor attribution, or undefined when the
  // mode is off or the author is unknown. A personal API key rejects these.
  private author(
    message: Message | null,
  ): { name: string; iconUrl?: string } | undefined {
    if (!config.linearBridge.createAsUser || !message) return undefined;
    return {
      name: message.member?.displayName ?? message.author.username,
      iconUrl:
        message.member?.displayAvatarURL() ?? message.author.displayAvatarURL(),
    };
  }
}
