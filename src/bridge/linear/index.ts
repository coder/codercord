import { config } from "@lib/config.js";
import type { HelpThread } from "@lib/discord/helpThread.js";
import { resolveMember } from "@lib/discord/help.js";
import { isTeamMember } from "@lib/discord/users.js";

import {
  dedupeReferences,
  discordThreadReferences,
  githubReferences,
} from "@bridge/references.js";

import type { Attachment, Emoji, Message } from "discord.js";

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
    await this.linkStarterReferences(issueId);
  }

  // Mirrors a thread message as an issue comment.
  async addMessage(message: Message): Promise<void> {
    // The forum starter message is the issue description, not a comment; its id
    // equals the thread id for forum posts.
    if (message.id === this.help.thread.id) return;

    const content = message.content ?? "";
    await this.ensureEmojis(content);
    const rendered = this.body(message);
    if (!rendered) return;

    const issueId = await this.ensureIssue();
    const rewrites = await this.linkReferences(issueId, content);
    const parentId = await this.replyParent(issueId, message);
    await linear.addComment(
      issueId,
      this.applyRewrites(rendered, rewrites),
      this.author(message),
      message.id,
      parentId,
    );

    // Attachments mirror instantly as Discord CDN links (which expire), then the
    // comment is edited to swap in permanent Linear-hosted URLs.
    if (message.attachments.size > 0) {
      await linear.editComment(
        issueId,
        message.id,
        this.applyRewrites(await this.durableBody(message), rewrites),
      );
    }

    await this.markInProgressIfTeam(issueId, message);
  }

  // Moves the issue to In Progress when a Coder team member replies, unless the
  // thread is closed or the issue is already started or done.
  private async markInProgressIfTeam(
    issueId: string,
    message: Message,
  ): Promise<void> {
    if (this.help.isClosed) return;
    const member = await resolveMember(message);
    if (!member || !isTeamMember(member)) return;

    const stateType = await linear.getIssueStateType(issueId);
    if (stateType === "started" || stateType === "completed") return;
    await linear.setIssueState(issueId, "started");
  }

  // Reflects a Discord message edit onto its mirrored comment, or the issue
  // description for the opening post. No-op if the thread isn't mirrored.
  async editMessage(message: Message): Promise<void> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (!mapping) return;

    await this.ensureEmojis(message.content ?? "");
    const body =
      message.attachments.size > 0
        ? await this.durableBody(message)
        : this.body(message);
    if (message.id === this.help.thread.id) {
      await linear.setIssueDescription(mapping.issueId, body);
    } else if (body) {
      await linear.editComment(mapping.issueId, message.id, body);
    }
  }

  // Removes a deleted Discord message from Linear. Regular messages map to
  // comments; the opening post maps to the issue description, which is cleared.
  async deleteMessage(messageId: string): Promise<void> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (!mapping) {
      console.log(
        `[bridge] deleteMessage: no issue mapping for ${this.help.url}`,
      );
      return;
    }
    if (messageId === this.help.thread.id) {
      await linear.setIssueDescription(mapping.issueId, "");
      return;
    }
    const ok = await linear.deleteComment(mapping.issueId, messageId);
    console.log(`[bridge] deleteMessage msg=${messageId} deleted=${ok}`);
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

  // Mirrors a Discord reaction onto the mapped issue (opening post) or comment.
  async addReaction(message: Message, emoji: Emoji): Promise<void> {
    const target = await this.reactionTarget(message);
    if (target) await linear.addReaction(target, await this.emojiKey(emoji));
  }

  // Removes a previously mirrored reaction from its issue or comment.
  async removeReaction(message: Message, emoji: Emoji): Promise<void> {
    const target = await this.reactionTarget(message);
    if (target) await linear.removeReaction(target, await this.emojiKey(emoji));
  }

  // Resolves the Linear reaction target for a Discord message: the issue for the
  // opening post, otherwise its mirrored comment. Null when unmapped.
  private async reactionTarget(
    message: Message,
  ): Promise<linear.ReactionTarget | null> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (!mapping) return null;
    if (message.id === this.help.thread.id) {
      return { issueId: mapping.issueId };
    }
    const commentId = await linear.findCommentByMessage(
      mapping.issueId,
      message.id,
    );
    return commentId ? { commentId } : null;
  }

  // Maps a Discord emoji to a Linear reaction emoji: a registered discord-<id>
  // shortcode for custom emojis, or the unicode character for standard ones.
  private async emojiKey(emoji: Emoji): Promise<string> {
    if (emoji.id) {
      await linear.ensureEmoji(emoji.id, emoji.animated ?? false);
      return `discord-${emoji.id}`;
    }
    return emoji.name ?? "";
  }

  // Finds other threads or GitHub issues mentioned in the content that map to a
  // Linear issue, relates them to this issue, and returns token -> markdown link
  // rewrites that turn each mention into a link to the mapped issue.
  private async linkReferences(
    issueId: string,
    content: string,
  ): Promise<Map<string, string>> {
    const refs = dedupeReferences([
      ...githubReferences(content),
      ...discordThreadReferences(content, config.serverId),
    ]);

    const rewrites = new Map<string, string>();
    for (const ref of refs) {
      const target = await linear.resolveIssueByUrl(ref.url);
      if (!target || target.id === issueId) continue;
      await linear.relateIssues(issueId, target.id);
      rewrites.set(ref.token, `[${target.identifier}](${target.url})`);
    }
    return rewrites;
  }

  private applyRewrites(body: string, rewrites: Map<string, string>): string {
    for (const [token, replacement] of rewrites) {
      body = body.split(token).join(replacement);
    }
    return body;
  }

  // Links references found in the opening post and, if any resolved, rewrites
  // the issue description to point at the mapped issues.
  private async linkStarterReferences(issueId: string): Promise<void> {
    const starter = await this.help.thread
      .fetchStarterMessage()
      .catch(() => null);
    const content = starter?.content ?? "";
    const rewrites = await this.linkReferences(issueId, content);
    if (rewrites.size === 0) return;

    const description = this.applyRewrites(
      this.emojis(content).trim(),
      rewrites,
    );
    await linear.setIssueDescription(issueId, description);
  }

  private async findOrCreateIssue(): Promise<string> {
    const mapping = await linear.findThreadMapping(this.help.url);
    if (mapping) return mapping.issueId;

    // The opening post is the issue body, and its author owns the issue.
    const starter = await this.help.thread
      .fetchStarterMessage()
      .catch(() => null);

    const starterContent = starter?.content ?? "";
    await this.ensureEmojis(starterContent);
    const issueId = await linear.createIssue({
      title: this.help.title,
      description: this.emojis(starterContent).trim(),
      author: this.author(starter),
    });
    await linear.createThreadAttachment(issueId, this.attachment());
    return issueId;
  }

  // Reconciles the issue's group labels to match the thread's current tags.
  private async syncLabels(issueId: string): Promise<void> {
    if (!config.linearBridge.labels.enabled) return;
    try {
      await this.reconcileLabels(issueId);
    } catch (err) {
      console.error(
        "Linear bridge: label sync failed:",
        linear.linearError(err),
      );
    }
  }

  private async reconcileLabels(issueId: string): Promise<void> {
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

  // Renders a Discord message as markdown: its text plus attachments (images
  // inline, other files as links), resolving each attachment URL via urlFor.
  private render(message: Message, urlFor: (a: Attachment) => string): string {
    const parts: string[] = [];
    const text = this.emojis(message.content ?? "").trim();
    if (text) parts.push(text);
    for (const attachment of message.attachments.values()) {
      const link = `[${attachment.name}](${urlFor(attachment)})`;
      const isImage = attachment.contentType?.startsWith("image/") ?? false;
      parts.push(isImage ? `!${link}` : link);
    }
    return parts.join("\n\n");
  }

  // Rewrites Discord custom emojis (<:name:id>, <a:name:id>) as :discord-<id>:
  // shortcodes that resolve to the registered Linear workspace emojis.
  private emojis(content: string): string {
    return content.replace(
      /<a?:\w+:(\d+)>/g,
      (_match, id) => `:discord-${id}:`,
    );
  }

  // Registers every Discord custom emoji referenced in the content as a Linear
  // workspace emoji so the shortcodes render.
  private async ensureEmojis(content: string): Promise<void> {
    const seen = new Set<string>();
    for (const [, animated, id] of content.matchAll(/<(a?):\w+:(\d+)>/g)) {
      if (seen.has(id)) continue;
      seen.add(id);
      await linear.ensureEmoji(id, animated === "a");
    }
  }

  // Fast body using Discord CDN URLs, which expire after roughly a day.
  private body(message: Message): string {
    return this.render(message, (a) => a.url);
  }

  // Body with attachments re-hosted in Linear for permanence, falling back to
  // the CDN URL for any upload that fails.
  private async durableBody(message: Message): Promise<string> {
    const assetByUrl = new Map<string, string>();
    for (const a of message.attachments.values()) {
      const asset = await linear.uploadFile(a.url, a.name, a.contentType);
      if (asset) assetByUrl.set(a.url, asset);
    }
    return this.render(message, (a) => assetByUrl.get(a.url) ?? a.url);
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
