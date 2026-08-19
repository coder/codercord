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
      `linearBridge.enabled is true but required config is missing: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
}
