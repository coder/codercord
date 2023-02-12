import "package:codercord/discord/client.dart" show logger;

import "tag.dart" as command_tag show getCommand, getTags;
import "resolve.dart" as command_resolve show getCommand;
import "unresolve.dart" as command_unresolve show getCommand;

import "package:nyxx_interactions/nyxx_interactions.dart";

Future<List<SlashCommandBuilder>> getSlashCommands() async {
  return [
    command_tag.getCommand(await command_tag.getTags()),
    command_resolve.getCommand(),
    command_unresolve.getCommand(),
  ];
}

Future<void> registerSlashCommands(IInteractions interactions) async {
  for (final command in await getSlashCommands()) {
    logger.info("Registering command `${command.name}`");
    interactions.registerSlashCommand(command);
  }

  logger.info("Registered commands");
}
