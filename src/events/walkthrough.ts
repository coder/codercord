import {
  doWalkthrough,
  handleFieldButton,
  handleSelection,
} from "@commands/util/walkthrough.js";

import { type Client, Events } from "discord.js";

export default function registerEvents(client: Client) {
  // Do walkthrough whenever a thread is opened. Ignore re-cached threads
  // (newlyCreated is false on gateway reconnect) so we don't double-post.
  client.on(Events.ThreadCreate, async (channel, newlyCreated) => {
    if (!newlyCreated) return;
    await doWalkthrough(channel);
  });

  // Each selection advances the single walkthrough message; the answer buttons
  // are no-ops.
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      return handleSelection(interaction);
    }
    if (interaction.isButton()) {
      return handleFieldButton(interaction);
    }
  });
}
