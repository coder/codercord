import { linearUser, linearError } from "./client.js";
import { rehost } from "./assets.js";

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

// Registers a custom emoji as a workspace emoji named discord-<id> so that
// :discord-<id>: renders inline. Idempotent: skips emojis that already exist and
// needs the user token, as the app actor cannot create emojis.
export async function ensureEmoji(
  id: string,
  animated: boolean,
): Promise<void> {
  const name = `discord-${id}`;
  const names = await loadEmojiNames();
  if (names.has(name)) return;

  const ext = animated ? "gif" : "png";
  // Linear rejects external image URLs, so re-host the source emoji first.
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
    console.log(`[bridge] registered emoji ${name}`);
  } catch (err) {
    console.error(`[bridge] ensureEmoji ${name} failed:`, linearError(err));
  }
}
