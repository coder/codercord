import { type Client, Events, MessageType } from "discord.js";

export default function registerEvents(client: Client) {
  return client.on(Events.MessageCreate, async (message) => {
    // If the bot pins a message, then we delete the automatic announcement message
    if(message.type === MessageType.ChannelPinnedMessage && message.author.id === client.user.id) {
        await message.delete();
    }
  });
}
