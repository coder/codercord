import { type ThreadChannel } from "discord.js";

// Discord does not let bots control the display order of a forum post's
// applied tags, so the open/closed tag often collapses into "+N". A title
// prefix is always visible, so we mirror the status there too.
export const OPEN_PREFIX = "\uD83D\uDFE2";
export const CLOSED_PREFIX = "\uD83D\uDD34";

const MAX_THREAD_NAME_LENGTH = 100;
const STATUS_PREFIXES = [OPEN_PREFIX, CLOSED_PREFIX];

// Removes any leading status prefix (and following whitespace) from a name.
function stripStatusPrefix(name: string): string {
  let base = name.trimStart();
  for (const prefix of STATUS_PREFIXES) {
    if (base.startsWith(prefix)) {
      base = base.slice(prefix.length).trimStart();
    }
  }
  return base;
}

// Prefixes the thread title with the status emoji, replacing any existing one.
// Discord unarchives a thread when it is renamed, so callers must apply the
// status BEFORE archiving or locking, otherwise the post reopens.
export async function applyStatusToTitle(
  thread: ThreadChannel,
  closed: boolean,
): Promise<void> {
  const prefix = closed ? CLOSED_PREFIX : OPEN_PREFIX;
  const base = stripStatusPrefix(thread.name);
  const maxBaseLength = MAX_THREAD_NAME_LENGTH - prefix.length - 1;
  const nextName = `${prefix} ${base.slice(0, maxBaseLength)}`;

  if (thread.name === nextName) return;
  await thread.setName(nextName);
}
