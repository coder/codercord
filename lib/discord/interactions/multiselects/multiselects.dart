import "package:codercord/discord/components/category_multi_select.dart"
    show categoryOptions;
import "package:codercord/discord/components/platform_multi_select.dart"
    show platformMultiSelectRow, platformOptions;
import "package:codercord/discord/components/product_multi_select.dart"
    show productMultiSelectRow, productOptions;
import "package:codercord/discord/client.dart" show logger;
import 'package:codercord/discord/interactions/commands/close.dart';
import "package:codercord/discord/utils.dart" show canUserInteractWithThread;

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final String visualSeparator = "__${" " * 56}__";
final String visualSeparatorWithPadding = "\n$visualSeparator\n\n";

String getMessageData(String content) {
  return content.split(visualSeparatorWithPadding)[0];
}

Map<String, Map<String, MultiselectOptionBuilder>> optionsByEvent = {
  "categoryMultiSelect": categoryOptions,
  "productMultiSelect": productOptions,
  "platformMultiSelect": platformOptions
};

Map<String, String> valueNamesByEvent = {
  "categoryMultiSelect": "Category",
  "productMultiSelect": "Product",
  "platformMultiSelect": "platform"
};

Future<void> handleEvent(IMultiselectInteractionEvent p0) async {
  String customId = p0.interaction.customId;

  final threadChannel =
      (await p0.interaction.channel.getOrDownload()) as IThreadChannel;

  if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
    Map<String, MultiselectOptionBuilder> options = optionsByEvent[customId]!;

    String valueName = valueNamesByEvent[customId]!;
    String valueLabel = options[p0.interaction.values[0]]!.label;
    String valueText = "**$valueName**: $valueLabel";

    MessageBuilder? message;
    bool pinMessage = false;
    bool archiveThread = false;

    switch (customId) {
      case "categoryMultiSelect":
        message = ComponentMessageBuilder()
          ..addComponentRow(productMultiSelectRow)
          ..content = valueText;

        message.content += visualSeparatorWithPadding;
        message.content += "What product are you using?";
        continue shared;

      case "productMultiSelect":
        if (p0.interaction.values[0] != "coder-v1") {
          message = ComponentMessageBuilder()
            ..addComponentRow(platformMultiSelectRow)
            ..content = getMessageData(p0.interaction.message!.content);

          message.content += "\n$valueText";
          message.content += visualSeparatorWithPadding;
          message.content += "What platform are you running $valueLabel on?";
        } else {
          message = ComponentMessageBuilder()..componentRows = [];

          message.content +=
              "$valueLabel is primarily supported in https://cdr.co/join-community, this issue will close automatically.";

          archiveThread = true;
        }
        continue shared;

      case "platformMultiSelect":
        List<List<String>> fields =
            getMessageData(p0.interaction.message!.content)
                .split("\n")
                .map((e) => e.split(":"))
                .toList()
              ..add(["**Platform**", valueLabel]);

        EmbedBuilder embed = EmbedBuilder()
          ..title = "<#${p0.interaction.channel.id.id}>";

        for (List<String> message in fields) {
          embed.addField(
            name: message[0],
            content: message[1],
            inline: true,
          );
        }

        embed.addField(
          name: "Logs",
          content:
              "Please post any relevant logs/error messages.", // \n\nLogs for ${fields[1][1]} can be found at ``/var/lib/hello``
        );

        message = ComponentMessageBuilder()
          ..componentRows = []
          ..embeds = [embed];

        pinMessage = true;
        continue shared;

      shared:
      default:
        if (message != null) {
          await p0.respond(message);

          if (pinMessage) {
            await p0.interaction.message!.pinMessage();
          }

          if (archiveThread) {
            await handleIssueState(
              threadChannel,
              (p0.interaction.client as INyxxWebsocket).self,
              p0.sendFollowup,
              true,
              true,
            );
          }
        } else {
          await p0.respond(p0.interaction.message!.toBuilder());
        }
        break;
    }
  }
}

void registerInteractionHandlers(IInteractions interactions) {
  interactions.registerMultiselectHandler("categoryMultiSelect", handleEvent);
  interactions.registerMultiselectHandler("productMultiSelect", handleEvent);
  interactions.registerMultiselectHandler("platformMultiSelect", handleEvent);

  logger.info("Registered multiselect handlers");
}
