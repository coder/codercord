import { type Client, Events, MessageType } from "discord.js";

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

    // Keep the help post's waiting tag in sync with the latest interaction.
    if (message.inGuild() && (await isHelpPost(message.channel))) {
      await reconcileFromMessage(message);
    }
  });
}
