import { config } from "./lib/config.js";

import registerCommandEvents from "./events/commands.js";
import registerWalkthroughEvents from "./events/walkthrough.js";

import { Client, Events, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [ GatewayIntentBits.Guilds ] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  registerCommandEvents(client);
  registerWalkthroughEvents(client);
});

client.login(config.token);
