import loadConfig from "@uwu/configmasher";

interface Config {
  token: string;

  serverId: string;

  helpChannel: {
    id: string;

    closedTag: string;
    openedTag: string;
  }

  releaseAlertChannel: {
    id: string;
  }

  releaseChannel: {
    id: string;
  },

  emojis: {
    coder: string;
    linux: string;
    macos: string;
    windows: string;
    vscode: string;
  }
}

export const { config, layers } = await loadConfig<Config>({
  name: "Codercord",

  environmentFile: true,
  processEnvironment: true,

  caseInsensitive: false,

  configs: ["config.json"],

  defaults: {},
  mandatory: [
    "token",

    "serverId",

    ["helpChannel", "id"],
    ["helpChannel", "closedTag"],
    ["helpChannel", "openedTag"],

    ["releaseAlertChannel", "id"],
    ["releaseChannel", "id"],

    ["emojis", "coder"],
    ["emojis", "linux"],
    ["emojis", "macos"],
    ["emojis", "windows"],
    ["emojis", "vscode"],
  ],
});
