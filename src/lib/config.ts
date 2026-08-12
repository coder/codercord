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
