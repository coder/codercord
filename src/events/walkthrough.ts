import {
  doWalkthrough,
  handleFieldButton,
  handleSelection,
} from "@commands/util/walkthrough.js";

import { type Client, Events } from "discord.js";

export default function registerEvents(client: Client) {
  // Do walkthrough whenever a thread is opened
  client.on(Events.ThreadCreate, async (channel) => doWalkthrough(channel));

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
