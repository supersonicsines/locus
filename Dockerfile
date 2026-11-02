# Builds the Studio and the host, then runs with no dependencies at all.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
ENV VADERE_DATA=/data
VOLUME /data
EXPOSE 4747
USER node
CMD ["node", "dist/cli.mjs", "serve"]
