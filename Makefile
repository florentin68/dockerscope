# Makefile pour Docker Services Updater

.PHONY: help build start stop restart logs clean pull config

# Variables
DOCKER_COMPOSE = docker-compose
ENV_FILE = .env

help: ## Affiche cette aide
	@echo "Commandes disponibles pour Docker Services Updater:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""

build: ## Construit les images Docker
	$(DOCKER_COMPOSE) build

start: ## Démarre les conteneurs
	$(DOCKER_COMPOSE) up -d

stop: ## Arrête les conteneurs
	$(DOCKER_COMPOSE) down

restart: stop start ## Redémarre les conteneurs

logs: ## Affiche les logs des conteneurs
	$(DOCKER_COMPOSE) logs -f

logs-backend: ## Affiche les logs du backend
	$(DOCKER_COMPOSE) logs -f backend

logs-frontend: ## Affiche les logs du frontend
	$(DOCKER_COMPOSE) logs -f frontend

clean: ## Supprime les conteneurs, réseaux et volumes
	$(DOCKER_COMPOSE) down -v

pull: ## Met à jour les images de base
	$(DOCKER_COMPOSE) pull

rebuild: clean pull build start ## Reconstruit tout depuis zéro

ps: ## Liste les conteneurs en cours d'exécution
	$(DOCKER_COMPOSE) ps

# Configuration
config-init: ## Crée le fichier .env depuis l'exemple
	cp $(ENV_FILE).example $(ENV_FILE)

config-edit: ## Édite le fichier .env
	nano $(ENV_FILE)

config-view: ## Affiche la configuration actuelle
	cat $(ENV_FILE) 2>/dev/null || echo "Fichier .env non trouvé"

# Commandes de développement
install-deps: ## Installe les dépendances npm
	cd backend && npm install
	cd frontend && npm install

dev-backend: ## Démarre le backend en mode développement
	cd backend && npm run dev

dev-frontend: ## Démarre le frontend en mode développement
	cd frontend && npm start

dev: dev-backend & dev-frontend ## Démarre tout en mode développement

# Commandes Docker
build-no-cache: ## Reconstruit sans cache
	$(DOCKER_COMPOSE) build --no-cache

prune: clean ## Nettoie le système Docker
	docker system prune -f
