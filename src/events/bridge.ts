import { debounce } from "throttle-debounce";

import { type Client, Events, type ThreadChannel } from "discord.js";

import { config, validateLinearBridgeConfig } from "@lib/config.js";
import { isHelpPost } from "@lib/discord/channels.js";
import { isHumanMessage } from "@lib/discord/help.js";
import { HelpThread } from "@lib/discord/helpThread.js";

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

  client.on(Events.ThreadDelete, async (thread) => {
    if (!(await isHelpPost(thread))) return;
    try {
      await new LinearMirror(new HelpThread(thread)).delete();
    } catch (err) {
      console.error("Linear bridge: thread delete failed:", err);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
    if (!isHumanMessage(message)) return;
    try {
      const help = new HelpThread(message.channel as ThreadChannel);
      await new LinearMirror(help).addMessage(message);
    } catch (err) {
      console.error("Linear bridge: message create failed:", err);
    }
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      const message = newMessage.partial
        ? await newMessage.fetch()
        : newMessage;
      if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
      if (!isHumanMessage(message)) return;
      // Ignore non-content edits (embeds, pins) when the old content is known.
      if (!oldMessage.partial && oldMessage.content === message.content) return;
      const help = new HelpThread(message.channel as ThreadChannel);
      await new LinearMirror(help).editMessage(message);
    } catch (err) {
      console.error("Linear bridge: message update failed:", err);
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    try {
      const channel = message.channel;
      if (!channel.isThread() || !(await isHelpPost(channel))) return;
      await new LinearMirror(new HelpThread(channel)).deleteMessage(message.id);
    } catch (err) {
      console.error("Linear bridge: message delete failed:", err);
    }
  });

  // Coalesce bursts of tag edits per thread. syncStatus is idempotent and
  // reconciles against the Linear issue state, so no before/after diff is kept.
  const flushers = new Map<string, (thread: ThreadChannel) => void>();

  client.on(Events.ThreadUpdate, async (_oldThread, newThread) => {
    if (!(await isHelpPost(newThread))) return;

    let flush = flushers.get(newThread.id);
    if (!flush) {
      flush = debounce(1000, async (thread: ThreadChannel) => {
        flushers.delete(thread.id);
        try {
          await new LinearMirror(new HelpThread(thread)).syncStatus();
        } catch (err) {
          console.error("Linear bridge: thread update failed:", err);
        }
      });
      flushers.set(newThread.id, flush);
    }
    flush(newThread);
  });

  console.log("Linear bridge is enabled.");
}
