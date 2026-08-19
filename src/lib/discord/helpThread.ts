import { config } from "@lib/config.js";

import type { ThreadChannel } from "discord.js";

// A Discord forum tag applied to a help post.
export interface HelpTag {
  id: string;
  name: string;
}

// Enriched view over a #help forum post. Wrap a thread with
// `new HelpThread(thread)` and read its lifecycle state via getters, computed
// lazily from the thread's applied tags (cached or freshly fetched upstream).
export class HelpThread {
  constructor(readonly thread: ThreadChannel) {}

  get url(): string {
    return this.thread.url;
  }

  get title(): string {
    return this.thread.name;
  }

  get status(): "open" | "closed" {
    return this.isClosed ? "closed" : "open";
  }

  get isClosed(): boolean {
    return this.thread.appliedTags.includes(config.helpChannel.closedTag);
  }

  get isOpen(): boolean {
    return !this.isClosed;
  }

  get waiting(): "user" | "team" | null {
    const { waitingForTeamTag, waitingForUserTag } = config.helpChannel;
    const tags = this.thread.appliedTags;
    if (tags.includes(waitingForTeamTag)) return "team";
    if (tags.includes(waitingForUserTag)) return "user";
    return null;
  }

  // Applied tags (minus the lifecycle tags: open/closed and the waiting-for
  // tags, which are surfaced as the mirrored issue's status), resolved to
  // id + name from the parent forum's tag list.
  get tags(): HelpTag[] {
    const forum = this.thread.parent;
    const available =
      forum && "availableTags" in forum ? forum.availableTags : [];
    const nameById = new Map(available.map((t) => [t.id, t.name]));

    const { closedTag, openedTag, waitingForUserTag, waitingForTeamTag } =
      config.helpChannel;
    const hidden = new Set([
      closedTag,
      openedTag,
      waitingForUserTag,
      waitingForTeamTag,
    ]);
    return this.thread.appliedTags
      .filter((id) => !hidden.has(id))
      .map((id) => ({ id, name: nameById.get(id) ?? id }));
  }
}
