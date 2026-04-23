FROM oven/bun:1.3.13

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV HUSKY=0

RUN mkdir -p docs packages/app packages/cli packages/core packages/desktop packages/plugin packages/server patches

COPY --chown=bun:bun package.json bun.lock bunfig.toml biome.jsonc turbo.json tsconfig.json ./
COPY --chown=bun:bun patches ./patches
COPY --chown=bun:bun docs/package.json ./docs/package.json
COPY --chown=bun:bun packages/app/package.json ./packages/app/package.json
COPY --chown=bun:bun packages/cli/package.json ./packages/cli/package.json
COPY --chown=bun:bun packages/core/package.json ./packages/core/package.json
COPY --chown=bun:bun packages/desktop/package.json ./packages/desktop/package.json
COPY --chown=bun:bun packages/plugin/package.json ./packages/plugin/package.json
COPY --chown=bun:bun packages/server/package.json ./packages/server/package.json

USER bun

RUN bun install --frozen-lockfile

COPY --chown=bun:bun . .

EXPOSE 5173

CMD ["bun", "--elide-lines=0", "run", "--filter", "@inkeep/open-knowledge-app", "dev"]
