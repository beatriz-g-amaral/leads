FROM oven/bun:1-alpine

WORKDIR /app

COPY index.ts .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "index.ts"]