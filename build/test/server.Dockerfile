# Runs the server's unit tests (test/ at the repo root). Built from the repo root; see
# docker-compose.test.yml. Same base image as the app itself (build/app/Dockerfile).
FROM node:23-alpine

WORKDIR /taproom-offering-engine

# Dependencies first, so they're cached between runs that only change code. The Prisma schema
# comes along because @prisma/client's install step looks for it.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY . .

CMD ["npm", "test"]
