import type { Client } from "discord.js";

import { bus } from "@lib/bus.js";
import { config, validateLinearBridgeConfig } from "@lib/config.js";

import {
  mirrorMessage,
  mirrorStatus,
  mirrorThreadCreated,
} from "@bridge/linear/index.js";

// Wraps an async bus handler so a Linear failure is logged, never thrown into
// the emitter (which would surface as an unhandled rejection).
function guard<T>(
  name: string,
  handler: (ctx: T) => Promise<void>,
): (ctx: T) => void {
  return (ctx) => {
    handler(ctx).catch((err) =>
      console.error(`Linear bridge "${name}" failed:`, err),
    );
  };
}

export default function registerEvents(_client: Client) {
  if (!config.linearBridge.enabled) {
    console.log("Linear bridge is disabled.");
    return;
  }

  validateLinearBridgeConfig();

  bus.on("helpThreadCreated", guard("helpThreadCreated", mirrorThreadCreated));
  bus.on("helpMessagePosted", guard("helpMessagePosted", mirrorMessage));
  bus.on(
    "helpThreadStatusChanged",
    guard("helpThreadStatusChanged", mirrorStatus),
  );

  console.log("Linear bridge is enabled.");
}
