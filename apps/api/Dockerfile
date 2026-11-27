# ---- build: compile the API into one JavaScript file ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --workspace packages/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run bundle --workspace apps/api

# ---- run: nothing but Node, the bundle and the SQL migrations ----
FROM node:26-alpine
# Pick up OS security fixes, and remove npm and yarn: the app does not need them at runtime,
# and their bundled packages are a common source of scanner findings.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations COLLECTORS_DIR=/app/collectors
COPY --from=build /app/apps/api/dist/server.js ./server.js
COPY --from=build /app/apps/api/migrations ./migrations
COPY --from=build /app/apps/api/collectors ./collectors
USER node
EXPOSE 4000
CMD ["node", "server.js"]
