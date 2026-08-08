# Maison Lunar — container image.
# Node 22 is required for the built-in node:sqlite module.
FROM node:22-alpine

WORKDIR /app

# No dependencies to install — the app uses only Node built-ins — but we copy
# package.json first so the layer cache still works if that ever changes.
COPY package.json ./

COPY server ./server
COPY public ./public

# Runtime data (SQLite file + uploaded images) lives here. Mount a persistent
# volume at /app/data in production, or this resets on every redeploy.
RUN mkdir -p /app/data/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/server.js"]
