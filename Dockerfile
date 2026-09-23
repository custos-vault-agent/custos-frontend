# syntax=docker/dockerfile:1.7
# custos-web: TanStack Start built with Bun and served by Bun. Nitro's `bun`
# preset emits a Bun-native server, so the runtime image is distroless Bun
# (no shell, no package manager, non-root).

ARG BUN_VERSION=1.4.2

# ---- deps: lockfile-exact install, cached across builds --------------------
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ---- build: VITE_* are compiled into the bundle, so they are build args -----
FROM deps AS build
ARG VITE_RPC_URL
ARG VITE_PRIVY_APP_ID
ARG VITE_ENVIO_GRAPHQL_URL
ARG VITE_AURORA_ENABLED=false
ARG VITE_CHAIN_ID=10143
ARG VITE_CUSTOS_CORE
ARG VITE_USDC
ARG VITE_NANSIGIL
ENV VITE_RPC_URL=${VITE_RPC_URL} \
    VITE_PRIVY_APP_ID=${VITE_PRIVY_APP_ID} \
    VITE_ENVIO_GRAPHQL_URL=${VITE_ENVIO_GRAPHQL_URL} \
    VITE_AURORA_ENABLED=${VITE_AURORA_ENABLED} \
    VITE_CHAIN_ID=${VITE_CHAIN_ID} \
    VITE_CUSTOS_CORE=${VITE_CUSTOS_CORE} \
    VITE_USDC=${VITE_USDC} \
    VITE_NANSIGIL=${VITE_NANSIGIL} \
    NITRO_PRESET=bun \
    NODE_ENV=production
COPY . .
RUN bun run build

# ---- runtime: the traced Nitro output, nothing else ------------------------
FROM oven/bun:${BUN_VERSION}-distroless AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
# The distroless image runs as root and has no `bun` account, so the user is
# numeric. 1000 is the uid of `bun` in the alpine image the build stage uses.
COPY --from=build --chown=1000:1000 /app/.output ./.output
USER 1000:1000
EXPOSE 3000
# Distroless has no shell or curl; probe with Bun itself.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD [".output/server/index.mjs"]
