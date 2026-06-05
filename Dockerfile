FROM node:24-alpine AS base

ARG SERVICE
ARG RELEASE_VERSION=0.1.0
ARG SERVICE_VERSION=0.1.0
ARG GIT_SHA=unknown
ENV SERVICE=${SERVICE}
ENV GITCHALERTS_RELEASE_VERSION=${RELEASE_VERSION}
ENV GITCHALERTS_SERVICE_VERSION=${SERVICE_VERSION}
ENV GITCHALERTS_COMMIT_SHA=${GIT_SHA}
WORKDIR /app

LABEL org.opencontainers.image.version="${SERVICE_VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/Gitchegumi/multi-stream-alerts"
LABEL org.opencontainers.image.title="gitchalerts-${SERVICE}"
LABEL org.opencontainers.image.description="GitcheGumi Alerts ${SERVICE} container"
LABEL org.opencontainers.image.base.name="${RELEASE_VERSION}"

RUN npm install -g pnpm@9.15.4

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
RUN pnpm --filter @multi-stream-alerts/${SERVICE} build

RUN if [ "$SERVICE" = "web" ]; then mkdir -p /app/apps/web/.next/cache; fi \
  && chown -R 1000:1000 /app

USER 1000

EXPOSE 3000
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD sh -ec 'if [ "$SERVICE" = "ingress" ]; then wget -q -O /dev/null http://127.0.0.1:8080/health; elif [ "$SERVICE" = "web" ]; then wget -q -O /dev/null http://127.0.0.1:3000/; else exit 0; fi'

CMD ["sh", "-c", "pnpm prisma:migrate && pnpm --filter @multi-stream-alerts/${SERVICE} start"]
