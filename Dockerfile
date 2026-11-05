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
ENV LOCUS_DATA=/data
# Sealed maps live in /data. Mount a volume there: docker run -v locus-data:/data, or a Railway volume at /data.
# No VOLUME line, because Railway's builder refuses one, and a volume mounted from outside works the same without it.
EXPOSE 4747
USER node
CMD ["node", "dist/cli.mjs", "serve"]
