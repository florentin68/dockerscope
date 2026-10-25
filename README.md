# Docker Services Updater

Une application web pour lister vos services/containers Docker et vérifier les mises à jour disponibles sur les images utilisées. **Avec support pour l'authentification Docker Hub et l'intégration Portainer !**

## Fonctionnalités

- ✅ Liste tous les conteneurs Docker (en cours d'exécution et arrêtés)
- ✅ Détection des mises à jour disponibles sur Docker Hub
- ✅ **Authentification Docker Hub** pour éviter les limites de rate
- ✅ **Intégration Portainer** pour les mises à jour via l'API
- ✅ **Mode hybride intelligent** : bascule automatiquement entre Docker et Portainer
- ✅ Filtres par statut (en cours d'exécution, arrêté, etc.)
- ✅ Filtres par disponibilité des mises à jour
- ✅ Recherche par nom ou image
- ✅ Actions: démarrer, arrêter, mettre à jour les conteneurs
- ✅ **Actions Portainer**: mettre à jour via l'API Portainer
- ✅ Interface moderne avec Material-UI
- ✅ Rafraîchissement automatique (toutes les 30 secondes)
- ✅ **Indicateurs de source** : voit d'où viennent vos services (Docker local ou Portainer)
- ✅ **Notifications Telegram et Gotify** : alertes en temps réel pour les mises à jour
- ✅ **Configuration par fichier** : comme DIUN de crazymax

## Prérequis

### **Option 1 : Avec démon Docker local**

- Docker installé et en cours d'exécution
- Docker Compose (version 1.29+)
- Accès au socket Docker (`/var/run/docker.sock`)

### **Option 2 : Avec Portainer SEUL** (parfait pour votre cas !)

- Une instance Portainer **accessible** depuis l'application
- Une **clé API Portainer** valide
- **Pas besoin de démon Docker local** !

### **Option 3 : Les deux** (recommandé pour la redondance)

- Docker local + Portainer configuré

## Installation

### Déploiement Swarm avec une seule image GHCR

Le dépôt publie une image unique contenant l’API Node.js et l’interface web. Une GitHub Action la publie sur GHCR à chaque push sur `main` et pour chaque tag `v*`.

1. Dans les paramètres du dépôt GitHub, autorisez l’action à publier des packages (permission `packages: write`).
2. Après la première exécution réussie, rendez le package GHCR public ou configurez l’authentification de vos nœuds Swarm s’il reste privé.
3. Définissez les variables nécessaires dans votre shell, puis déployez la stack :

```bash
export GHCR_IMAGE=ghcr.io/<proprietaire>/<depot>:latest
export PORTAINER_URL=https://portainer.example.com
export PORTAINER_API_KEY=<cle-api>
export PORTAINER_ENDPOINT_ID=1

docker stack deploy --with-registry-auth -c docker-compose.prod.yml services-updater
```

L’interface et l’API seront accessibles sur le port `3000` de chaque nœud Swarm. Les identifiants de registry et de notifications peuvent aussi être fournis via les variables `DOCKERHUB_*`, `GITHUB_TOKEN`, `GITLAB_TOKEN`, `QUAY_TOKEN`, `TELEGRAM_*` et `GOTIFY_*`. Les variables de notification `TELEGRAM_ENABLED` et `GOTIFY_ENABLED` doivent valoir `true` pour les activer.

Ce déploiement n’expose pas le socket Docker : il convient au mode Portainer. Pour le mode Docker local, il faut ajouter le montage `/var/run/docker.sock` au service et contraindre son placement à un nœud qui possède ce socket. En production, préférez des secrets Swarm aux variables d’environnement pour les clés sensibles.

Les images Node utilisent Node 24 LTS et les installations Docker s’appuient sur les lockfiles (`npm ci`). Pour contrôler les dépendances avant une publication :

```bash
(cd backend && npm audit)
(cd frontend && npm audit)
```

### 1. Cloner le dépôt

```bash
git clone <url-du-depot>
cd docker-services-updater
```

### 2. Configurer selon votre mode

#### **🎯 Pour votre environnement (Portainer SEUL)**

```bash
# Copier l'exemple de configuration
cp .env.example .env

# Éditer le fichier .env
nano .env
```

Ajoutez **uniquement** la configuration Portainer :

```ini
# Configuration Portainer (OBLIGATOIRE pour votre cas)
PORTAINER_URL=https://portainer.votre-domaine.com
PORTAINER_API_KEY=votre_clé_api_portainer

# Optionnel : spécifier l'ID de l'endpoint si différent de 1
PORTAINER_ENDPOINT_ID=1
```

> ⚠️ **Important** : Laissez les variables Docker vides, l'application détectera automatiquement qu'elles ne sont pas configurées.

#### **Pour Docker local + Portainer**

```ini
# Docker Hub (optionnel - évite les limites de rate)
DOCKERHUB_USERNAME=votre_username
DOCKERHUB_TOKEN=votre_token_personnel

# Portainer (optionnel)
PORTAINER_URL=https://portainer.votre-domaine.com
PORTAINER_API_KEY=votre_clé_api
```

### 3. Accès Docker local (si utilisé)

Le backend s'exécute en `root` dans le conteneur afin d'accéder au socket Docker monté. Ne rendez pas le socket accessible à tous avec `chmod 666` : son accès permet de contrôler le démon Docker et équivaut à un accès root sur l'hôte.

**→ En mode Portainer seul, retirez aussi le montage `/var/run/docker.sock` du service `backend` dans `docker-compose.yml`.**

### 4. Démarrer l'application

```bash
docker-compose up -d --build
```

### 5. Accéder à l'application

Ouvrez votre navigateur sur: **http://localhost:3000**

## Configuration

### Variables d'environnement

#### Backend

| Variable                  | Description                                             | Défaut    | Requis                               |
| ------------------------- | ------------------------------------------------------- | ---------- | ------------------------------------ |
| `PORT`                  | Port du serveur backend                                 | 3001       | Non                                  |
| `NODE_ENV`              | Environnement Node.js                                   | production | Non                                  |
| `DOCKERHUB_USERNAME`    | Nom d'utilisateur Docker Hub                            | -          | Non                                  |
| `DOCKERHUB_PASSWORD`    | Mot de passe Docker Hub                                 | -          | Non                                  |
| `DOCKERHUB_TOKEN`       | Token d'accès Docker Hub (avec `DOCKERHUB_USERNAME`) | -          | Non                                  |
| `PORTAINER_URL`         | URL de votre instance Portainer                         | -          | **Oui si pas de Docker local** |
| `PORTAINER_API_KEY`     | Clé API Portainer                                      | -          | **Oui si pas de Docker local** |
| `PORTAINER_ENDPOINT_ID` | ID de l'endpoint Portainer                              | 1          | Non                                  |

**Note**: Pour l'authentification Docker Hub, configurez `DOCKERHUB_USERNAME` et soit `DOCKERHUB_PASSWORD`, soit `DOCKERHUB_TOKEN`. Le token personnel est utilisé en priorité s'il est défini.

#### Notifications

| Variable             | Description                | Défaut | Requis |
| -------------------- | -------------------------- | ------- | ------ |
| `TELEGRAM_TOKEN`   | Token du bot Telegram      | -       | Non    |
| `TELEGRAM_CHAT_ID` | ID du chat/group Telegram  | -       | Non    |
| `GOTIFY_URL`       | URL de l'instance Gotify   | -       | Non    |
| `GOTIFY_TOKEN`     | Token d'application Gotify | -       | Non    |

**Alternative**: Vous pouvez aussi configurer les notifications via le fichier `config/notifications.json`. Voir [NOTIFICATIONS.md](NOTIFICATIONS.md) pour plus de détails.

#### Frontend

| Variable              | Description          | Défaut | Requis |
| --------------------- | -------------------- | ------- | ------ |
| `VITE_API_URL` | URL de l'API backend | /api    | Non    |

### Mode de fonctionnement

L'application utilise une **stratégie hybride intelligente** :

1. **Si Docker local est disponible** → Utilise Dockerode pour lister les services
2. **Si Portainer est configuré** → Utilise l'API Portainer pour lister les services
3. **Si les deux sont disponibles** → Combine les résultats des deux sources
4. **Si aucun n'est disponible** → Affiche un message d'erreur clair

**Pour votre environnement (Portainer SEUL)** :

- L'application **n'utilisera que Portainer**
- Le volume `/var/run/docker.sock` **n'est pas nécessaire**
- Toutes les actions (démarrer, arrêter, mettre à jour) passeront par l'API Portainer

## Utilisation

### Interface Web

1. **Tableau des services**: Affiche tous vos services/containers avec :

   - **Colonne "Source"** : Indique si le service vient de Docker local (💻) ou de Portainer (☁️)
   - **Statut** : État du service
   - **Mise à jour** : Indique si une mise à jour est disponible
2. **Filtres**:

   - **Rechercher**: Filtrer par nom de conteneur ou nom d'image
   - **Statut**: Filtrer par statut (En cours d'exécution, Arrêté, etc.)
   - **Mises à jour**: Filtrer par disponibilité des mises à jour
3. **Actions**:

   - 🟢 **Démarrer**: Démarrer un conteneur arrêté
   - 🔴 **Arrêter**: Arrêter un conteneur en cours d'exécution
   - 🔄 **Mettre à jour**: Pull la dernière image et redémarrer
   - 🔄 **Portainer**: Mettre à jour via l'API Portainer (uniquement pour les services Portainer)
4. **Badges d'état** :

   - ✅ **Docker local** : Connexion au démon Docker fonctionnelle
   - ✅ **Portainer** : Intégration Portainer configurée
   - ✅ **Docker Hub** : Authentification Docker Hub configurée
5. **Configuration**: Bouton pour configurer Docker Hub et Portainer
6. **Détails sources**: Cliquez sur "Détails sources" pour voir d'où viennent vos services

### **Cas spécifique : Portainer SEUL**

Si vous utilisez **uniquement Portainer** :

- ✅ **Toutes les fonctionnalités** sont disponibles
- ✅ Les services sont listés via l'API Portainer
- ✅ Les actions (démarrer/arrêter/mettre à jour) passent par Portainer
- ✅ Les mises à jour sont vérifiées via Docker Hub
- ❌ **Pas besoin de démon Docker local**
- ❌ **Pas besoin de socket Docker**

### API Portainer

Si Portainer est configuré, l'application offre des fonctionnalités supplémentaires :

1. **Mise à jour via Portainer**: Met à jour un service directement via l'API Portainer
2. **Gestion des endpoints**: Liste les endpoints Portainer disponibles
3. **Gestion des webhooks**: Configurer des webhooks pour des mises à jour automatiques

### Notifications en temps réel

L'application peut vous alerter des mises à jour disponibles via :

- **Telegram**: Recevez des notifications dans vos conversations ou groupes
- **Gotify**: Notifications push sur votre instance Gotify

#### Fonctionnement automatique

- Vérification toutes les **30 secondes**
- Notification envoyée si des mises à jour sont détectées
- **Cooldown de 1 heure** pour éviter le spam de notifications

#### Endpoints de notification

- `POST /api/notifications/test` - Teste la configuration des notifications
- `GET /api/services/check-and-notify` - Vérifie et envoie des notifications

Voir [NOTIFICATIONS.md](NOTIFICATIONS.md) pour la configuration détaillée.

Les endpoints API Portainer disponibles:

- `GET /api/portainer/endpoints` - Liste les endpoints Portainer
- `GET /api/portainer/webhooks` - Liste les webhooks configurés
- `POST /api/portainer/webhooks` - Crée un nouveau webhook
- `POST /api/portainer/services/:id/update` - Met à jour un service via Portainer

## Développement

### Démarrer en mode développement

#### Backend

```bash
cd backend
npm install
npm run dev
```

Le backend sera disponible sur `http://localhost:3001`

#### Frontend

```bash
cd frontend
npm install
npm start
```

Le frontend sera disponible sur `http://localhost:3000`

> **Note**: En mode développement, le frontend proxyera les requêtes API vers `http://localhost:3001`

### Structure du projet

```
docker-services-updater/
├── backend/
│   ├── server.js          # Serveur Express avec Dockerode + Portainer API
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js         # Composant principal avec gestion hybride
│   │   ├── index.js       # Point d'entrée
│   │   ├── index.css      # Styles
│   │   └── components/
│   │       └── SettingsModal.js  # Modal de configuration
│   ├── public/
│   │   └── index.html     # Page HTML
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf         # Configuration Nginx
├── docker-compose.yml
├── .env.example           # Exemple de configuration
├── Makefile              # Commandes utiles
├── start.sh              # Script de démarrage
└── README.md             # Documentation
```

## Commandes utiles

| Commande             | Description                            |
| -------------------- | -------------------------------------- |
| `make start`       | Démarre l'application                 |
| `make stop`        | Arrête l'application                  |
| `make restart`     | Redémarre l'application               |
| `make logs`        | Affiche les logs                       |
| `make clean`       | Nettoie tout                           |
| `make rebuild`     | Reconstruit tout depuis zéro          |
| `make config-init` | Crée le fichier .env depuis l'exemple |
| `make config-edit` | Édite le fichier .env                 |

## Problèmes courants

### Erreur: "Aucune source de données disponible"

**Solution**: Configurez **au moins une** des options suivantes :

1. **Docker local** : Montez le socket Docker (`/var/run/docker.sock`)
2. **Portainer** : Configurez `PORTAINER_URL` et `PORTAINER_API_KEY` dans le `.env`

Pour votre cas (Portainer SEUL) :

```bash
# Vérifiez votre .env
cat .env

# Assurez-vous que Portainer est accessible
curl -k https://portainer.votre-domaine.com/api/endpoints -H "Authorization: Bearer VOTRE_CLE"
```

### Erreur: "Cannot connect to Docker"

**Solution** : Cette erreur est normale si vous n'avez pas de démon Docker local. **Ignorez-la si vous utilisez Portainer**.

Si vous voulez l'utiliser avec Docker local :

```bash
# Vérifier Docker
docker ps

# Vérifier le socket
ls -la /var/run/docker.sock

# Donner les permissions
sudo chmod 666 /var/run/docker.sock
```

### Erreur: "Portainer non configuré"

**Solution** : Vérifiez votre configuration Portainer :

```ini
# Dans .env
PORTAINER_URL=https://portainer.votre-domaine.com
PORTAINER_API_KEY=votre_clé_api_valide
```

Testez la connexion :

```bash
curl -k "${PORTAINER_URL}/api/endpoints" -H "Authorization: Bearer ${PORTAINER_API_KEY}"
```

### Les mises à jour ne sont pas détectées

**Solution 1**: Configurez l'authentification Docker Hub pour éviter les limites de rate.

**Solution 2**: Attendez quelques minutes et rafraîchissez la page.

### Portainer retourne des erreurs

**Solution**: Vérifiez que:

1. L'URL de Portainer est correcte (`https://` recommandé ; `http://` est aussi accepté)
2. La clé API est valide
3. L'endpoint Docker est accessible depuis votre instance Portainer
4. Le `PORTAINER_ENDPOINT_ID` correspond à un endpoint valide
5. Après toute modification du `.env`, recréez le backend avec `docker compose up -d --build`

## Sécurité

⚠️ **Important**: Cette application peut nécessiter un accès au socket Docker OU à l'API Portainer.

### **Mode Portainer SEUL (recommandé pour votre cas)**

✅ **Avantages sécurité** :

- Pas de socket Docker exposé
- Communication sécurisée via HTTPS avec Portainer
- Contrôle d'accès via la clé API Portainer

**Recommandations** :

1. **Utilisez HTTPS** pour l'URL de Portainer
2. **Limitez les permissions** de la clé API Portainer
3. **Ne partagez pas** vos identifiants Docker Hub ou clés API

### **Mode Docker local**

**Recommandations** :

1. **Ne pas exposer sur Internet**
2. **Utiliser HTTPS** avec un reverse proxy
3. **Limiter les permissions** du socket Docker

## API

Le backend expose les endpoints suivants:

### Services/Containers

| Endpoint                                    | Méthode | Description                                    |
| ------------------------------------------- | -------- | ---------------------------------------------- |
| `/api/health`                             | GET      | Vérifier la santé de l'API et des connexions |
| `/api/config`                             | GET      | Obtenir la configuration actuelle              |
| `/api/services`                           | GET      | Lister tous les services (Docker + Portainer)  |
| `/api/services/check-updates?image=<nom>` | GET      | Vérifier les mises à jour pour une image     |
| `/api/containers/:id`                     | GET      | Obtenir les infos d'un conteneur               |
| `/api/containers/:id/start`               | POST     | Démarrer un conteneur (hybride)               |
| `/api/containers/:id/stop`                | POST     | Arrêter un conteneur (hybride)                |
| `/api/containers/:id/update`              | POST     | Mettre à jour un conteneur (hybride)          |

### Portainer

| Endpoint                               | Méthode | Description                    |
| -------------------------------------- | -------- | ------------------------------ |
| `/api/portainer/endpoints`           | GET      | Lister les endpoints Portainer |
| `/api/portainer/webhooks`            | GET      | Lister les webhooks Portainer  |
| `/api/portainer/webhooks`            | POST     | Créer un webhook Portainer    |
| `/api/portainer/services/:id/update` | POST     | Mettre à jour via Portainer   |

## Contribution

1. Fork le projet
2. Créez une branche de fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Poussez vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## Licence

MIT License

## Auteurs

Créé avec ❤️ par Mistral Vibe et Copilot
