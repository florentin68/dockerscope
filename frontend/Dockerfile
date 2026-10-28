# Dockerfile pour le frontend React
FROM node:26-alpine AS build

WORKDIR /app

# Copier les fichiers de configuration
COPY package*.json ./

RUN npm ci

# Copier les fichiers source
COPY public ./public
COPY src ./src
COPY index.html vite.config.mjs ./

# Builder l'application
RUN npm run build

# Stage de production avec Nginx
FROM nginx:alpine

# Copier la configuration Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers build
COPY --from=build /app/dist /usr/share/nginx/html

# Exposer le port 80
EXPOSE 80

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
