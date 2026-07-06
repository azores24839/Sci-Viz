FROM node:22-bookworm-slim AS build
ARG VITE_BASE_URL=/studio/
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_BASE_URL=$VITE_BASE_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages packages
RUN npm ci --include=dev
COPY apps/web apps/web
COPY apps/server apps/server
RUN npm run check
RUN npm run build -w @studio/web

FROM node:22-bookworm-slim
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends nginx \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
COPY deploy/nginx.app.conf /etc/nginx/sites-available/default
COPY deploy/start-app.sh /usr/local/bin/start-studio
COPY --from=build /app/apps/web/dist /usr/share/nginx/html/studio
RUN chmod +x /usr/local/bin/start-studio
ENV NODE_ENV=production PORT=3011
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1/studio/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["/usr/local/bin/start-studio"]
