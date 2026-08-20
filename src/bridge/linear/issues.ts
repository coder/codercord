import { IssueRelationType } from "@linear/sdk";

import { config } from "@lib/config.js";

import { linear, linearError } from "./client.js";
import { attachmentInTeam } from "./attachments.js";

// Creates an issue in the configured team and returns its id.
export async function createIssue(input: {
  title: string;
  description: string;
  author?: { name: string; iconUrl?: string };
  createdAt?: Date;
}): Promise<string> {
  const payload = await linear().createIssue({
    teamId: config.linearBridge.teamId,
    projectId: config.linearBridge.projectId,
    title: input.title,
    description: input.description,
    createdAt: input.createdAt,
    // Attributes the issue to an external author under app-actor auth; ignored
    // fields are safe to omit for personal keys (author is undefined).
    createAsUser: input.author?.name,
    displayIconUrl: input.author?.iconUrl,
  });

  const issue = await payload.issue;
  if (!issue) throw new Error("Linear did not return the created issue");
  console.debug("[bridge]", "created issue", issue.identifier, input.title);
  return issue.id;
}

// Trashes an issue (recoverable in Linear).
export async function deleteIssue(issueId: string): Promise<void> {
  console.debug("[bridge]", "trashing issue", issueId);
  await linear().deleteIssue(issueId);
}

// Replaces an issue's description.
export async function setIssueDescription(
  issueId: string,
  description: string,
): Promise<void> {
  console.debug("[bridge]", "updating description", issueId);
  await linear().updateIssue(issueId, { description });
}

// Reconciles the issue's title and project when they drift (e.g. a renamed
// conversation, or an issue created before the project was configured). One
// fetch, one update, only when something actually changed.
export async function reconcileIssue(
  issueId: string,
  title: string,
): Promise<void> {
  const { projectId } = config.linearBridge;
  const issue = await linear().issue(issueId);

  const update: { title?: string; projectId?: string } = {};
  if (issue.title !== title) update.title = title;
  if (projectId && issue.projectId !== projectId) update.projectId = projectId;
  if (Object.keys(update).length === 0) return;

  console.debug(
    "[bridge]",
    "reconciling issue",
    issueId,
    Object.keys(update).join(", "),
  );
  await linear().updateIssue(issueId, update);
}

// Returns an issue's identifier and URL, e.g. for linking back from a source.
export async function getIssueRef(
  issueId: string,
): Promise<{ identifier: string; url: string }> {
  const issue = await linear().issue(issueId);
  return { identifier: issue.identifier, url: issue.url };
}

export interface LinkedIssue {
  id: string;
  identifier: string;
  url: string;
}

// Finds the issue mapped to a URL via its attachments (a mirrored conversation,
// or a GitHub issue linked through Linear's integration), scoped to the team.
export async function resolveIssueByUrl(
  url: string,
): Promise<LinkedIssue | null> {
  const match = await attachmentInTeam(url);
  if (!match) return null;
  const { issue } = match;
  return { id: issue.id, identifier: issue.identifier, url: issue.url };
}

// Relation pairs created this session, to avoid duplicate "related" links when
// the same issue is referenced more than once.
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
    console.debug("[bridge]", "related issues", key);
  } catch (err) {
    console.error("[bridge]", "relateIssues failed", key, linearError(err));
  }
}
