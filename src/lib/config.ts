import loadConfig from "@uwu/configmasher";

interface Config {
  token: string;

  serverId: string;

  helpChannel: {
    id: string;

    closedTag: string;
    openedTag: string;

    waitingForUserTag: string;
    waitingForTeamTag: string;
  };

  // Role that identifies Coder team members. Anyone without this role is
  // treated as a community member.
  teamRoleId: string;

  // Number of most recently active open help posts to reconcile on startup.
  startupCatchupLimit: number;

  emojis: {
    coder: string;
    linux: string;
    macos: string;
    windows: string;
    vscode: string;
  };

  productBoard: {
    token: string;
    companyId: string;
  };

  // One-way Discord -> Linear bridge for #help threads. Disabled by default.
  linearBridge: {
    enabled: boolean;
    // OAuth app-actor token. Used for issues, comments and reactions so they
    // are attributed to the external Discord author.
    appToken?: string;
    // Personal API key. Used for workspace/team admin writes the app actor is
    // not allowed to make: creating custom emojis and labels.
    userToken?: string;
    teamId?: string;
    // Optional Linear project that mirrored thread issues are filed under.
    projectId?: string;
    // Catch up threads whose start we missed: when a live event lands on a
    // #help thread that has no issue yet, mirror the thread's full history
    // instead of only that event, so a thread opened while the bridge was off
    // still lands complete.
    backfill: {
      enabled: boolean;
    };
    // Startup import that walks back through #help history. `days` mirrors every
    // thread active within that many days (-1 imports everything, paging all
    // archived threads and retrying through rate limits; 0 disables it). `limit`
    // caps how many threads are mirrored, most recent first; -1 is unlimited.
    // Threads already mirrored are skipped.
    deepBackfill: {
      days: number;
      limit: number;
    };
    // Attribute mirrored comments to the Discord author via Linear's
    // createAsUser. Requires the app-actor token; turn off to post as the app.
    createAsUser: boolean;
    labels: {
      enabled: boolean;
      namespace: string;
    };
  };

  presenceDelay: number;
}

export const { config, layers } = await loadConfig<Config>({
  name: "Codercord",

  environmentFile: true,
  processEnvironment: true,

  caseInsensitive: false,

  configs: ["config.json"],

  defaults: {
    presenceDelay: 10 * 60 * 1000,
    startupCatchupLimit: 20,
    linearBridge: {
      enabled: false,
      createAsUser: false,
      backfill: {
        enabled: true,
      },
      deepBackfill: {
        days: 90,
        limit: -1,
      },
      labels: {
        // Label creation runs on the user token, which can manage the team's
        // labels. Each #help tag becomes a flat label named "<namespace> > tag";
        // groups are avoided since Linear allows only one group label per issue.
        enabled: true,
        namespace: "#help",
      },
    },
  },
  mandatory: [
    "token",

    "serverId",

    ["helpChannel", "id"],
    ["helpChannel", "closedTag"],
    ["helpChannel", "openedTag"],
    ["helpChannel", "waitingForUserTag"],
    ["helpChannel", "waitingForTeamTag"],

    "teamRoleId",

    ["emojis", "coder"],
    ["emojis", "linux"],
    ["emojis", "macos"],
    ["emojis", "windows"],
    ["emojis", "vscode"],

    ["productBoard", "token"],
    ["productBoard", "companyId"],
  ],
});

// configmasher does not coerce types: values from env files or process.env
// arrive as strings, so a boolean like `backfill.enabled=false` would be the
// truthy string "false". Coerce the env-overridable booleans and numbers to
// their real types after loading.
function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

config.presenceDelay = num(config.presenceDelay, 10 * 60 * 1000);
config.startupCatchupLimit = num(config.startupCatchupLimit, 20);
config.linearBridge.enabled = bool(config.linearBridge.enabled, false);
config.linearBridge.createAsUser = bool(
  config.linearBridge.createAsUser,
  false,
);
config.linearBridge.backfill.enabled = bool(
  config.linearBridge.backfill.enabled,
  true,
);
config.linearBridge.deepBackfill.days = num(
  config.linearBridge.deepBackfill.days,
  90,
);
config.linearBridge.deepBackfill.limit = num(
  config.linearBridge.deepBackfill.limit,
  -1,
);
config.linearBridge.labels.enabled = bool(
  config.linearBridge.labels.enabled,
  true,
);

// linearBridge fields are conditionally required: only when the bridge is
// enabled. configmasher's `mandatory` list is static, so validate here and exit
// the same way a missing mandatory field would.
export function validateLinearBridgeConfig(): void {
  const { linearBridge } = config;
  if (!linearBridge.enabled) return;

  const missing: string[] = [];
  if (!linearBridge.appToken) missing.push("linearBridge.appToken");
  if (!linearBridge.userToken) missing.push("linearBridge.userToken");
  if (!linearBridge.teamId) missing.push("linearBridge.teamId");

  if (missing.length > 0) {
    console.error(
      "[config]",
      "linearBridge.enabled is true but required config is missing:",
      missing.join(", "),
    );
    process.exit(1);
  }
}
