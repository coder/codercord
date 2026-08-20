import { bridgeConfig, linearUser } from "./client.js";

// Flat (ungrouped) labels are used rather than a label group because Linear
// allows only one label per group on an issue, while a conversation can carry
// several tags. Each label is namespaced by name, e.g. "#help > tag".
const labelIdByName = new Map<string, string>();

// Finds or creates a team label with the given name, tagging its description
// with the source tag id. Cached by name. Runs on the user token, which owns
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
    console.debug("[bridge]", "created label", name);
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

  console.debug(
    "[bridge]",
    "updating labels",
    issueId,
    `+${addedLabelIds.length}`,
    `-${removedLabelIds.length}`,
  );
  await linearUser().updateIssue(issueId, { addedLabelIds, removedLabelIds });
}
