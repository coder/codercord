import { bridgeConfig, linear } from "./client.js";

// Returns the workflow state type and name of an issue (e.g. type "started",
// name "In Progress").
export async function getIssueState(
  issueId: string,
): Promise<{ type: string; name: string } | null> {
  const issue = await linear().issue(issueId);
  const state = await issue.state;
  return state ? { type: state.type, name: state.name } : null;
}

// Moves an issue to a workflow state of the given type in the team. The started
// type has several states (In Progress, Blocked, In Review), so pass the state
// name; without one, the lowest-position state of the type is used.
export async function setIssueState(
  issueId: string,
  type: "completed" | "triage" | "started",
  preferredName?: string,
): Promise<void> {
  const stateId = await findStateId(type, preferredName);
  if (!stateId) return;
  console.debug(
    "[bridge]",
    "setting issue state",
    issueId,
    preferredName ?? type,
  );
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
