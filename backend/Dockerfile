FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json nest-cli.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/database/schema.sql ./dist/database/schema.sql
COPY --from=builder /app/src/redis/lua ./dist/redis/lua

EXPOSE 3000

CMD ["node", "dist/main"]
