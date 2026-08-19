import { LinearClient, type Comment } from "@linear/sdk";
import { IssueRelationType } from "@linear/sdk";

import { config } from "@lib/config.js";

// Validated bridge credentials. Present whenever the bridge is enabled.
function bridgeConfig(): {
  appToken: string;
  userToken: string;
  teamId: string;
} {
  const { appToken, userToken, teamId } = config.linearBridge;
  if (!appToken || !userToken || !teamId) {
    throw new Error(
      "linearBridge is enabled but appToken/userToken/teamId are missing",
    );
  }
  return { appToken, userToken, teamId };
}

let appClient: LinearClient | undefined;
let userClient: LinearClient | undefined;

// App-actor client. Issues, comments and reactions run here so they are
// attributed to the external Discord author (OAuth tokens use accessToken).
function linear(): LinearClient {
  if (!appClient) {
    appClient = new LinearClient({ accessToken: bridgeConfig().appToken });
  }
  return appClient;
}

// Personal-key client for writes the app actor cannot make: creating custom
// emojis and labels.
function linearUser(): LinearClient {
  if (!userClient) {
    userClient = new LinearClient({ apiKey: bridgeConfig().userToken });
  }
  return userClient;
}

// Extracts a readable message from a Linear SDK error, whose default string
// form is unhelpful ("[object Object]").
export function linearError(err: unknown): string {
  const e = err as { errors?: { message?: string }[]; message?: string };
  return (
    e?.errors
      ?.map((x) => x.message)
      .filter(Boolean)
      .join("; ") ||
    e?.message ||
    String(err)
  );
}

// Metadata stored on the Discord attachment of a mirrored issue.
export interface ThreadAttachmentFields {
  url: string;
  title: string;
  subtitle: string;
  metadata: Record<string, unknown>;
}

// Finds the issue mapped to a thread via its URL attachment, returning the
// issue and attachment ids.
export async function findThreadMapping(
  url: string,
): Promise<{ issueId: string; attachmentId: string } | null> {
  const attachments = await linear().attachmentsForURL(url);
  const node = attachments.nodes[0];
  if (!node) return null;

  const issue = await node.issue;
  if (!issue) return null;

  return { issueId: issue.id, attachmentId: node.id };
}

// Creates an issue in the configured team and returns its id.
export async function createIssue(input: {
  title: string;
  description: string;
  author?: { name: string; iconUrl?: string };
}): Promise<string> {
  const payload = await linear().createIssue({
    teamId: bridgeConfig().teamId,
    projectId: config.linearBridge.projectId,
    title: input.title,
    description: input.description,
    // Attributes the issue to an external Discord author under app-actor auth;
    // ignored fields are safe to omit for personal keys (author is undefined).
    createAsUser: input.author?.name,
    displayIconUrl: input.author?.iconUrl,
  });

  const issue = await payload.issue;
  if (!issue) throw new Error("Linear did not return the created issue");
  return issue.id;
}

// Creates the Discord attachment on a freshly created issue.
export async function createThreadAttachment(
  issueId: string,
  fields: ThreadAttachmentFields,
): Promise<void> {
  await linear().createAttachment({ issueId, ...fields });
}

// Updates the issue's Discord attachment in place, or creates it if missing.
export async function upsertThreadAttachment(
  issueId: string,
  fields: ThreadAttachmentFields,
): Promise<void> {
  const mapping = await findThreadMapping(fields.url);
  if (!mapping) {
    await createThreadAttachment(issueId, fields);
    return;
  }

  await linear().updateAttachment(mapping.attachmentId, {
    title: fields.title,
    subtitle: fields.subtitle,
    metadata: fields.metadata,
  });
}

// Invisible marker (an unused markdown reference-link definition) appended to
// mirrored comments so a later Discord edit/delete can locate the right
// comment. It renders as nothing in Linear but round-trips in the raw body.
const MSG_MARKER = "discord-msg";

function withMarker(body: string, messageId: string): string {
  return `${body}\n\n[${MSG_MARKER}]: ${messageId}`;
}

function markerMessageId(body: string): string | null {
  return body.match(/^\[discord-msg\]:\s*(\S+)/m)?.[1] ?? null;
}

export async function addComment(
  issueId: string,
  body: string,
  author?: { name: string; iconUrl?: string },
  messageId?: string,
  parentId?: string,
): Promise<void> {
  const input = {
    issueId,
    body: messageId ? withMarker(body, messageId) : body,
    // Attributes the comment to an external Discord author. Requires OAuth
    // app-actor auth; Linear rejects these fields for personal API keys, so the
    // caller only supplies an author when that mode is configured.
    createAsUser: author?.name,
    displayIconUrl: author?.iconUrl,
  };

  try {
    await linear().createComment({ ...input, parentId });
  } catch (err) {
    // Linear threads are one level deep; if the parent is itself a reply, fall
    // back to a top-level comment rather than dropping the message.
    if (!parentId) throw err;
    await linear().createComment(input);
  }
}

// Updates the mirrored comment for a Discord message. Returns false if the
// message has no mirrored comment.
export async function editComment(
  issueId: string,
  messageId: string,
  body: string,
): Promise<boolean> {
  const commentId = await findCommentByMessage(issueId, messageId);
  if (!commentId) return false;
  await linear().updateComment(commentId, {
    body: withMarker(body, messageId),
  });
  return true;
}

// Deletes the mirrored comment for a Discord message. Returns false if the
// message has no mirrored comment. If the comment has replies, its body is
// blanked instead of deleted, since Linear removes a comment's replies along
// with it.
export async function deleteComment(
  issueId: string,
  messageId: string,
): Promise<boolean> {
  const node = await findCommentNode(issueId, messageId);
  if (!node) return false;

  const children = await node.children();
  if (children.nodes.length > 0) {
    await linear().updateComment(node.id, {
      body: withMarker("_Message deleted._", messageId),
    });
  } else {
    await linear().deleteComment(node.id);
  }
  return true;
}

// Finds the mirrored comment node for a Discord message id, or null.
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

// Finds the mirrored comment id for a Discord message id, or null.
export async function findCommentByMessage(
  issueId: string,
  messageId: string,
): Promise<string | null> {
  return (await findCommentNode(issueId, messageId))?.id ?? null;
}

// Resolves the comment a Discord reply should attach to: the mirrored comment
// of the referenced message, collapsed to its thread root since Linear threads
// are only one level deep. Returns null when the reference isn't mirrored.
export async function resolveReplyParent(
  issueId: string,
  messageId: string,
): Promise<string | null> {
  const node = await findCommentNode(issueId, messageId);
  if (!node) return null;
  const parent = await node.parent;
  return parent?.id ?? node.id;
}

// Replaces an issue's description, used when the opening post is edited.
export async function setIssueDescription(
  issueId: string,
  description: string,
): Promise<void> {
  await linear().updateIssue(issueId, { description });
}

// Re-hosts a remote file in Linear's storage and returns its permanent asset
// URL, or null if the upload fails (caller falls back to the source URL).
export async function uploadFile(
  sourceUrl: string,
  filename: string,
  contentType: string | null,
): Promise<string | null> {
  try {
    return await rehost(
      sourceUrl,
      filename,
      contentType || "application/octet-stream",
    );
  } catch {
    return null;
  }
}

// Fetches a remote file and uploads its bytes to Linear storage, returning the
// permanent asset URL. Linear only accepts asset URLs on its own upload domain,
// so emojis and attachments must be re-hosted here rather than hotlinked.
async function rehost(
  sourceUrl: string,
  filename: string,
  type: string,
): Promise<string | null> {
  const source = await fetch(sourceUrl);
  if (!source.ok) return null;
  const bytes = await source.arrayBuffer();

  const upload = (await linear().fileUpload(type, filename, bytes.byteLength))
    .uploadFile;
  if (!upload) return null;

  const headers = new Headers({ "Content-Type": type });
  for (const { key, value } of upload.headers) headers.set(key, value);

  const put = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers,
    body: bytes,
  });
  return put.ok ? upload.assetUrl : null;
}

// Trashes an issue (recoverable in Linear).
export async function deleteIssue(issueId: string): Promise<void> {
  await linear().deleteIssue(issueId);
}

// Returns the workflow state type of an issue (e.g. "triage", "completed").
export async function getIssueStateType(
  issueId: string,
): Promise<string | null> {
  const issue = await linear().issue(issueId);
  const state = await issue.state;
  return state?.type ?? null;
}

// Moves an issue to a workflow state of the given type in the team. The started
// type has several states (In Progress, Blocked, In Review), so it targets "In
// Progress" by name; the others take the first state of their type.
export async function setIssueState(
  issueId: string,
  type: "completed" | "triage" | "started",
): Promise<void> {
  const stateId = await findStateId(
    type,
    type === "started" ? "In Progress" : undefined,
  );
  if (!stateId) return;
  await linear().updateIssue(issueId, { stateId });
}

const stateIdByType = new Map<string, string>();

// Finds a workflow state of the given type in the team. When preferredName is
// set, a state with that name wins; otherwise the lowest-position state of the
// type is used, since Linear does not order the results.
async function findStateId(
  type: string,
  preferredName?: string,
): Promise<string | null> {
  const cacheKey = preferredName ? `${type}:${preferredName}` : type;
  const cached = stateIdByType.get(cacheKey);
  if (cached) return cached;

  const { teamId } = bridgeConfig();
  const states = await linear().workflowStates({
    filter: { team: { id: { eq: teamId } }, type: { eq: type } },
  });

  const named =
    preferredName &&
    states.nodes.find(
      (s) => s.name.toLowerCase() === preferredName.toLowerCase(),
    );
  const byPosition = [...states.nodes].sort((a, b) => a.position - b.position);
  const id = (named || byPosition[0])?.id ?? null;
  if (id) stateIdByType.set(cacheKey, id);
  return id;
}

// --- Emojis & reactions ---------------------------------------------------

// Names of the workspace's custom emojis, loaded once and updated as we create
// new ones, so we don't recreate existing emojis or spam duplicate errors.
let emojiNames: Set<string> | undefined;

async function loadEmojiNames(): Promise<Set<string>> {
  if (emojiNames) return emojiNames;
  const names = new Set<string>();
  let after: string | undefined;
  do {
    const page = await linearUser().emojis({ first: 250, after });
    for (const e of page.nodes) names.add(e.name);
    after = page.pageInfo.hasNextPage
      ? (page.pageInfo.endCursor ?? undefined)
      : undefined;
  } while (after);
  emojiNames = names;
  return names;
}

// Registers a Discord custom emoji as a workspace emoji named discord-<id> so
// that :discord-<id>: renders inline. Idempotent: skips emojis that already
// exist and needs the user token, as the app actor cannot create emojis.
export async function ensureEmoji(
  id: string,
  animated: boolean,
): Promise<void> {
  const name = `discord-${id}`;
  const names = await loadEmojiNames();
  if (names.has(name)) return;

  const ext = animated ? "gif" : "png";
  // Linear rejects external image URLs, so re-host the Discord emoji first.
  const asset = await rehost(
    `https://cdn.discordapp.com/emojis/${id}.${ext}`,
    `${name}.${ext}`,
    animated ? "image/gif" : "image/png",
  ).catch(() => null);
  if (!asset) {
    console.error(`[bridge] ensureEmoji ${name}: upload failed`);
    return;
  }

  try {
    await linearUser().createEmoji({ name, url: asset });
    names.add(name);
  } catch (err) {
    console.error(`[bridge] ensureEmoji ${name} failed:`, linearError(err));
  }
}

export type ReactionTarget = { issueId: string } | { commentId: string };

// Reaction ids we created, keyed by target+emoji, so a later removal can delete
// the exact reaction even for unicode emojis whose stored name differs from the
// input we sent.
const reactionIds = new Map<string, string>();

function reactionKey(target: ReactionTarget, emoji: string): string {
  const scope =
    "issueId" in target ? `i:${target.issueId}` : `c:${target.commentId}`;
  return `${scope}|${emoji}`;
}

export async function addReaction(
  target: ReactionTarget,
  emoji: string,
): Promise<void> {
  try {
    const payload = await linear().createReaction({ ...target, emoji });
    const reaction = await payload.reaction;
    if (reaction) reactionIds.set(reactionKey(target, emoji), reaction.id);
  } catch (err) {
    console.error(`[bridge] addReaction ${emoji} failed:`, linearError(err));
  }
}

export async function removeReaction(
  target: ReactionTarget,
  emoji: string,
): Promise<void> {
  const key = reactionKey(target, emoji);
  const id = reactionIds.get(key) ?? (await findReaction(target, emoji));
  if (!id) return;
  await linear().deleteReaction(id);
  reactionIds.delete(key);
}

// Finds a reaction on the target whose stored emoji matches, used as a fallback
// when the created id is not cached (e.g. after a restart). Reliable for custom
// emojis; unicode names are normalized by Linear so may not match.
async function findReaction(
  target: ReactionTarget,
  emoji: string,
): Promise<string | null> {
  const reactions =
    "issueId" in target
      ? (await linear().issue(target.issueId)).reactions
      : (await linear().comment({ id: target.commentId })).reactions;
  return reactions.find((r) => r.emoji === emoji)?.id ?? null;
}

// --- Labels ---------------------------------------------------------------

// Flat (ungrouped) labels are used rather than a label group because Linear
// allows only one label per group on an issue, while a help thread can carry
// several tags. Each label is namespaced by name, e.g. "#help > tag".
const labelIdByName = new Map<string, string>();

// Finds or creates a team label with the given name, tagging its description
// with the Discord tag id. Cached by name. Runs on the user token, which owns
// label management.
export async function ensureLabel(
  name: string,
  tagId: string,
): Promise<string> {
  const cached = labelIdByName.get(name);
  if (cached) return cached;

  const { teamId } = bridgeConfig();
  const existing = await linearUser().issueLabels({
    filter: { name: { eq: name }, team: { id: { eq: teamId } } },
  });

  let id = existing.nodes[0]?.id;
  if (!id) {
    const payload = await linearUser().createIssueLabel({
      name,
      description: tagId,
      teamId,
    });
    const label = await payload.issueLabel;
    if (!label) throw new Error("Linear did not return the created label");
    id = label.id;
  }

  labelIdByName.set(name, id);
  return id;
}

// Reconciles the issue's namespaced labels to exactly match desiredIds, adding
// missing ones and removing only stale labels that share the namespace prefix
// (so unrelated labels are never touched, and labels already absent are never
// "removed"). Runs on the user token that owns the labels.
export async function setNamespacedLabels(
  issueId: string,
  prefix: string,
  desiredIds: string[],
): Promise<void> {
  const issue = await linearUser().issue(issueId);
  const current = (await issue.labels()).nodes;
  const ours = current
    .filter((l) => l.name.startsWith(prefix))
    .map((l) => l.id);

  const addedLabelIds = desiredIds.filter((id) => !ours.includes(id));
  const removedLabelIds = ours.filter((id) => !desiredIds.includes(id));
  if (addedLabelIds.length === 0 && removedLabelIds.length === 0) return;

  await linearUser().updateIssue(issueId, { addedLabelIds, removedLabelIds });
}

// --- Cross-links ----------------------------------------------------------

export interface LinkedIssue {
  id: string;
  identifier: string;
  url: string;
}

// Finds the Linear issue mapped to a URL via its attachments (a mirrored
// Discord thread, or a GitHub issue linked through Linear's integration).
export async function resolveIssueByUrl(
  url: string,
): Promise<LinkedIssue | null> {
  const attachments = await linear().attachmentsForURL(url);
  const issue = await attachments.nodes[0]?.issue;
  if (!issue) return null;
  return { id: issue.id, identifier: issue.identifier, url: issue.url };
}

// Relation pairs created this session, to avoid duplicate "related" links when
// the same issue is mentioned more than once.
const relatedPairs = new Set<string>();

// Marks two issues as related. Idempotent within a session and tolerant of
// Linear rejecting an existing relation.
export async function relateIssues(
  issueId: string,
  relatedIssueId: string,
): Promise<void> {
  const key = [issueId, relatedIssueId].sort().join("|");
  if (relatedPairs.has(key)) return;
  relatedPairs.add(key);
  try {
    await linear().createIssueRelation({
      issueId,
      relatedIssueId,
      type: IssueRelationType.Related,
    });
  } catch (err) {
    console.error(`[bridge] relateIssues ${key} failed:`, linearError(err));
  }
}
