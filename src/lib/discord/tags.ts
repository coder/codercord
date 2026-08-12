import { ChannelType, type ThreadChannel } from "discord.js";

// Discord renders a forum post's tags in the order of its applied_tags array
// rather than the channel's configured tag order. Reorder applied tags to
// follow the parent forum's tag configuration so status tags (open/closed),
// which come first in the help channel settings, always lead the list.
export function orderAppliedTags(
  thread: ThreadChannel,
  tags: string[],
): string[] {
  const parent = thread.parent;
  const order =
    parent?.type === ChannelType.GuildForum
      ? parent.availableTags.map((tag) => tag.id)
      : [];

  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...new Set(tags)].sort((a, b) => rank(a) - rank(b));
}
