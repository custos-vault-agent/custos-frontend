# syntax=docker/dockerfile:1.7
# custos-web: TanStack Start built with Bun, served by Nitro's node-server
# output on a distroless Node image (no shell, no package manager, non-root).

ARG BUN_VERSION=1.4.2
ARG NODE_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot

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
ENV VITE_RPC_URL=${VITE_RPC_URL} \
    VITE_PRIVY_APP_ID=${VITE_PRIVY_APP_ID} \
    VITE_ENVIO_GRAPHQL_URL=${VITE_ENVIO_GRAPHQL_URL} \
    NODE_ENV=production
COPY . .
RUN bun run build

# ---- runtime: only the traced Nitro output -------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=256
COPY --from=build --chown=nonroot:nonroot /app/.output ./.output
USER nonroot
EXPOSE 3000
# Distroless has no shell or curl; probe with node itself.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD [".output/server/index.mjs"]
