FROM node:22-alpine AS base

ARG SERVICE
ENV SERVICE=${SERVICE}
WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
RUN pnpm --filter @multi-stream-alerts/${SERVICE} build

USER 1000

EXPOSE 3000
EXPOSE 8080

CMD ["sh", "-c", "pnpm prisma:migrate && pnpm --filter @multi-stream-alerts/${SERVICE} start"]
