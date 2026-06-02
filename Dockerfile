FROM node:24-alpine AS base

ARG SERVICE
ENV SERVICE=${SERVICE}
WORKDIR /app

RUN npm install -g pnpm@9.15.4

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
RUN pnpm --filter @multi-stream-alerts/${SERVICE} build

USER 1000

EXPOSE 3000
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD sh -ec 'if [ "$SERVICE" = "ingress" ]; then wget -q -O /dev/null http://127.0.0.1:8080/health; elif [ "$SERVICE" = "web" ]; then wget -q -O /dev/null http://127.0.0.1:3000/; else exit 0; fi'

CMD ["sh", "-c", "pnpm prisma:migrate && pnpm --filter @multi-stream-alerts/${SERVICE} start"]
