import { config } from "../lib/config.js";
import { getTagsForCloseState } from "../commands/util/close.js";
import { isHelpPost } from "../lib/discord/channels.js";

import { debounce } from "throttle-debounce";

import { type Client, Events, type ThreadChannel } from "discord.js";

// Map to store initial thread states
const threadUpdateMap = new Map<string, ThreadChannel>();

// Create a debounced handler for processing thread updates
const handleEvent = debounce(
  1000,
  async (threadId: string, newThread: ThreadChannel) => {
    const initialThread = threadUpdateMap.get(threadId);
    if (!initialThread) return;

    // Remove from map
    threadUpdateMap.delete(threadId);

    // Handle tag additions
    const addedTags = newThread.appliedTags.filter(
      (t) => !initialThread.appliedTags.includes(t),
    );
    if (addedTags.length > 0) {
      for (const tag of addedTags) {
        // If closed/opened tag is added, remove the opposite tag
        if (
          tag === config.helpChannel.closedTag ||
          tag === config.helpChannel.openedTag
        ) {
          const isClose = tag === config.helpChannel.closedTag;
          const { tagToRemove } = getTagsForCloseState(isClose);
          if (newThread.appliedTags.includes(tagToRemove)) {
            await newThread.setAppliedTags(
              newThread.appliedTags.filter((t) => t !== tagToRemove),
            );
          }
        }
      }
    }

    // Handle tag removals
    const removedTags = initialThread.appliedTags.filter(
      (t) => !newThread.appliedTags.includes(t),
    );
    if (removedTags.length > 0) {
      for (const tag of removedTags) {
        // If closed or opened tag is removed, add it back only if its opposite isn't present
        if (
          tag === config.helpChannel.closedTag ||
          tag === config.helpChannel.openedTag
        ) {
          const isClose = tag === config.helpChannel.closedTag;
          const { tagToRemove } = getTagsForCloseState(isClose);
          if (!newThread.appliedTags.includes(tagToRemove)) {
            await newThread.setAppliedTags([...newThread.appliedTags, tag]);
          }
        }
      }
    }
  },
);

export default function registerEvents(client: Client) {
  client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
    if (!(await isHelpPost(newThread))) {
      return;
    }

    // Store the initial state if this is the first update
    if (!threadUpdateMap.has(newThread.id)) {
      threadUpdateMap.set(newThread.id, oldThread);
    }

    // Trigger the debounced handler
    handleEvent(newThread.id, newThread);
  });
}
