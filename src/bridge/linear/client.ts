import { LinearClient } from "@linear/sdk";

import { config } from "@lib/config.js";

// Returns the validated bridge config, narrowing the optional fields to strings.
// validateLinearBridgeConfig() runs at startup, so these are present whenever the
// bridge is enabled.
export function bridgeConfig(): { apiKey: string; teamId: string } {
  const { apiKey, teamId } = config.linearBridge;
  if (!apiKey || !teamId) {
    throw new Error("linearBridge is enabled but apiKey/teamId are missing");
  }
  return { apiKey, teamId };
}

let client: LinearClient | undefined;

export function linear(): LinearClient {
  if (!client) {
    client = new LinearClient({ apiKey: bridgeConfig().apiKey });
  }
  return client;
}
