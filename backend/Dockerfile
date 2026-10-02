# =============================================================================
#  Arena Estudos — API (Express + Prisma)
#  Estágios: deps -> production (imagem enxuta, sem devDependencies)
# =============================================================================
FROM node:20-alpine AS deps
WORKDIR /app
# Instala apenas as dependências de produção.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY prisma ./prisma

# O client do Prisma é gerado no build (o schema está em prisma/schema.prisma).
RUN npx prisma generate --schema prisma/schema.prisma

USER node
EXPOSE 4000
# Em produção: aplica as migrations e sobe a API.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node src/server.js"]
