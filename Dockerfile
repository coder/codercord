FROM oven/bun:1 AS base

WORKDIR /usr/src/app
COPY . .

ENV NODE_ENV=production
RUN bun install --frozen-lockfile --production

# run the app
USER bun
ENTRYPOINT [ "bun", "start" ]