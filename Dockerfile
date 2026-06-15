FROM oven/bun:1-alpine

WORKDIR /app

COPY http.ts .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "http.ts"]