import { debounce } from "throttle-debounce";

import {
  ChannelType,
  type Client,
  Events,
  SnowflakeUtil,
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
        await this.mirror.deletePost(
          await toPost(new HelpThread(thread), null),
        );
      } catch (err) {
        console.error("[bridge]", "thread delete failed", err);
      }
    });

    client.on(Events.MessageCreate, async (message) => {
      if (!message.inGuild() || !(await isHelpPost(message.channel))) return;
      if (!isHumanMessage(message) || isStarter(message)) return;
      try {
        const thread = message.channel as ThreadChannel;
        const post = await this.postFor(thread);
        if (await this.caughtUp(thread, post)) return;
        await this.mirror.addMessage(post, await toMessage(message));
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
        const post = await toPost(
          new HelpThread(message.channel as ThreadChannel),
          null,
        );
        await this.mirror.editMessage(
          post,
          await toMessage(message),
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
        const post = await toPost(new HelpThread(channel), null);
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
        const post = await toPost(
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
        const post = await toPost(
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
            const post = await this.postFor(thread);
            if (await this.caughtUp(thread, post)) return;
            await this.mirror.syncStatus(post);
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
    if (!channel?.isThread() || channel.archived) return;
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

  // Startup import of #help threads not fully in the hub yet, so threads and
  // messages from while the bridge was off still land as issues. `days` bounds
  // it to a recency window; -1 imports everything, paging through all archived
  // threads and waiting out rate limits.
  async backfill(): Promise<void> {
    const { days, limit } = config.linearBridge.deepBackfill;
    if (days === 0 || limit === 0) return;
    const all = days < 0;
    const cutoff = all ? 0 : Date.now() - days * 24 * 60 * 60 * 1000;

    const forum = await this.client.channels.fetch(config.helpChannel.id);
    if (!forum || forum.type !== ChannelType.GuildForum) return;

    const byId = new Map<string, ThreadChannel>();
    const active = await forum.threads.fetchActive();
    for (const thread of active.threads.values()) byId.set(thread.id, thread);

    // Page archived threads (ordered by archive time, newest first). A full
    // import walks every page; a windowed import stops once a page ends past the
    // cutoff, since older pages can only be older still.
    let before: Date | undefined;
    do {
      const page = await forum.threads.fetchArchived({ limit: 100, before });
      const threads = [...page.threads.values()];
      for (const thread of threads) byId.set(thread.id, thread);
      const oldest = threads.at(-1);
      const reachedCutoff =
        !all && (oldest?.archivedAt?.getTime() ?? 0) < cutoff;
      before =
        page.hasMore && !reachedCutoff
          ? (oldest?.archivedAt ?? undefined)
          : undefined;
    } while (before);

    const sorted = [...byId.values()].sort((a, b) =>
      (b.lastMessageId ?? "").localeCompare(a.lastMessageId ?? ""),
    );
    const windowed = all
      ? sorted
      : sorted.filter((t) => lastActivity(t) >= cutoff);
    const threads = limit >= 0 ? windowed.slice(0, limit) : windowed;

    const scope = all
      ? "(full import)"
      : `within ${days}d of ${byId.size} fetched`;
    const capped = limit >= 0 ? ` (limit ${limit})` : "";
    console.log(
      "[bridge]",
      "startup backfill:",
      threads.length,
      `thread(s) ${scope}${capped}`,
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

  // Mirrors a thread's full history when live backfill is on and it has no issue
  // yet, so a thread whose start the bridge missed lands complete on its first
  // live event. Returns true when it handled the thread, so the caller skips its
  // per-event mirror.
  private async caughtUp(thread: ThreadChannel, post: Post): Promise<boolean> {
    if (!config.linearBridge.backfill.enabled) return false;
    if (await this.mirror.isMirrored(post)) return false;
    await withRateLimitRetry(
      () => this.backfillThread(thread, true),
      isRateLimited,
    );
    return true;
  }

  // Mirrors a thread: ensures the issue exists, fills in missing messages, then
  // reconciles state. Safe to re-run over already-mirrored threads. Announces
  // the hub link back to the thread only when asked: off for the startup import
  // of many old threads, on for a live catch-up of an active one.
  private async backfillThread(
    thread: ThreadChannel,
    announce = false,
  ): Promise<void> {
    console.log("[bridge]", "backfilling thread", thread.id, thread.name);
    const help = new HelpThread(thread);

    // Older threads may predate the waiting-tag automation. If an open, active
    // thread has no waiting tag, derive one from its last message so the
    // mirrored issue gets a meaningful status. Skip archived threads: writing
    // tags would unarchive and bump them.
    if (help.isOpen && !thread.archived && help.waiting === null) {
      await reconcileThread(thread);
    }

    const starter = await thread.fetchStarterMessage().catch(() => null);
    const post = await toPost(help, starter);
    await this.mirror.createPost(post, announce);

    const fetched = await thread.messages.fetch({ limit: 100 });
    const messages = await Promise.all(
      [...fetched.values()]
        .reverse()
        .filter((m) => isHumanMessage(m) && !isStarter(m))
        .map(toMessage),
    );
    await this.mirror.backfillMessages(post, messages);

    await this.mirror.syncStatus(post, true);
  }

  private async postFor(thread: ThreadChannel): Promise<Post> {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    return await toPost(new HelpThread(thread), starter);
  }

  private messageRef(messageId: string, threadId: string): ExternalRef | null {
    if (messageId === threadId) return null;
    return { source: "discord", id: messageId, url: "" };
  }
}

// Best-effort last-activity time of a thread, from its last message (or its id
// when empty), decoded from the Discord snowflake.
function lastActivity(thread: ThreadChannel): number {
  return SnowflakeUtil.timestampFrom(thread.lastMessageId ?? thread.id);
}
