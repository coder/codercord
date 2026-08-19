import { debounce } from "throttle-debounce";

import {
  ChannelType,
  type Client,
  Events,
  type ThreadChannel,
} from "discord.js";

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
      console.log(
        `[bridge] MessageUpdate id=${message.id} oldPartial=${oldMessage.partial} attNew=${message.attachments.size}`,
      );
      if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
      if (!isHumanMessage(message)) return;
      // Ignore edits that changed neither text nor attachments (e.g. an embed
      // unfurling or a pin) when the previous state is known.
      if (
        !oldMessage.partial &&
        oldMessage.content === message.content &&
        oldMessage.attachments.size === message.attachments.size &&
        oldMessage.attachments.every((_a, id) => message.attachments.has(id))
      ) {
        return;
      }
      const help = new HelpThread(message.channel as ThreadChannel);
      await new LinearMirror(help).editMessage(message);
    } catch (err) {
      console.error("Linear bridge: message update failed:", err);
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    try {
      const channel = message.channel;
      console.log(
        `[bridge] MessageDelete id=${message.id} chanType=${channel?.type} isThread=${channel?.isThread?.()}`,
      );
      if (!channel.isThread() || !(await isHelpPost(channel))) return;
      await new LinearMirror(new HelpThread(channel)).deleteMessage(message.id);
    } catch (err) {
      console.error("Linear bridge: message delete failed:", err);
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (user.bot) return;
      const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;
      if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
      // The app aggregates reactions under one identity, so only the first
      // Discord reaction of an emoji is mirrored.
      const resolved = message.reactions.resolve(
        reaction.emoji.id ?? reaction.emoji.name,
      );
      if (resolved?.count !== 1) return;
      const help = new HelpThread(message.channel as ThreadChannel);
      await new LinearMirror(help).addReaction(message, reaction.emoji);
    } catch (err) {
      console.error("Linear bridge: reaction add failed:", err);
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction) => {
    try {
      const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;
      if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
      // Only remove the mirrored reaction once the last Discord user removes it.
      const resolved = message.reactions.resolve(
        reaction.emoji.id ?? reaction.emoji.name,
      );
      if (resolved && resolved.count > 0) return;
      const help = new HelpThread(message.channel as ThreadChannel);
      await new LinearMirror(help).removeReaction(message, reaction.emoji);
    } catch (err) {
      console.error("Linear bridge: reaction remove failed:", err);
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

// Mirrors the most recently active help threads that aren't fully in Linear
// yet, so threads and messages from while the bridge was off still land as
// issues. Runs in the background on startup.
export async function backfillHelpThreads(client: Client): Promise<void> {
  if (!config.linearBridge.enabled || config.linearBridge.backfillLimit <= 0) {
    return;
  }

  const forum = await client.channels.fetch(config.helpChannel.id);
  if (!forum || forum.type !== ChannelType.GuildForum) return;

  // Include archived threads so older posts are covered, not just active ones.
  const [active, archived] = await Promise.all([
    forum.threads.fetchActive(),
    forum.threads.fetchArchived({ limit: config.linearBridge.backfillLimit }),
  ]);
  const byId = new Map<string, ThreadChannel>();
  for (const thread of [
    ...active.threads.values(),
    ...archived.threads.values(),
  ]) {
    byId.set(thread.id, thread);
  }

  const recent = [...byId.values()]
    .sort((a, b) =>
      (b.lastMessageId ?? "").localeCompare(a.lastMessageId ?? ""),
    )
    .slice(0, config.linearBridge.backfillLimit);

  for (const thread of recent) {
    try {
      await backfillThread(thread);
    } catch (err) {
      console.error(`Linear bridge: backfill failed for ${thread.id}:`, err);
    }
  }
}

// Mirrors a thread: ensures the issue exists, fills in any messages missing
// from Linear, then reconciles state. Safe to run over already-mirrored
// threads (existing messages are skipped).
async function backfillThread(thread: ThreadChannel): Promise<void> {
  const mirror = new LinearMirror(new HelpThread(thread));
  await mirror.create(false);

  const messages = await thread.messages.fetch({ limit: 100 });
  const human = [...messages.values()].reverse().filter(isHumanMessage);
  await mirror.backfillMessages(human);

  await mirror.syncStatus(true);
}
