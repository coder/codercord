import { LinearClient } from "@linear/sdk";

import { config } from "@lib/config.js";

// Validated bridge credentials. Present whenever the bridge is enabled.
function bridgeConfig(): { apiKey: string; teamId: string } {
  const { apiKey, teamId } = config.linearBridge;
  if (!apiKey || !teamId) {
    throw new Error("linearBridge is enabled but apiKey/teamId are missing");
  }
  return { apiKey, teamId };
}

let client: LinearClient | undefined;

function linear(): LinearClient {
  if (!client) {
    const { apiKey } = bridgeConfig();
    // App-actor (OAuth) tokens must be sent as Bearer tokens via accessToken;
    // personal API keys are sent verbatim via apiKey.
    client = new LinearClient(
      config.linearBridge.createAsUser ? { accessToken: apiKey } : { apiKey },
    );
  }
  return client;
}

// Metadata stored on the Discord attachment of a mirrored issue.
export interface ThreadAttachmentFields {
  url: string;
  title: string;
  subtitle: string;
  metadata: Record<string, unknown>;
}

export interface GroupLabel {
  id: string;
  name: string;
  description?: string;
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

export async function addComment(
  issueId: string,
  body: string,
  author?: { name: string; iconUrl?: string },
): Promise<void> {
  await linear().createComment({
    issueId,
    body,
    // Attributes the comment to an external Discord author. Requires OAuth
    // app-actor auth; Linear rejects these fields for personal API keys, so the
    // caller only supplies an author when that mode is configured.
    createAsUser: author?.name,
    displayIconUrl: author?.iconUrl,
  });
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

// Moves an issue to the first workflow state of the given type in the team
// (e.g. completed -> "Done", triage -> "Triage").
export async function setIssueState(
  issueId: string,
  type: "completed" | "triage",
): Promise<void> {
  const stateId = await findStateId(type);
  if (!stateId) return;
  await linear().updateIssue(issueId, { stateId });
}

const stateIdByType = new Map<string, string>();

async function findStateId(type: string): Promise<string | null> {
  const cached = stateIdByType.get(type);
  if (cached) return cached;

  const { teamId } = bridgeConfig();
  const states = await linear().workflowStates({
    filter: { team: { id: { eq: teamId } }, type: { eq: type } },
  });

  const id = states.nodes[0]?.id ?? null;
  if (id) stateIdByType.set(type, id);
  return id;
}

// --- Labels ---------------------------------------------------------------

let groupIdCache: string | undefined;

// Finds or creates the team-scoped label group that holds Discord tag labels.
export async function ensureLabelGroup(name: string): Promise<string> {
  if (groupIdCache) return groupIdCache;

  const { teamId } = bridgeConfig();
  const existing = await linear().issueLabels({
    filter: { name: { eq: name }, team: { id: { eq: teamId } } },
  });

  const found = existing.nodes[0];
  if (found) {
    groupIdCache = found.id;
    return found.id;
  }

  const payload = await linear().createIssueLabel({
    name,
    teamId,
    isGroup: true,
  });
  const label = await payload.issueLabel;
  if (!label) throw new Error("Linear did not return the created label group");

  groupIdCache = label.id;
  return label.id;
}

// Lists the child labels of a group in the team.
export async function getGroupLabels(groupId: string): Promise<GroupLabel[]> {
  const { teamId } = bridgeConfig();
  const labels = await linear().issueLabels({
    filter: { parent: { id: { eq: groupId } }, team: { id: { eq: teamId } } },
  });

  return labels.nodes.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description ?? undefined,
  }));
}

// Creates a child label whose description is the Discord tag id.
export async function createLabel(input: {
  name: string;
  tagId: string;
  groupId: string;
}): Promise<GroupLabel> {
  const payload = await linear().createIssueLabel({
    name: input.name,
    description: input.tagId,
    teamId: bridgeConfig().teamId,
    parentId: input.groupId,
  });

  const label = await payload.issueLabel;
  if (!label) throw new Error("Linear did not return the created label");
  return { id: label.id, name: label.name, description: input.tagId };
}

export async function renameLabel(id: string, name: string): Promise<void> {
  await linear().updateIssueLabel(id, { name });
}

// Reconciles an issue's group labels to exactly match the given tag set, adding
// missing ones and removing stale ones without touching non-group labels.
export async function setIssueGroupLabels(
  issueId: string,
  addedLabelIds: string[],
  removedLabelIds: string[],
): Promise<void> {
  await linear().updateIssue(issueId, { addedLabelIds, removedLabelIds });
}
