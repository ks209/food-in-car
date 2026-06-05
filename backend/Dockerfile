# backend/Dockerfile

FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

RUN npx prisma generate

COPY prisma ./prisma


# Copy the entire backend code
COPY . .

# RUN npx prisma migrate dev --name init --create-only
# RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "run", "dev"]
