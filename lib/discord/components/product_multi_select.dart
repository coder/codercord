import "package:codercord/values.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final Map<String, MultiselectOptionBuilder> productOptions = {
  "coder-v2": MultiselectOptionBuilder("Coder v2", "coder-v2")
    ..emoji = coderEmoji,
  "coder-v1": MultiselectOptionBuilder("Coder v1", "coder-v1")
    ..emoji = coderEmoji,
  "code-server": MultiselectOptionBuilder("code-server", "code-server")
    ..emoji = vscodeEmoji
};

final MultiselectBuilder productMultiSelect = MultiselectBuilder(
  "productMultiSelect",
  productOptions.values,
);

final ComponentRowBuilder productMultiSelectRow = ComponentRowBuilder()
  ..addComponent(productMultiSelect);

final ComponentMessageBuilder productMultiSelectMessage =
    ComponentMessageBuilder()
      ..addComponentRow(productMultiSelectRow)
      ..content = "What product are you using?";
