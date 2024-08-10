import loadConfig from "@uwu/configmasher";

interface Config {
  token: string;
}

export const { config, layers } = await loadConfig<Config>({
  name: "Codercord",

  environmentFile: true,
  processEnvironment: true,

  caseInsensitive: true,

  configs: ["config.json"],

  defaults: {},
  mandatory: [
    "token",

    "serverId",

    ["helpChannel", "closedTag"],
    ["helpChannel", "id"],
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
