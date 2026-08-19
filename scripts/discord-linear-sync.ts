// Manual one-shot backfill: mirrors existing #help forum threads (and their
// recent messages) into Linear using the src/bridge/linear lib. Intended for
// seeding; re-running re-adds comments (issues/labels/attachments are
// deduped, comments are not), matching the MVP's per-run message dedup.
//
// Run with: bun scripts/discord-linear-sync.ts

import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type ThreadChannel,
} from "discord.js";

import { config } from "../src/lib/config.js";
import {
  buildHelpMessageContext,
  getHelpThreadContext,
} from "../src/lib/discord/help.js";
import { setIssueState } from "../src/bridge/linear/api.js";
import {
  ensureIssueForThread,
  mirrorMessage,
  mirrorThreadCreated,
} from "../src/bridge/linear/index.js";

const MESSAGE_LIMIT = 50;

async function syncThread(thread: ThreadChannel) {
  const ctx = getHelpThreadContext(thread);
  console.log(`Syncing "${ctx.title}" (${thread.id})`);

  await mirrorThreadCreated(ctx);
  const issueId = await ensureIssueForThread(ctx);

  const messages = await thread.messages.fetch({ limit: MESSAGE_LIMIT });
  // Oldest first so comments read in order.
  for (const message of [...messages.values()].reverse()) {
    const mctx = await buildHelpMessageContext(message);
    if (mctx) await mirrorMessage(mctx);
  }

  if (ctx.status === "closed") {
    await setIssueState(issueId, "completed");
  }
}

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await client.login(config.token);

  const forum = await client.channels.fetch(config.helpChannel.id);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new Error("helpChannel is not a forum channel");
  }

  const active = await forum.threads.fetchActive();
  const archived = await forum.threads.fetchArchived({
    limit: config.startupCatchupLimit,
  });
  const threads = [...active.threads.values(), ...archived.threads.values()];

  console.log(`Found ${threads.length} help threads to sync.`);
  for (const thread of threads) {
    try {
      await syncThread(thread);
    } catch (err) {
      console.error(`Failed to sync thread ${thread.id}:`, err);
    }
  }

  await client.destroy();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
