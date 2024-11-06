import { config } from "./lib/config.js";

import registerCommandEvents from "./events/commands.js";
import registerWalkthroughEvents from "./events/walkthrough.js";
import registerMessageEvents from "./events/messages.js";

import { Client, Events, GatewayIntentBits, ActivityType } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const presenceList = [
  { name: "with Coder", type: ActivityType.Playing },
  { name: "with code-server", type: ActivityType.Playing },
  { name: "with envbuilder", type: ActivityType.Playing },
  { name: "with wush", type: ActivityType.Playing },
  { name: "with Terraform", type: ActivityType.Playing },
  { name: "to your issues", type: ActivityType.Listening },
  { name: "over the Coder community", type: ActivityType.Watching },
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

  shufflePresence();
  setInterval(shufflePresence, config.presenceDelay);
});

client.login(config.token);
