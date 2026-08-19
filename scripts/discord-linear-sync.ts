// One-shot backfill: mirrors existing #help threads and their recent messages
// into Linear via src/bridge/linear. Re-running re-adds comments (issues,
// labels, and attachments are deduped; comments are not).
//
// Run: bun run sync:linear

import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type ThreadChannel,
} from "discord.js";

import { config } from "../src/lib/config.js";
import { isHumanMessage, resolveMember } from "../src/lib/discord/help.js";
import { HelpThread } from "../src/lib/discord/helpThread.js";
import { isTeamMember } from "../src/lib/discord/users.js";
import { setIssueState } from "../src/bridge/linear/api.js";
import { LinearMirror } from "../src/bridge/linear/index.js";

const MESSAGE_LIMIT = 50;

async function syncThread(thread: ThreadChannel) {
  const help = new HelpThread(thread);
  const mirror = new LinearMirror(help);
  console.log(`Syncing "${help.title}" (${thread.id})`);

  await mirror.create();

  const messages = await thread.messages.fetch({ limit: MESSAGE_LIMIT });
  // Oldest first so comments read in order.
  for (const message of [...messages.values()].reverse()) {
    if (!isHumanMessage(message)) continue;
    const member = await resolveMember(message);
    await mirror.addMessage(message, member ? isTeamMember(member) : false);
  }

  if (help.isClosed) {
    await setIssueState(await mirror.ensureIssue(), "completed");
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
