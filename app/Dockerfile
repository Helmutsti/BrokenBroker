# Pagina web dell'app: si costruisce con Node e si serve con nginx,
# che passa le chiamate /api all'API (servizio "api" di compose.yaml).
FROM node:24-alpine AS costruzione
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=costruzione /app/dist /usr/share/nginx/html
