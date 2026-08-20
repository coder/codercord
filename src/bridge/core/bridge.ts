import type { Client } from "discord.js";

import { config, validateLinearBridgeConfig } from "@lib/config.js";

import { DiscordConnector } from "@bridge/discord/index.js";
import { LinearConnector } from "@bridge/linear/index.js";

// Composition root: wires the Discord source to the Linear hub. Adding a source
// (e.g. GitHub Discussions) means constructing another connector here.
let connector: DiscordConnector | undefined;

export function registerBridge(client: Client): void {
  if (!config.linearBridge.enabled) {
    console.log("Linear bridge is disabled.");
    return;
  }
  validateLinearBridgeConfig();
  connector = new DiscordConnector(client, new LinearConnector());
  connector.register();
}

export async function backfillBridge(client: Client): Promise<void> {
  if (!config.linearBridge.enabled) return;
  const source =
    connector ?? new DiscordConnector(client, new LinearConnector());
  await source.backfill();
}
