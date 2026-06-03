FROM docker.registry.leeteng.com/library/node:24-slim AS build
WORKDIR /app/sci-viz-case-hub

COPY package.json package-lock.json ./
RUN npm ci

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY server/tsconfig.json server/
COPY server/src server/src/
COPY server/prisma server/prisma/
RUN cd server && npx prisma generate && npx tsc

COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/tsconfig.json web/vite.config.ts web/index.html web/
COPY web/src web/src/
COPY web/public web/public/
RUN cd web && npx vite build

FROM docker.registry.leeteng.com/library/node:24-slim
WORKDIR /app/sci-viz-case-hub

COPY --from=build /app/sci-viz-case-hub/server/dist ./server/dist
COPY --from=build /app/sci-viz-case-hub/server/node_modules ./server/node_modules
COPY --from=build /app/sci-viz-case-hub/server/prisma ./server/prisma
COPY --from=build /app/sci-viz-case-hub/server/package.json ./server/
COPY --from=build /app/sci-viz-case-hub/web/dist ./web/dist

COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

ENV PORT=3001
ENV DATABASE_URL="file:./prisma/dev.db"
ENV JWT_SECRET="change-me-in-production"
ENV CORS_ORIGINS="http://localhost:3001,http://localhost:5173"

EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
