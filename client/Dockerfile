# Admin client app: built with Node, then served as static files by nginx.
# In docker-compose.yml this sits behind Caddy, which sends /admin/* here and everything else
# (including the /api the app calls) to the server.

FROM node:22-alpine AS build
WORKDIR /client
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /client/dist /usr/share/nginx/html/admin
EXPOSE 80
