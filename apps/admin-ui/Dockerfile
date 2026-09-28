FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

WORKDIR /app

COPY . .

ARG VITE_API_BASE_URL=https://api.terqivo.com/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV REDISMS_DISABLE_POSTINSTALL=true

RUN pnpm install --filter @terqivo/admin-ui... --frozen-lockfile
RUN pnpm --filter @terqivo/contracts build
RUN pnpm --filter @terqivo/admin-ui build


FROM nginx:1.27-alpine

COPY apps/admin-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-ui/dist /usr/share/nginx/html/admin

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]


