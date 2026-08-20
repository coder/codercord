import { debounce } from "throttle-debounce";

import {
  ChannelType,
  type Client,
  Events,
  type ThreadChannel,
} from "discord.js";

import { config } from "@lib/config.js";
import { isHelpPost } from "@lib/discord/channels.js";
import { isHumanMessage, reconcileThread } from "@lib/discord/help.js";
import { HelpThread } from "@lib/discord/helpThread.js";

import type { ExternalRef, Post } from "@bridge/core/model.js";
import type { Source, Target } from "@bridge/core/connector.js";
import { Mirror } from "@bridge/core/mirror.js";
import { withRateLimitRetry } from "@bridge/core/backfill.js";

import { isRateLimited } from "@bridge/linear/client.js";

import { isStarter, toMessage, toPost, toReaction } from "./map.js";

// Discord #help forum as a bridge source: listens for thread/message/reaction
// events, maps them onto the canonical model, and drives the mirror. Also
// enumerates threads for the startup backfill and writes the hub issue link back
// into the thread.
export class DiscordConnector implements Source {
  private readonly mirror: Mirror;

  constructor(
    private readonly client: Client,
    target: Target,
  ) {
    this.mirror = new Mirror(target, this);
  }

  register(): void {
    const client = this.client;

    client.on(Events.ThreadCreate, async (thread) => {
      if (!(await isHelpPost(thread))) return;
      try {
        await this.mirror.createPost(await this.postFor(thread));
      } catch (err) {
        console.error("[bridge]", "thread create failed", err);
      }
    });

    client.on(Events.ThreadDelete, async (thread) => {
      if (!(await isHelpPost(thread))) return;
      try {
        await this.mirror.deletePost(toPost(new HelpThread(thread), null));
      } catch (err) {
        console.error("[bridge]", "thread delete failed", err);
      }
    });

    client.on(Events.MessageCreate, async (message) => {
      if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
      if (!isHumanMessage(message) || isStarter(message)) return;
      try {
        const post = await this.postFor(message.channel as ThreadChannel);
        await this.mirror.addMessage(post, toMessage(message));
      } catch (err) {
        console.error("[bridge]", "message create failed", err);
      }
    });

    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
      try {
        const message = newMessage.partial
          ? await newMessage.fetch()
          : newMessage;
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
        const post = toPost(
          new HelpThread(message.channel as ThreadChannel),
          null,
        );
        await this.mirror.editMessage(
          post,
          toMessage(message),
          isStarter(message),
        );
      } catch (err) {
        console.error("[bridge]", "message update failed", err);
      }
    });

    client.on(Events.MessageDelete, async (message) => {
      try {
        const channel = message.channel;
        if (!channel.isThread() || !(await isHelpPost(channel))) return;
        const post = toPost(new HelpThread(channel), null);
        const ref: ExternalRef = {
          source: "discord",
          id: message.id,
          url: "",
        };
        await this.mirror.deleteMessage(post, ref, message.id === channel.id);
      } catch (err) {
        console.error("[bridge]", "message delete failed", err);
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
        const post = toPost(
          new HelpThread(message.channel as ThreadChannel),
          null,
        );
        await this.mirror.addReaction(
          post,
          this.messageRef(message.id, message.channelId),
          toReaction(reaction.emoji),
        );
      } catch (err) {
        console.error("[bridge]", "reaction add failed", err);
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
        const post = toPost(
          new HelpThread(message.channel as ThreadChannel),
          null,
        );
        await this.mirror.removeReaction(
          post,
          this.messageRef(message.id, message.channelId),
          toReaction(reaction.emoji),
        );
      } catch (err) {
        console.error("[bridge]", "reaction remove failed", err);
      }
    });

    // Coalesce bursts of tag edits per thread. syncStatus is idempotent and
    // reconciles against the hub state, so no before/after diff is kept.
    const flushers = new Map<string, (thread: ThreadChannel) => void>();
    client.on(Events.ThreadUpdate, async (_oldThread, newThread) => {
      if (!(await isHelpPost(newThread))) return;
      let flush = flushers.get(newThread.id);
      if (!flush) {
        flush = debounce(1000, async (thread: ThreadChannel) => {
          flushers.delete(thread.id);
          try {
            await this.mirror.syncStatus(await this.postFor(thread));
          } catch (err) {
            console.error("[bridge]", "thread update failed", err);
          }
        });
        flushers.set(newThread.id, flush);
      }
      flush(newThread);
    });

    console.log("[bridge]", "enabled");
  }

  async announce(
    post: Post,
    issue: { identifier: string; url: string },
  ): Promise<void> {
    const channel = await this.client.channels.fetch(post.ref.id);
    if (!channel?.isThread()) return;
    await channel.send({
      embeds: [{ description: `[${issue.identifier}](${issue.url})` }],
    });
    console.debug(
      "[bridge]",
      "announced",
      issue.identifier,
      "in thread",
      post.ref.id,
    );
  }

  // Mirrors #help threads that aren't fully in the hub yet, so threads and
  // messages from while the bridge was off still land as issues. With backfillAll
  // it imports every thread, paging through all archived threads and waiting out
  // rate limits.
  async backfill(): Promise<void> {
    const { backfillAll, backfillLimit } = config.linearBridge;
    if (!backfillAll && backfillLimit <= 0) return;

    const forum = await this.client.channels.fetch(config.helpChannel.id);
    if (!forum || forum.type !== ChannelType.GuildForum) return;

    const byId = new Map<string, ThreadChannel>();
    const active = await forum.threads.fetchActive();
    for (const thread of active.threads.values()) byId.set(thread.id, thread);

    // Pull archived threads too. For a full import, page through every archived
    // thread; otherwise a single page bounded by the limit is enough.
    let before: Date | undefined;
    do {
      const page = await forum.threads.fetchArchived({
        limit: backfillAll ? 100 : backfillLimit,
        before,
      });
      const last = [...page.threads.values()].at(-1);
      for (const thread of page.threads.values()) byId.set(thread.id, thread);
      before =
        backfillAll && page.hasMore
          ? (last?.archivedAt ?? undefined)
          : undefined;
    } while (before);

    const sorted = [...byId.values()].sort((a, b) =>
      (b.lastMessageId ?? "").localeCompare(a.lastMessageId ?? ""),
    );
    const threads = backfillAll ? sorted : sorted.slice(0, backfillLimit);

    console.log(
      "[bridge]",
      "startup backfill:",
      threads.length,
      "thread(s)",
      backfillAll
        ? "(full import)"
        : `of ${byId.size} fetched (limit ${backfillLimit})`,
    );
    for (const thread of threads) {
      try {
        await withRateLimitRetry(
          () => this.backfillThread(thread),
          isRateLimited,
        );
      } catch (err) {
        console.error("[bridge]", "backfill failed for thread", thread.id, err);
      }
    }
    console.log("[bridge]", "startup backfill complete");
  }

  // Mirrors a thread: ensures the issue exists, fills in missing messages, then
  // reconciles state. Safe to re-run over already-mirrored threads.
  private async backfillThread(thread: ThreadChannel): Promise<void> {
    console.log("[bridge]", "backfilling thread", thread.id, thread.name);
    const help = new HelpThread(thread);

    // Older threads may predate the waiting-tag automation. If an open thread
    // has no waiting tag, derive one from its last message so the mirrored issue
    // gets a meaningful status.
    if (help.isOpen && help.waiting === null) {
      await reconcileThread(thread);
    }

    const starter = await thread.fetchStarterMessage().catch(() => null);
    const post = toPost(help, starter);
    await this.mirror.createPost(post, false);

    const fetched = await thread.messages.fetch({ limit: 100 });
    const messages = [...fetched.values()]
      .reverse()
      .filter((m) => isHumanMessage(m) && !isStarter(m))
      .map(toMessage);
    await this.mirror.backfillMessages(post, messages);

    await this.mirror.syncStatus(post, true);
  }

  private async postFor(thread: ThreadChannel): Promise<Post> {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    return toPost(new HelpThread(thread), starter);
  }

  private messageRef(messageId: string, threadId: string): ExternalRef | null {
    if (messageId === threadId) return null;
    return { source: "discord", id: messageId, url: "" };
  }
}
