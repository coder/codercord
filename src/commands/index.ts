import fs from "node:fs/promises";
import path from "node:path";

export async function loadCommands(): Promise<Map<string, any>> {
    const commands = new Map();

    const foldersPath = path.join(__dirname, "commands");
    const commandFolders = await fs.readdir(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = await fs
            .readdir(commandsPath)
            .then((files) => files.filter((file) => file.endsWith(".js")));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = await import(filePath);

            if ("data" in command && "execute" in command) {
                commands.set(command.data.name, command);
            } else {
                throw new Error(
                    `The command at ${filePath} is missing a required "data" or "execute" property.`,
                );
            }
        }
    }

    return commands;
}
