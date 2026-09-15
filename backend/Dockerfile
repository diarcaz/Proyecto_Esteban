# Imagen base ligera de Node.js 20 Alpine para el Backend NestJS
FROM node:20-alpine AS builder

# Instalar OpenSSL para compatibilidad de Prisma ORM en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copiar manifiestos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias del proyecto
RUN npm install

# Copiar código fuente
COPY . .

# Generar cliente de Prisma ORM
RUN npx prisma generate

# Compilar NestJS a JavaScript producción
RUN npm run build

# Etapa de ejecución liviana de producción
FROM node:20-alpine AS runner

# Instalar OpenSSL para ejecución de Prisma en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias necesarias para ejecución y CLI de Prisma
RUN npm install

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3001

# Comando de inicio: aplica migraciones pendientes y arranca servidor NestJS
CMD ["node", "scripts/startup.cjs"]

