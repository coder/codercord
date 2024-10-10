import { config } from "@lib/config.js";
import * as commands from "@commands/index.js";

import { REST, Routes } from "discord.js";

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(config.token);

const commandData = Object.values(commands).map((command) => command.data);

console.log(
  `Started refreshing ${commandData.length} application (/) commands.`,
);

// The put method is used to fully refresh all commands in the guild with the current set
// biome-ignore lint/suspicious/noExplicitAny: TODO: need to figure out the proper type
const data: any = await rest.put(
  Routes.applicationGuildCommands("1063886601165471814", config.serverId), // TODO: guess client ID from token
  { body: commandData },
);

console.log(`Successfully reloaded ${data.length} application (/) commands.`);
