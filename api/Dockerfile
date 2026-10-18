# syntax=docker/dockerfile:1
FROM node:22-alpine AS dependencies
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci

FROM dependencies AS build
WORKDIR /app
COPY api/scripts/build-game.mjs ./api/scripts/build-game.mjs
COPY mobile/src/engine.ts mobile/src/board.ts ./mobile/src/
RUN npm --prefix api run build

FROM node:22-alpine AS production-dependencies
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
WORKDIR /app/api
COPY --from=production-dependencies --chown=node:node /app/api/node_modules ./node_modules
COPY --chown=node:node api/package.json ./package.json
COPY --chown=node:node api/src ./src
COPY --chown=node:node api/scripts/seed-admin.mjs ./scripts/seed-admin.mjs
COPY --from=build --chown=node:node /app/api/dist ./dist
COPY --chown=node:node mobile/src/data/words.json mobile/src/data/lexicon-meta.json /app/mobile/src/data/
COPY --chown=node:node mobile/vendor/grammalecte /app/licenses/grammalecte/
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# The game engine is already compiled. npm start would run the build again.
CMD ["node", "src/server.mjs"]
