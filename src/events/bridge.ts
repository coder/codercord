import { debounce } from "throttle-debounce";

import { type Client, Events, type ThreadChannel } from "discord.js";

import { config, validateLinearBridgeConfig } from "@lib/config.js";
import { isHelpPost } from "@lib/discord/channels.js";
import { isHumanMessage, resolveMember } from "@lib/discord/help.js";
import { HelpThread } from "@lib/discord/helpThread.js";
import { isTeamMember } from "@lib/discord/users.js";

import {
  mirrorMessage,
  mirrorStatus,
  mirrorThreadCreated,
} from "@bridge/linear/index.js";

// Runs bridge work in the background, logging failures instead of throwing them
// into a Discord event handler.
function guard(name: string, work: Promise<void>): void {
  work.catch((err) => console.error(`Linear bridge "${name}" failed:`, err));
}

export default function registerEvents(client: Client) {
  if (!config.linearBridge.enabled) {
    console.log("Linear bridge is disabled.");
    return;
  }

  validateLinearBridgeConfig();

  client.on(Events.ThreadCreate, async (thread) => {
    if (!(await isHelpPost(thread))) return;
    guard("threadCreate", mirrorThreadCreated(new HelpThread(thread)));
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
    if (!isHumanMessage(message)) return;

    const member = await resolveMember(message);
    const help = new HelpThread(message.channel as ThreadChannel);
    const isTeam = member ? isTeamMember(member) : false;
    guard("messageCreate", mirrorMessage(help, message, isTeam));
  });

  // Coalesce bursts of tag edits, remembering the first "before" state so a
  // closed/reopened transition can be detected once the dust settles.
  const initialStates = new Map<string, HelpThread>();
  const flush = debounce(1000, (threadId: string, newThread: ThreadChannel) => {
    const before = initialStates.get(threadId);
    initialStates.delete(threadId);

    const after = new HelpThread(newThread);
    const reason =
      before && before.status !== after.status
        ? after.status === "closed"
          ? "closed"
          : "reopened"
        : undefined;

    guard("threadUpdate", mirrorStatus(after, reason));
  });

  client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
    if (!(await isHelpPost(newThread))) return;
    if (!initialStates.has(newThread.id)) {
      initialStates.set(newThread.id, new HelpThread(oldThread));
    }
    flush(newThread.id, newThread);
  });

  console.log("Linear bridge is enabled.");
}
