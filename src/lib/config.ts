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
    apiKey?: string;
    teamId?: string;
    // Attribute mirrored comments to the Discord author via Linear's
    // createAsUser. Requires OAuth app-actor auth; a personal API key rejects
    // it, so leave this off unless the key runs in actor=app mode.
    createAsUser: boolean;
    labels: {
      enabled: boolean;
      groupName: string;
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
        enabled: true,
        groupName: "Discord (#help)",
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
  if (!linearBridge.apiKey) missing.push("linearBridge.apiKey");
  if (!linearBridge.teamId) missing.push("linearBridge.teamId");

  if (missing.length > 0) {
    console.error(
      `linearBridge.enabled is true but required config is missing: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
}
