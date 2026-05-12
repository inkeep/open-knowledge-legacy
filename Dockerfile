FROM oven/bun:1.3.13

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV HUSKY=0 \
  ELECTRON_SKIP_REBUILD=1

RUN chown -R bun:bun /app

COPY --chown=bun:bun . .

USER bun

RUN bun install --frozen-lockfile

EXPOSE 5173

CMD ["bun", "--elide-lines=0", "run", "--filter", "@inkeep/open-knowledge-app", "dev"]
