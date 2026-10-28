FROM node:26-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/index.html frontend/vite.config.mjs ./
RUN npm run build

FROM node:26-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/server.js ./server.js
COPY --from=frontend-build /build/frontend/dist ./frontend/build

EXPOSE 3001
CMD ["node", "server.js"]
