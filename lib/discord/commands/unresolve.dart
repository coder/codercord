import "package:codercord/config.dart";
import "package:codercord/discord/commands/resolve.dart" show handleResolve;

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

SlashCommandBuilder getCommand() {
  return SlashCommandBuilder(
    "unresolve",
    "Un-marks your post as resolved and un-archives it",
    [],
    guild: Snowflake(config["coderServer"]["id"]),
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      await handleResolve(p0, false);
    });
}
