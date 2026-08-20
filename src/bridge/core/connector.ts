import type {
  ExternalRef,
  Message,
  Post,
  Reaction,
} from "@bridge/core/model.js";

export interface IssueState {
  type: string;
  name: string;
}

export interface LinkedIssue {
  id: string;
  identifier: string;
  url: string;
}

export type ReactionTarget = { issueId: string } | { commentId: string };

// The hub store. Linear implements this today; every method speaks the
// source-agnostic model so another hub could be swapped in. Keyed by the source
// entity's ExternalRef (resolved to a hub issue via its URL attachment).
export interface Target {
  findIssueId(ref: ExternalRef): Promise<string | null>;
  ensureIssue(post: Post): Promise<string>;
  deleteIssue(ref: ExternalRef): Promise<void>;

  // Refresh linking attachment, title, project and labels from the post.
  reconcile(issueId: string, post: Post): Promise<void>;
  syncLabels(issueId: string, post: Post): Promise<void>;

  setDescription(issueId: string, text: string): Promise<void>;
  updateDescription(issueId: string, message: Message): Promise<void>;

  addComment(
    issueId: string,
    message: Message,
    parentId?: string,
  ): Promise<void>;
  editComment(issueId: string, message: Message): Promise<boolean>;
  deleteComment(issueId: string, ref: ExternalRef): Promise<boolean>;
  mirroredMessageIds(issueId: string): Promise<Set<string>>;
  resolveReplyParent(
    issueId: string,
    messageId: string,
  ): Promise<string | null>;
  findCommentId(issueId: string, messageId: string): Promise<string | null>;

  // Plain system note (no marker), e.g. "thread closed".
  note(issueId: string, body: string, createdAt?: Date): Promise<void>;

  getState(issueId: string): Promise<IssueState | null>;
  setState(
    issueId: string,
    type: "completed" | "triage" | "started",
    name?: string,
  ): Promise<void>;

  addReaction(target: ReactionTarget, reaction: Reaction): Promise<void>;
  removeReaction(target: ReactionTarget, reaction: Reaction): Promise<void>;

  resolveByUrl(url: string): Promise<LinkedIssue | null>;
  relate(issueId: string, otherId: string): Promise<void>;

  issueRef(issueId: string): Promise<{ identifier: string; url: string }>;
}

// A platform that originates conversations (Discord today, GitHub Discussions
// planned). It registers listeners that drive the mirror, enumerates posts for
// backfill, and writes the hub link back into the source. Everything syncs both
// ways eventually; a connector grows into the hub's role by implementing more of
// the reverse direction, so Source and Target are capabilities one module can
// hold rather than separate layers.
export interface Source {
  register(): void;
  backfill(): Promise<void>;
  announce(
    post: Post,
    issue: { identifier: string; url: string },
  ): Promise<void>;
}
