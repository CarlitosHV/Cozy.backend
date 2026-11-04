# Dockerfile para Cozy Leap Online Backend
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json tsconfig.json vite.config.ts ./
RUN npm ci

# Copiar código fuente
COPY . .

# Construir bundle frontend y tipos
RUN npm run build

# Etapa final de producción
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Instalar tsx para ejecutar server.ts
RUN npm install -g tsx

EXPOSE 3000

CMD ["tsx", "server.ts"]
