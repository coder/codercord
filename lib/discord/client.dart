import "dart:async";
import "dart:io";

import "package:codercord/discord/utils.dart";
import "package:codercord/values.dart";
import "package:codercord/discord/components/category_multi_select.dart";
import "package:codercord/discord/interactions/commands/commands.dart"
    as commands;
import "package:codercord/discord/interactions/multiselects/multiselects.dart"
    as multiselect;

import "package:logging/logging.dart";

import "package:codercord/github/github.dart";
import "package:github/github.dart";
import "package:version/version.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final logger = Logger("Codercord");

RegExp linkText = RegExp("(?<=\\[)(.+)(?=\\])");

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

  Future<List<Release>> triggerReleaseCheck(RepositorySlug slug) async {
    Version? lastSentVersion;

    await for (final message in releaseChannel.downloadMessages(limit: 10)) {
      if (message.author.id == client.self.id && message.embeds.isNotEmpty) {
        IEmbedField versionField = message.embeds[0].fields.firstWhere(
          (field) => field.name == "Version",
        );

        String? messageVersion =
            linkText.stringMatch(versionField.content)?.replaceFirst("v", "");

        try {
          lastSentVersion = Version.parse(messageVersion!);

          break;
        } catch (_) {}
      }
    }

    List<Release> releasesToSend;
    if (lastSentVersion != null) {
      releasesToSend = await getNewerReleases(slug, lastSentVersion).then(
        (releases) => releases.reversed.toList(),
      );
    } else {
      releasesToSend = [await getNewestRelease(slug)];
    }

    for (final release in releasesToSend) {
      ComponentMessageBuilder releaseMessage = await makeReleaseMessage(
        slug,
        release,
      );

      await releaseChannel.sendMessage(releaseMessage);
      logger.info(
        "Sent release announcement for ${slug.fullName} ${release.tagName!}",
      );
    }

    return releasesToSend;
  }

  void login() async {
    logger.info("Codercord is loading..");

    await client.connect();

    client.eventsWs.onReady.listen((event) async {
      logger.info("Loading config values..");
      try {
        await loadValues(client);
      } catch (error, trace) {
        logger.log(
          Level.SEVERE,
          "Could not load configuration values.",
          error,
          trace,
        );
        exit(1);
      }

      logger.info("Codercord is ready !");

      logger.info(
        "Invite link: https://discord.com/oauth2/authorize?client_id=$clientId&scope=bot%20applications.commands&permissions=294205377552",
      );

      logger.info("Registering commands..");
      await registerInteractionHandlers();

      logger.info("Checking for new releases..");
      await triggerReleaseCheck(coderRepo);

      client.eventsWs.onThreadCreated.listen((event) async {
        if (event.newlyCreated && await event.thread.isHelpPost) {
          event.thread.setPostTags([openedTagID]);

          try {
            await event.thread.sendMessage(categoryMultiSelectMessage);
          } catch (e) {
            final retryIn = const Duration(milliseconds: 50);

            //print(e);
            //print(e.toString().contains("40058"));

            logger.info(
              "Couldn't send message because thread owner did not post message, retrying in ${retryIn.toString()}.",
            );
            await Future.delayed(retryIn);
            await event.thread.sendMessage(categoryMultiSelectMessage);
          }
        }
      });

      client.eventsWs.onMessageReceived.listen((event) async {
        if (event.message.type == MessageType.channelPinnedMessage &&
            event.message.author.id == client.self.id) {
          await event.message.delete(
            auditReason: "Automatic deletion of channel pin announcements.",
          );
        } else if (event.message.channel.id == releaseAlertChannel.id &&
            event.message.author.isInteractionWebhook) {
          logger.info(
            "A new message was sent in the release alert channel, checking for new releases..",
          );
          await triggerReleaseCheck(coderRepo);
        }
      });

      shufflePresence();
      Timer.periodic(const Duration(minutes: 10), (_) => shufflePresence());
    });
  }
}
