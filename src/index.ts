import { config } from "./lib/config.js";

import registerCommandEvents from "./events/commands.js";
import registerWalkthroughEvents from "./events/walkthrough.js";

import { Client, Events, GatewayIntentBits, ActivityType } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const presenceList = [
  { name: "with Coder OSS", type: ActivityType.Playing },
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

  shufflePresence();
  setInterval(shufflePresence, config.presenceDelay);
});

client.login(config.token);
