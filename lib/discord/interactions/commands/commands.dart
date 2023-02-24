import "package:codercord/discord/client.dart" show logger;

import "tag.dart" as command_tag;
import "close.dart" as command_close;
import "reopen.dart" as command_reopen;
import "walkthrough.dart" as command_walkthrough;

import "package:nyxx_interactions/nyxx_interactions.dart";

Future<List<SlashCommandBuilder>> getSlashCommands() async {
  return [
    command_tag.getCommand(await command_tag.getTags()),
    command_close.getCommand(),
    command_reopen.getCommand(),
    command_walkthrough.getCommand()
  ];
}

Future<void> registerSlashCommands(IInteractions interactions) async {
  for (final command in await getSlashCommands()) {
    logger.info("Registering command `${command.name}`");
    interactions.registerSlashCommand(command);
  }

  logger.info("Registered commands");
}
