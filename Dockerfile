# Dockerfile para Cozy Leap Online Backend
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 1. Copiar manifiesto de dependencias
COPY package*.json ./

# 2. Instalar dependencias de producción
RUN npm install --omit=dev

# 3. Copiar configuración de TypeScript y código fuente del servidor
COPY tsconfig.json ./
COPY server ./server
COPY server.ts ./

EXPOSE 3000

# 4. Iniciar el servidor backend
CMD ["npm", "start"]
