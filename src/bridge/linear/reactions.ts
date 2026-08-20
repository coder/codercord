import { linear, linearError } from "./client.js";

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
    console.log(`[bridge] added reaction ${reactionKey(target, emoji)}`);
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
  console.log(`[bridge] removed reaction ${key}`);
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
