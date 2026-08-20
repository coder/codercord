import { LinearClient } from "@linear/sdk";

import { config } from "@lib/config.js";

// Validated bridge credentials. Present whenever the bridge is enabled.
export function bridgeConfig(): {
  appToken: string;
  userToken: string;
  teamId: string;
} {
  const { appToken, userToken, teamId } = config.linearBridge;
  if (!appToken || !userToken || !teamId) {
    throw new Error(
      "linearBridge is enabled but appToken/userToken/teamId are missing",
    );
  }
  return { appToken, userToken, teamId };
}

let appClient: LinearClient | undefined;
let userClient: LinearClient | undefined;

// App-actor client. Issues, comments and reactions run here so they are
// attributed to the external author (OAuth tokens use accessToken).
export function linear(): LinearClient {
  if (!appClient) {
    appClient = new LinearClient({ accessToken: bridgeConfig().appToken });
  }
  return appClient;
}

// Personal-key client for writes the app actor cannot make: creating custom
// emojis and labels.
export function linearUser(): LinearClient {
  if (!userClient) {
    userClient = new LinearClient({ apiKey: bridgeConfig().userToken });
  }
  return userClient;
}

// Extracts a readable message from a Linear SDK error, whose default string
// form is unhelpful ("[object Object]").
export function linearError(err: unknown): string {
  const e = err as { errors?: { message?: string }[]; message?: string };
  return (
    e?.errors
      ?.map((x) => x.message)
      .filter(Boolean)
      .join("; ") ||
    e?.message ||
    String(err)
  );
}

// Whether an error is a rate-limit rejection, so a bulk import can wait and
// retry rather than abort.
export function isRateLimited(err: unknown): boolean {
  const e = err as {
    type?: string;
    status?: number;
    errors?: { extensions?: { type?: string } }[];
  };
  return (
    e?.type === "Ratelimited" ||
    e?.status === 429 ||
    (e?.errors?.some((x) => x.extensions?.type === "Ratelimited") ?? false)
  );
}
