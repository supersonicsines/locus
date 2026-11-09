# Builds the Studio and the host, then runs with no dependencies at all.
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
ENV LOCUS_DATA=/data
# Sealed maps live in /data. Mount a volume there: docker run -v locus-data:/data, or a Railway volume at /data.
# The folder belongs to node, so a new Docker volume mounted there takes that owner and the host can write to it.
# Railway mounts its volumes as root whatever the image says, so there set RAILWAY_RUN_UID=0 (docs/LAUNCH.md).
# No VOLUME line, because Railway's builder refuses one.
RUN mkdir -p /data && chown node:node /data
EXPOSE 4747
USER node
CMD ["node", "dist/cli.mjs", "serve"]
