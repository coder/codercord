import type {
  ExternalRef,
  Message,
  Post,
  Reaction,
} from "@bridge/core/model.js";
import type { Source, Target } from "@bridge/core/connector.js";
import { dedupeReferences, type Reference } from "@bridge/core/references.js";
import { syncState } from "@bridge/core/reconciler.js";

// Orchestrates one source against the hub. All logic here is source-agnostic:
// it consumes model objects a connector produces and drives the Target. A
// connector holds a Mirror and feeds it from its own listeners and backfill.
export class Mirror {
  // Caches the ensure-issue promise per post so concurrent events resolve to a
  // single issue instead of racing to create duplicates.
  private readonly issueByRef = new Map<string, Promise<string>>();

  constructor(
    private readonly target: Target,
    private readonly source: Pick<Source, "announce">,
  ) {}

  // Mirrors a post: issue (with the opening message as its body), linking
  // attachment, and labels. Announces the issue back to the source unless
  // suppressed (e.g. during startup backfill of old posts).
  async createPost(post: Post, announce = true): Promise<void> {
    console.log(`[bridge] mirroring post ${post.ref.id} "${post.title}"`);
    const existed = (await this.target.findIssueId(post.ref)) !== null;
    const issueId = await this.ensureIssue(post);
    await this.target.syncLabels(issueId, post);

    const rewrites = await this.resolveReferences(issueId, post.references);
    if (rewrites.size > 0) {
      await this.target.setDescription(
        issueId,
        applyRewrites(post.body, rewrites),
      );
    }

    if (announce && !existed) {
      try {
        await this.source.announce(post, await this.target.issueRef(issueId));
      } catch (err) {
        console.error("Linear bridge: issue announce failed:", err);
      }
    }
  }

  // Mirrors a message as an issue comment.
  async addMessage(post: Post, message: Message): Promise<void> {
    // Skip messages with no text and no attachments (e.g. a sticker-only post).
    if (!message.text.trim() && message.attachments.length === 0) return;
    const issueId = await this.ensureIssue(post);
    const rewrites = await this.resolveReferences(issueId, message.references);
    const parentId = message.replyToId
      ? ((await this.target.resolveReplyParent(issueId, message.replyToId)) ??
        undefined)
      : undefined;
    await this.target.addComment(
      issueId,
      { ...message, text: applyRewrites(message.text, rewrites) },
      parentId,
    );
  }

  // Reflects a message edit onto its mirrored comment, or the issue description
  // for the opening message. No-op if the post isn't mirrored.
  async editMessage(
    post: Post,
    message: Message,
    isStarter: boolean,
  ): Promise<void> {
    const issueId = await this.target.findIssueId(post.ref);
    if (!issueId) return;
    if (isStarter) {
      await this.target.updateDescription(issueId, message);
    } else {
      await this.target.editComment(issueId, message);
    }
  }

  // Removes a deleted message from the hub. Regular messages map to comments;
  // the opening message maps to the issue description, which is cleared.
  async deleteMessage(
    post: Post,
    ref: ExternalRef,
    isStarter: boolean,
  ): Promise<void> {
    const issueId = await this.target.findIssueId(post.ref);
    if (!issueId) {
      console.log(
        `[bridge] deleteMessage: no issue mapping for ${post.ref.url}`,
      );
      return;
    }
    if (isStarter) {
      await this.target.setDescription(issueId, "");
      return;
    }
    const ok = await this.target.deleteComment(issueId, ref);
    console.log(`[bridge] deleteMessage msg=${ref.id} deleted=${ok}`);
  }

  // Refreshes attachment metadata, title, project and labels, then reconciles
  // the workflow state.
  async syncStatus(post: Post, backfill = false): Promise<void> {
    const issueId = await this.ensureIssue(post);
    await this.target.reconcile(issueId, post);
    await syncState(this.target, issueId, post, backfill);
  }

  // Trashes the mirrored issue when its source post is deleted.
  async deletePost(post: Post): Promise<void> {
    await this.target.deleteIssue(post.ref);
    this.issueByRef.delete(post.ref.id);
  }

  // Mirrors a reaction onto the mapped issue (opening message) or comment.
  // A null message ref targets the issue itself.
  async addReaction(
    post: Post,
    message: ExternalRef | null,
    reaction: Reaction,
  ): Promise<void> {
    const target = await this.reactionTarget(post, message);
    if (target) await this.target.addReaction(target, reaction);
  }

  async removeReaction(
    post: Post,
    message: ExternalRef | null,
    reaction: Reaction,
  ): Promise<void> {
    const target = await this.reactionTarget(post, message);
    if (target) await this.target.removeReaction(target, reaction);
  }

  // Mirrors messages not already on the issue, in the order given. Idempotent:
  // existing messages (matched by marker) are skipped, so it is safe to re-run.
  async backfillMessages(post: Post, messages: Message[]): Promise<void> {
    const issueId = await this.ensureIssue(post);
    const mirrored = await this.target.mirroredMessageIds(issueId);
    console.log(
      `[bridge] backfilling ${messages.length} message(s) for issue ${issueId} (${mirrored.size} already mirrored)`,
    );
    for (const message of messages) {
      if (mirrored.has(message.ref.id)) continue;
      await this.addMessage(post, message);
    }
  }

  private async reactionTarget(
    post: Post,
    message: ExternalRef | null,
  ): Promise<{ issueId: string } | { commentId: string } | null> {
    const issueId = await this.target.findIssueId(post.ref);
    if (!issueId) return null;
    if (!message) return { issueId };
    const commentId = await this.target.findCommentId(issueId, message.id);
    return commentId ? { commentId } : null;
  }

  private async ensureIssue(post: Post): Promise<string> {
    const cached = this.issueByRef.get(post.ref.id);
    if (cached) return cached;

    const pending = this.target.ensureIssue(post);
    this.issueByRef.set(post.ref.id, pending);
    try {
      return await pending;
    } catch (err) {
      this.issueByRef.delete(post.ref.id);
      throw err;
    }
  }

  // Resolves each reference to a hub issue, relates it, and returns token ->
  // markdown link rewrites that turn each mention into a link to the issue.
  private async resolveReferences(
    issueId: string,
    references: Reference[],
  ): Promise<Map<string, string>> {
    const rewrites = new Map<string, string>();
    for (const ref of dedupeReferences(references)) {
      const target = await this.target.resolveByUrl(ref.url);
      if (!target || target.id === issueId) continue;
      await this.target.relate(issueId, target.id);
      rewrites.set(ref.token, `[${target.identifier}](${target.url})`);
    }
    return rewrites;
  }
}

function applyRewrites(body: string, rewrites: Map<string, string>): string {
  for (const [token, replacement] of rewrites) {
    body = body.split(token).join(replacement);
  }
  return body;
}
