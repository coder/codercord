import "package:codercord/discord/interactions/commands/resolve.dart"
    show handleResolve;
import "package:codercord/values.dart" show coderServer;

import "package:nyxx_interactions/nyxx_interactions.dart";

SlashCommandBuilder getCommand() {
  return SlashCommandBuilder(
    "unresolve",
    "Un-marks your post as resolved and un-archives it",
    [],
    guild: coderServer.id,
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      await handleResolve(p0, false);
    });
}
