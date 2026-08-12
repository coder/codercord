import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";

import { default as product_notes } from "./product/notes.js";

import { default as close } from "./util/close.js";
import { default as reopen } from "./util/reopen.js";
import { default as updateThread } from "./util/update-thread.js";
import { default as walkthrough } from "./util/walkthrough.js";

type AnyCommandBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | ContextMenuCommandBuilder;
type AnyInteraction =
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction;

const commandObject: {
  [key: string]: {
    data: AnyCommandBuilder;
    execute: (interaction: AnyInteraction) => unknown;
  };
} = {};

for (const command of [
  product_notes,
  close,
  reopen,
  updateThread,
  walkthrough,
]) {
  commandObject[command.data.name] = command;
}

export default commandObject;
