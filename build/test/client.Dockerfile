# Type-checks the admin client and runs its unit tests (client/test). Built from client/; see
# docker-compose.test.yml. Same base image as the client's build stage (client/Dockerfile).
FROM node:22-alpine

WORKDIR /client

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

CMD ["sh", "-c", "npm run typecheck && npm test"]
