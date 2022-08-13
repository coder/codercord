import "dart:async";

import "package:codercord/discord/commands.dart";

import "package:logging/logging.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final logger = Logger("Codercord");

class Codercord {
  final List<PresenceBuilder> presenceList = [
    PresenceBuilder.of(activity: ActivityBuilder.game("with Coder OSS")),
    PresenceBuilder.of(activity: ActivityBuilder.game("with Coder v1")),
    PresenceBuilder.of(activity: ActivityBuilder.game("with Terraform")),
    PresenceBuilder.of(activity: ActivityBuilder.listening("to your issues")),
    PresenceBuilder.of(
      activity: ActivityBuilder.watching("over the Coder community"),
    )
  ];

  final String _token;
  final Snowflake clientId;
  late INyxxWebsocket client;

  Codercord(this._token, this.clientId) {
    client =
        NyxxFactory.createNyxxWebsocket(_token, GatewayIntents.allUnprivileged)
          ..registerPlugin(Logging())
          ..registerPlugin(CliIntegration())
          ..registerPlugin(IgnoreExceptions());
  }

  void shufflePresence() {
    client.setPresence(
      (presenceList.toList()..shuffle()).first,
    );
  }

  void login() async {
    logger.info("Codercord is loading..");

    final interactions =
        IInteractions.create(WebsocketInteractionBackend(client));

    for (final command in slashCommands) {
      logger.info("Registering command `${command.name}`");
      interactions.registerSlashCommand(command);
    }

    interactions.syncOnReady();
    await client.connect();

    client.eventsWs.onReady.listen((event) async {
      logger.info("Codercord is ready !");

      logger.info(
        "Invite link: https://discord.com/oauth2/authorize?client_id=$clientId&scope=client%20applications.commands&permissions=294205377552",
      );

      shufflePresence();
      Timer.periodic(const Duration(minutes: 10), (_) => shufflePresence());
    });
  }
}
