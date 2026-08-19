import { debounce } from "throttle-debounce";

import { type Client, Events, type ThreadChannel } from "discord.js";

import { config, validateLinearBridgeConfig } from "@lib/config.js";
import { isHelpPost } from "@lib/discord/channels.js";
import { isHumanMessage, resolveMember } from "@lib/discord/help.js";
import { HelpThread } from "@lib/discord/helpThread.js";
import { isTeamMember } from "@lib/discord/users.js";

import { LinearMirror } from "@bridge/linear/index.js";

export default function registerEvents(client: Client) {
  if (!config.linearBridge.enabled) {
    console.log("Linear bridge is disabled.");
    return;
  }

  validateLinearBridgeConfig();

  client.on(Events.ThreadCreate, async (thread) => {
    if (!(await isHelpPost(thread))) return;
    try {
      await new LinearMirror(new HelpThread(thread)).create();
    } catch (err) {
      console.error("Linear bridge: thread create failed:", err);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
    if (!isHumanMessage(message)) return;
    try {
      const member = await resolveMember(message);
      const help = new HelpThread(message.channel as ThreadChannel);
      await new LinearMirror(help).addMessage(
        message,
        member ? isTeamMember(member) : false,
      );
    } catch (err) {
      console.error("Linear bridge: message create failed:", err);
    }
  });

  // Coalesce bursts of tag edits, keeping the first "before" state so a
  // closed/reopened transition can be detected once the dust settles.
  const beforeStates = new Map<string, HelpThread>();
  const flush = debounce(
    1000,
    async (threadId: string, newThread: ThreadChannel) => {
      const before = beforeStates.get(threadId);
      beforeStates.delete(threadId);

      const help = new HelpThread(newThread);
      const reason =
        before && before.isClosed !== help.isClosed
          ? help.isClosed
            ? "closed"
            : "reopened"
          : undefined;

      try {
        await new LinearMirror(help).syncStatus(reason);
      } catch (err) {
        console.error("Linear bridge: thread update failed:", err);
      }
    },
  );

  client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
    if (!(await isHelpPost(newThread))) return;
    if (!beforeStates.has(newThread.id)) {
      beforeStates.set(newThread.id, new HelpThread(oldThread));
    }
    flush(newThread.id, newThread);
  });

  console.log("Linear bridge is enabled.");
}
