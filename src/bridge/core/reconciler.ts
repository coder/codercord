import type { Post } from "@bridge/core/model.js";
import type { Target } from "@bridge/core/connector.js";

// Maps a post's lifecycle onto the hub's workflow state. The source is
// authoritative for its own lifecycle: closed -> Done, waiting on the user ->
// Blocked, waiting on the team -> In Progress. A new post stays in Triage until
// the team first engages (moves it out of Triage); a reopened issue with no
// waiting signal falls back to Triage. During backfill the issue is freshly
// created in Triage, so the "team engaged" gate is skipped and the waiting
// signal drives the state directly.
//
// Transitions are decided against the current hub state, not a source old/new
// diff, so out-of-band changes (e.g. a /close command) are detected reliably.
export async function syncState(
  target: Target,
  issueId: string,
  post: Post,
  backfill: boolean,
): Promise<void> {
  const state = await target.getState(issueId);

  if (post.lifecycle === "closed") {
    if (state?.type !== "completed") {
      await target.setState(issueId, "completed");
      await target.note(
        issueId,
        "_Thread closed on Discord._",
        post.closedAt ?? undefined,
      );
    }
    return;
  }

  if (state?.type === "completed") {
    await target.note(issueId, "_Thread reopened on Discord._");
  }

  if (post.waiting === "user") {
    if (state?.name !== "Blocked") {
      await target.setState(issueId, "started", "Blocked");
    }
    return;
  }

  if (post.waiting === "team") {
    if (!backfill && state?.type === "triage") return;
    if (state?.name !== "In Progress") {
      await target.setState(issueId, "started", "In Progress");
    }
    return;
  }

  // No waiting signal: send a reopened issue back to Triage.
  if (state?.type === "completed") {
    await target.setState(issueId, "triage");
  }
}
