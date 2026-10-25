# Dockerfile pour le backend Node.js
FROM node:24-alpine

WORKDIR /app

# Copier les fichiers
COPY package*.json ./
COPY server.js ./

RUN npm ci --omit=dev && npm cache clean --force

# Exposer le port
EXPOSE 3001

# Démarrer l'application (en tant que root pour simplifier)
CMD ["node", "server.js"]
