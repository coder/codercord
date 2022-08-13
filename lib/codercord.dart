List<T> dynamicListToType<T>(List<dynamic> list) {
  return list.map((e) => e as T).toList();
}

// I know, I know.
// https://discord.com/channels/420324994703163402/825211448598331392/1008120044263321724 (/r/FlutterDev discord)
extension PathChecker on Map<dynamic, dynamic> {
  bool hasPath(List<dynamic> keyPath) {
    dynamic map = this;

    for (final key in keyPath) {
      if (map is Map) {
        map = map[key];
      } else {
        return false;
      }
    }

    return map != null;
  }
}
