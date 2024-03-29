import "dart:io";

import "package:codercord/codercord.dart";

import "package:toml/toml.dart";

late final Map<String, dynamic> config;

class ConfigType {
  String name;
  List<List<String>> required;
  Map<String, dynamic> store;

  ConfigType(this.name, this.required, this.store);
}

final List<ConfigType> configTypes = [
  ConfigType(
    "env",
    [
      ["CODERCORD_TOKEN"]
    ],
    Platform.environment,
  ),
  ConfigType(
    "toml",
    [
      ["coderServer", "id"],
      ["helpChannel", "id"],
      ["helpChannel", "closedTag"],
      ["helpChannel", "openedTag"],
      ["releaseChannel", "id"],
      ["releaseAlertChannel", "id"],
      ["emojis", "coder"],
      ["emojis", "vscode"],
      ["emojis", "linux"],
      ["emojis", "windows"],
      ["emojis", "macos"],
    ],
    config,
  ),
];

Future<Map<String, dynamic>> loadConfig() async {
  return config = await TomlDocument.load(
    Platform.environment["CODERCORD_CONFIG_PATH"] ?? "config.toml",
  ).then((doc) => doc.toMap());
}

Future<bool> enforceRequiredEntries() async {
  bool missingKeys = false;

  for (final configType in configTypes) {
    for (final path in configType.required) {
      if (!configType.store.hasPath(path)) {
        print(
          "[${configType.name}] Please define the `${path.join(".")}` ${configType.name} variable!",
        );

        missingKeys = true;
      }
    }
  }

  return missingKeys;
}
