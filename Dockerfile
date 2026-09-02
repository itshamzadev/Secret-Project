FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

# Install only the API and its workspace dependency graph. The root package also
# contains Android tooling, which is not part of the backend production image.
RUN pnpm install --filter @terqivo/api... --frozen-lockfile --prod=false

COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

RUN pnpm --filter @terqivo/contracts build
RUN pnpm --filter @terqivo/api build
RUN pnpm --filter @terqivo/api --prod deploy --legacy /app/deploy


FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/deploy/package.json ./apps/api/package.json
COPY --from=build /app/deploy/node_modules ./apps/api/node_modules
COPY --from=build /app/deploy/dist ./apps/api/dist

# Keep the built workspace package available at its canonical repository path
# while the deployed API dependencies resolve it from the isolated node_modules.
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

EXPOSE 5000

CMD ["node", "apps/api/dist/server.js"]
