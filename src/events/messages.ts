import { type Client, Events, MessageType } from "discord.js";

import { bus } from "@lib/bus.js";
import { isHelpPost } from "@lib/discord/channels.js";
import { reconcileFromMessage } from "@lib/discord/help.js";

export default function registerEvents(client: Client) {
  return client.on(Events.MessageCreate, async (message) => {
    // If the bot pins a message, then we delete the automatic announcement message
    if (
      message.type === MessageType.ChannelPinnedMessage &&
      message.author.id === client.user.id
    ) {
      await message.delete();
      return;
    }

    // Keep the help posts' waiting tag in sync with the latest interaction, and
    // forward the enriched message to the domain bus for consumers (bridges).
    if (message.inGuild() && (await isHelpPost(message.channel))) {
      const ctx = await reconcileFromMessage(message);
      if (ctx) bus.emit("helpMessagePosted", ctx);
    }
  });
}
