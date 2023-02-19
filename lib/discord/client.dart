import "dart:async";

import "package:codercord/discord/utils.dart";
import "package:codercord/values.dart";
import "package:codercord/discord/components/category_multi_select.dart";
import "package:codercord/discord/interactions/commands/commands.dart"
    as commands;
import "package:codercord/discord/interactions/multiselects/multiselects.dart"
    as multiselect;

import "package:logging/logging.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final logger = Logger("Codercord");

class Codercord {
  final List<PresenceBuilder> presenceList = [
    PresenceBuilder.of(activity: ActivityBuilder.game("with Coder OSS")),
    PresenceBuilder.of(activity: ActivityBuilder.game("with Coder v1")),
    PresenceBuilder.of(activity: ActivityBuilder.game("with code-server")),
    PresenceBuilder.of(activity: ActivityBuilder.game("with Terraform")),
    PresenceBuilder.of(activity: ActivityBuilder.listening("to your issues")),
    PresenceBuilder.of(
      activity: ActivityBuilder.watching("over the Coder community"),
    )
  ];

  final String _token;
  final Snowflake clientId;

  late INyxxWebsocket client;
  late IInteractions interactions;

  Codercord(this._token, this.clientId) {
    client =
        NyxxFactory.createNyxxWebsocket(_token, GatewayIntents.allUnprivileged)
          ..registerPlugin(Logging())
          ..registerPlugin(CliIntegration())
          ..registerPlugin(IgnoreExceptions());

    interactions = IInteractions.create(WebsocketInteractionBackend(client));
  }

  void shufflePresence() {
    client.setPresence(
      (presenceList.toList()..shuffle()).first,
    );
  }

  Future<void> registerInteractionHandlers() async {
    await commands.registerSlashCommands(interactions);
    multiselect.registerInteractionHandlers(interactions);

    interactions.syncOnReady();
  }

  void login() async {
    logger.info("Codercord is loading..");

    await client.connect();

    await loadValues(client);
    await registerInteractionHandlers();

    client.eventsWs.onReady.listen((event) async {
      logger.info("Codercord is ready !");

      logger.info(
        "Invite link: https://discord.com/oauth2/authorize?client_id=$clientId&scope=bot%20applications.commands&permissions=294205377552",
      );

      client.eventsWs.onThreadCreated.listen((event) async {
        if (await event.thread.isHelpPost) {
          // TODO: fix with newly_created
          event.thread.setPostTags([unresolvedTagID]);

          //await event.thread.sendMessage(categoryMultiSelectMessage);
        }
      });

      shufflePresence();
      Timer.periodic(const Duration(minutes: 10), (_) => shufflePresence());
    });
  }
}
