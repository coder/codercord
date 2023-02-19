FROM dart:2.19 as builder

ADD . /src
WORKDIR /src

RUN dart pub get

# AOT Compilation allows to reduce overhead, rather than using dart run on each startup
RUN dart compile aot-snapshot -o /tmp/codercord.aot bin/codercord.dart

FROM alpine:3.17 as runner

RUN adduser --disabled-password -u 1337 codercord codercord

# We copy the dart runtime manually because it is smaller than using the official dart images
# https://github.com/dart-lang/dart-docker/issues/71
COPY --from=builder /runtime/ /
COPY --from=builder /usr/lib/dart/bin/dart /usr/bin/
COPY --from=builder /usr/lib/dart/bin/dartaotruntime /usr/bin/

WORKDIR /opt
COPY --from=builder --chown=codercord:codercord /tmp/codercord.aot codercord.aot
COPY --from=builder --chown=codercord:codercord /src/tags.json tags.json

USER codercord
ENTRYPOINT [ "dartaotruntime", "codercord.aot" ]