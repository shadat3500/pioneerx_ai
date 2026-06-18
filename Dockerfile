# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and generate prisma client
COPY . .
RUN npx prisma generate

# Build the application
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

LABEL maintainer="PioneerX Team"
ENV NODE_ENV=development

WORKDIR /app

# Copy necessary files from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/nest-cli.json ./nest-cli.json
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Create necessary directories and set ownership
RUN mkdir -p logs uploads && chown -R node:node logs uploads

EXPOSE 8083

CMD ["npm", "run", "start:dev"]
