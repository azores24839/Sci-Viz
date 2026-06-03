FROM node:24-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
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

FROM node:24-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/sci-viz-case-hub

COPY --from=build /app/sci-viz-case-hub/server/dist ./server/dist
COPY --from=build /app/sci-viz-case-hub/server/node_modules ./server/node_modules
COPY --from=build /app/sci-viz-case-hub/server/prisma ./server/prisma
COPY --from=build /app/sci-viz-case-hub/server/package.json ./server/
COPY --from=build /app/sci-viz-case-hub/web/dist ./web/dist

RUN mkdir -p /app/prisma-template && cp /app/sci-viz-case-hub/server/prisma/schema.prisma /app/prisma-template/

ENV PORT=3001
ENV DATABASE_URL="file:./prisma/dev.db"
ENV JWT_SECRET="change-me-in-production"
ENV CORS_ORIGINS="http://localhost:3001,http://localhost:5173"

EXPOSE 3001
CMD ["sh", "-c", "cd /app/sci-viz-case-hub/server && [ -f prisma/schema.prisma ] || cp /app/prisma-template/schema.prisma prisma/schema.prisma && [ -f prisma/dev.db ] || (npx prisma db push --skip-generate && node dist/seed.js) && exec node dist/index.js"]
