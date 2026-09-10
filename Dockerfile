# --- Build stage ------------------------------------------------------------
# Multi-stage so the final image is just nginx + dist (no node, no node_modules).
FROM node:24-alpine AS builder

WORKDIR /app

# Cache dependencies together with the inputs required by the icon postinstall.
COPY package.json yarn.lock ./
COPY src/@iconify/build-icons.ts src/@iconify/tsconfig.json ./src/@iconify/
COPY src/assets/images/iconify-svg/ ./src/assets/images/iconify-svg/
COPY scripts/build-interface-icons.cjs ./scripts/
RUN corepack enable && yarn install --frozen-lockfile

COPY . .

# VITE_* env are baked into the bundle at build time. Pass them via build-arg.
ARG VITE_API_HOST=""
ARG VITE_ALLOWED_API_HOSTS=""
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_TRACES_RATE="0.1"
ARG VITE_SENTRY_REPLAY_RATE="0"
ARG VITE_SENTRY_PII="false"
ENV VITE_API_HOST=$VITE_API_HOST \
    VITE_ALLOWED_API_HOSTS=$VITE_ALLOWED_API_HOSTS \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_TRACES_RATE=$VITE_SENTRY_TRACES_RATE \
    VITE_SENTRY_REPLAY_RATE=$VITE_SENTRY_REPLAY_RATE \
    VITE_SENTRY_PII=$VITE_SENTRY_PII

RUN yarn build


# --- Runtime stage ----------------------------------------------------------
FROM nginx:1.27-alpine

# Strip the default site so our config is the only one nginx loads.
RUN rm -f /etc/nginx/conf.d/default.conf

COPY infra/nginx.conf /etc/nginx/conf.d/admin-panel.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx runs as `nginx` user by default; the alpine image already drops
# privileges from the worker processes. Master needs root to bind :80.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/_panel_healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
