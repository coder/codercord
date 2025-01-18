import type {    
    SlashCommandBuilder,
    ChatInputCommandInteraction,

    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    SlashCommandOptionsOnlyBuilder,
} from "discord.js";

import { default as close } from "./util/close.js";
import { default as reopen } from "./util/reopen.js";
import { default as walkthrough } from "./util/walkthrough.js";

type AnyCommandBuilder = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | ContextMenuCommandBuilder;
type AnyInteraction = ChatInputCommandInteraction | ContextMenuCommandInteraction;

const commandObject: { [key: string]: { data: AnyCommandBuilder, execute: (interaction: AnyInteraction) => unknown } } = {};

for (const command of [close, reopen, walkthrough]) {
    commandObject[command.data.name] = command;
}

export default commandObject;