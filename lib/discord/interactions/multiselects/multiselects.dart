import "package:codercord/discord/components/category_multi_select.dart"
    show categoryOptions;
import "package:codercord/discord/components/platform_multi_select.dart"
    show platformMultiSelectRow, platformOptions;
import "package:codercord/discord/components/product_multi_select.dart"
    show productMultiSelectRow, productOptions;
import "package:codercord/discord/client.dart" show logger;
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

    ComponentMessageBuilder? message;
    bool pinMessage = false;

    switch (customId) {
      case "categoryMultiSelect":
        message = ComponentMessageBuilder()
          ..addComponentRow(productMultiSelectRow)
          ..content = valueText;

        message.content += visualSeparatorWithPadding;
        message.content += "What product are you using?";
        continue shared;

      case "productMultiSelect":
        message = ComponentMessageBuilder()
          ..addComponentRow(platformMultiSelectRow)
          ..content = getMessageData(p0.interaction.message!.content);

        message.content += "\n$valueText";
        message.content += visualSeparatorWithPadding;
        message.content += "What platform are you running $valueLabel on?";
        continue shared;

      case "platformMultiSelect":
        message = ComponentMessageBuilder()..componentRows = [];

        message.content = "<#${p0.interaction.channel.id.id}>";
        message.content += visualSeparatorWithPadding;
        message.content += getMessageData(p0.interaction.message!.content);
        message.content += "\n**Platform** : $valueLabel";

        pinMessage = true;
        continue shared;

      shared:
      default:
        if (message != null) {
          await p0.respond(message);

          if (pinMessage) {
            await p0.interaction.message!.pinMessage();
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
