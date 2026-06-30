# backend/Dockerfile

FROM node:20-slim

# Prisma needs openssl on the slim image to run its query engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first so this layer is cached unless package files change.
# postinstall runs `prisma generate`, so copy the schema before installing.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Copy the rest of the backend source
COPY . .

# Regenerate the client against the copied schema (output: ../generated/prisma)
RUN npx prisma generate

EXPOSE 5000

# `start` runs: prisma migrate deploy && seed && node index.js
CMD ["npm", "start"]
