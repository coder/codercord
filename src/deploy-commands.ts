import * as commands from "./commands/index.js";
import { config } from "./lib/config.js";

import { REST, Routes } from "discord.js";

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(config.token);

const commandData = Object.values(commands).map(command => command.data);

console.log(`Started refreshing ${commandData.length} application (/) commands.`);

// The put method is used to fully refresh all commands in the guild with the current set
const data: Array<Record<string, unknown>> = await rest.put(
    Routes.applicationGuildCommands("1063886601165471814", config.serverId),
    { body: commandData },
);

console.log(`Successfully reloaded ${data.length} application (/) commands.`);