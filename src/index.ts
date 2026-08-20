import { config } from "./lib/config.js";
import { catchUpHelpPosts } from "./lib/discord/help.js";

import registerCommandEvents from "./events/commands.js";
import registerWalkthroughEvents from "./events/walkthrough.js";
import registerMessageEvents from "./events/messages.js";
import registerChannelEvents from "./events/channels.js";
import { registerBridge, backfillBridge } from "@bridge/core/bridge.js";

import {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType,
  Partials,
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  // Needed so edits/deletes/reactions on uncached messages still emit events.
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
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
  registerBridge(client);

  shufflePresence();
  setInterval(shufflePresence, config.presenceDelay);

  catchUpHelpPosts(client).catch((err) =>
    console.error("Failed to catch up on help posts:", err),
  );

  backfillBridge(client).catch((err) =>
    console.error("Linear bridge: backfill failed:", err),
  );
});

client.login(config.token);
