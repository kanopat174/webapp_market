# Production image: builds the React app, then runs the API which also serves it.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production PORT=4000 DB_PATH=/data/vitara.db UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server
COPY server server
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4000
USER node
CMD ["node", "server/src/index.js"]
