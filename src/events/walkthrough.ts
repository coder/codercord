import { doWalkthrough } from "@commands/util/walkthrough.js";
import { handleSelection } from "@ui/walkthrough.js";

import { type Client, Events } from "discord.js";

export default function registerEvents(client: Client) {
  // Run the walkthrough whenever a thread is opened.
  client.on(Events.ThreadCreate, async (channel) => doWalkthrough(channel));

  // Advance the walkthrough as the user answers each select menu.
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      await handleSelection(interaction);
    }
  });
}
