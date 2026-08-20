import type { Comment } from "@linear/sdk";

import type { SourceId } from "@bridge/core/model.js";

import { linear } from "./client.js";

// Locates the mirrored comment for a source message so a later edit/delete finds
// the right one. `source` namespaces the marker so different platforms don't
// collide; Discord's marker is `discord-msg`, kept byte-compatible with data
// already written to Linear.
export interface Marker {
  source: SourceId;
  id: string;
}

// Invisible marker (an unused markdown reference-link definition) appended to
// mirrored comments. It renders as nothing in Linear but round-trips in the raw
// body.
function withMarker(body: string, marker: Marker): string {
  return `${body}\n\n[${marker.source}-msg]: ${marker.id}`;
}

function markerMessageId(body: string): string | null {
  return body.match(/^\[[a-z]+-msg\]:\s*(\S+)/m)?.[1] ?? null;
}

// Adds a comment. When a marker is given the message id is embedded so the
// comment can be found again; a plain note (no marker) is used for system
// messages like "thread closed".
export async function addComment(
  issueId: string,
  body: string,
  author?: { name: string; iconUrl?: string },
  marker?: Marker,
  parentId?: string,
  createdAt?: Date,
): Promise<void> {
  const input = {
    issueId,
    body: marker ? withMarker(body, marker) : body,
    createdAt,
    // Attributes the comment to an external author. Requires OAuth app-actor
    // auth; Linear rejects these fields for personal API keys, so the caller
    // only supplies an author when that mode is configured.
    createAsUser: author?.name,
    displayIconUrl: author?.iconUrl,
  };

  console.log(
    `[bridge] adding comment on ${issueId}` +
      `${marker ? ` for msg ${marker.id}` : ""}` +
      `${parentId ? ` (reply to ${parentId})` : ""}`,
  );

  try {
    await linear().createComment({ ...input, parentId });
  } catch (err) {
    // Linear threads are one level deep; if the parent is itself a reply, fall
    // back to a top-level comment rather than dropping the message.
    if (!parentId) throw err;
    await linear().createComment(input);
  }
}

// Returns the source message ids already mirrored as comments on the issue, read
// from the invisible markers, so a backfill can skip them.
export async function mirroredMessageIds(
  issueId: string,
): Promise<Set<string>> {
  const issue = await linear().issue(issueId);
  const ids = new Set<string>();

  let page = await issue.comments({ first: 100 });
  while (true) {
    for (const comment of page.nodes) {
      const id = markerMessageId(comment.body);
      if (id) ids.add(id);
    }
    if (!page.pageInfo.hasNextPage) break;
    page = await issue.comments({
      first: 100,
      after: page.pageInfo.endCursor ?? undefined,
    });
  }
  return ids;
}

// Updates the mirrored comment for a message. Returns false if the message has
// no mirrored comment.
export async function editComment(
  issueId: string,
  marker: Marker,
  body: string,
): Promise<boolean> {
  const commentId = await findCommentByMessage(issueId, marker.id);
  if (!commentId) return false;
  console.log(`[bridge] editing comment for msg ${marker.id} on ${issueId}`);
  await linear().updateComment(commentId, { body: withMarker(body, marker) });
  return true;
}

// Deletes the mirrored comment for a message. Returns false if the message has
// no mirrored comment. If the comment has replies, its body is blanked instead
// of deleted, since Linear removes a comment's replies along with it.
export async function deleteComment(
  issueId: string,
  marker: Marker,
): Promise<boolean> {
  const node = await findCommentNode(issueId, marker.id);
  if (!node) return false;

  const children = await node.children();
  if (children.nodes.length > 0) {
    console.log(
      `[bridge] tombstoning comment for msg ${marker.id} on ${issueId} (has replies)`,
    );
    await linear().updateComment(node.id, {
      body: withMarker("_Message deleted._", marker),
    });
  } else {
    console.log(`[bridge] deleting comment for msg ${marker.id} on ${issueId}`);
    await linear().deleteComment(node.id);
  }
  return true;
}

// Finds the mirrored comment node for a source message id, or null.
async function findCommentNode(
  issueId: string,
  messageId: string,
): Promise<Comment | null> {
  const issue = await linear().issue(issueId);
  const { nodes } = await issue.comments();
  for (const comment of nodes) {
    if (markerMessageId(comment.body) === messageId) return comment;
  }
  return null;
}

// Finds the mirrored comment id for a source message id, or null.
export async function findCommentByMessage(
  issueId: string,
  messageId: string,
): Promise<string | null> {
  return (await findCommentNode(issueId, messageId))?.id ?? null;
}

// Resolves the comment a reply should attach to: the mirrored comment of the
// referenced message, collapsed to its thread root since Linear threads are only
// one level deep. Returns null when the reference isn't mirrored.
export async function resolveReplyParent(
  issueId: string,
  messageId: string,
): Promise<string | null> {
  const node = await findCommentNode(issueId, messageId);
  if (!node) return null;
  const parent = await node.parent;
  return parent?.id ?? node.id;
}
