import type { Attachment, Issue } from "@linear/sdk";

import { bridgeConfig, linear } from "./client.js";

// Fields stored on the hub issue's attachment that links back to the source
// conversation. Kept byte-compatible with existing mirrored issues.
export interface ThreadAttachmentFields {
  url: string;
  title: string;
  subtitle: string;
  metadata: Record<string, unknown>;
}

// Returns the first attachment on the URL whose issue lives in the configured
// team. Attachments match across the whole workspace, so scoping to the team
// keeps lookups from touching issues in unrelated Linear teams.
export async function attachmentInTeam(
  url: string,
): Promise<{ attachment: Attachment; issue: Issue } | null> {
  const { teamId } = bridgeConfig();
  const attachments = await linear().attachmentsForURL(url);
  for (const attachment of attachments.nodes) {
    const issue = await attachment.issue;
    if (!issue) continue;
    const team = await issue.team;
    if (team?.id === teamId) return { attachment, issue };
  }
  return null;
}

// Finds the issue mapped to a conversation via its URL attachment, returning the
// issue and attachment ids.
export async function findThreadMapping(
  url: string,
): Promise<{ issueId: string; attachmentId: string } | null> {
  const match = await attachmentInTeam(url);
  if (!match) return null;
  return { issueId: match.issue.id, attachmentId: match.attachment.id };
}

// Creates the linking attachment on a freshly created issue.
export async function createThreadAttachment(
  issueId: string,
  fields: ThreadAttachmentFields,
): Promise<void> {
  await linear().createAttachment({ issueId, ...fields });
  console.log(`[bridge] created attachment on ${issueId} -> ${fields.url}`);
}

// Updates the issue's linking attachment in place, or creates it if missing.
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
  console.log(`[bridge] updated attachment on ${issueId}`);
}
