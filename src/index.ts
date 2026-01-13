import { config } from "./lib/config.js";

import registerCommandEvents from "./events/commands.js";
import registerWalkthroughEvents from "./events/walkthrough.js";
import registerMessageEvents from "./events/messages.js";
import registerChannelEvents from "./events/channels.js";

import { Client, Events, GatewayIntentBits, ActivityType } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const presenceList = [
  { type: ActivityType.Playing, name: "with Coder" },
  { type: ActivityType.Playing, name: "with code-server" },
  { type: ActivityType.Playing, name: "with wush" },
  { type: ActivityType.Playing, name: "with Mux (mux.coder.com)" },
  { type: ActivityType.Playing, name: "with Terraform" },
  { type: ActivityType.Listening, name: "to your issues" },
  { type: ActivityType.Watching, name: "over the Coder community" },
];

function shufflePresence() {
  const randomPresence =
    presenceList[Math.floor(Math.random() * presenceList.length)];

  return client.user.setPresence({
    activities: [randomPresence],

    status: "online",
  });
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  registerCommandEvents(client);
  registerWalkthroughEvents(client);
  registerMessageEvents(client);
  registerChannelEvents(client);

  shufflePresence();
  setInterval(shufflePresence, config.presenceDelay);
});

client.login(config.token);
