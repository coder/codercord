import "dart:io" show Platform, exit;

import "package:codercord/discord/client.dart";
import "package:codercord/discord/utils.dart";
import "package:codercord/config.dart";

void main() async {
  try {
    await loadConfig();
  } catch (e) {
    print(
      "[TOML] Could not load configuration from TOML file: $e",
    );
  }

  if (await enforceRequiredEntries()) {
    exit(2);
  }

  final token = Platform.environment["CODERCORD_TOKEN"]!;
  final client = Codercord(token, config["clientId"] ?? getIdFromToken(token));

  client.login();
}
