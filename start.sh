#!/bin/bash

# Script de démarrage pour Docker Services Updater
# Supporte les modes: Docker local, Portainer, ou Hybride

set -e

echo "=========================================="
echo "  Docker Services Updater - Démarrage"
echo "=========================================="
echo ""

# Vérifier Docker
if ! command -v docker &> /dev/null; then
    echo "❌ ERREUR: Docker n'est pas installé"
    echo "   Installez Docker avant de continuer"
    exit 1
fi

# Vérifier docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ ERREUR: docker-compose n'est pas installé"
    echo "   Installez docker-compose avant de continuer"
    exit 1
fi

# Vérifier que Docker est en cours d'exécution
if ! docker info &> /dev/null; then
    echo "⚠️  Avertissement: Docker n'est pas en cours d'exécution"
    echo "   Si vous utilisez le mode Docker local, démarrez Docker"
    echo "   Si vous utilisez le mode Portainer SEUL, vous pouvez ignorer ce message"
    echo ""
fi

echo "✅ Docker est installé"
echo ""

# Vérifier le socket Docker
if [ -S /var/run/docker.sock ]; then
    echo "✅ Socket Docker accessible"
    
    # Vérifier les permissions sur le socket
    if [ -w /var/run/docker.sock ]; then
        echo "✅ Permissions sur le socket Docker: OK"
    else
        echo "⚠️  Avertissement: Le socket Docker n'est pas accessible en écriture"
        echo "   Essayer: sudo chmod 666 /var/run/docker.sock"
        echo "   Ou: sudo usermod -aG docker \$USER"
        read -p "Voulez-vous continuer quand même? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo "⚠️  Socket Docker non trouvé à /var/run/docker.sock"
    echo "   Si vous utilisez le mode Portainer SEUL, c'est normal"
    echo "   Si vous voulez utiliser Docker local, le socket est requis"
    echo ""
fi

# Vérifier la configuration
echo "📋 Configuration détectée:"

# Vérifier Docker Hub
if [ -f .env ] && grep -q "DOCKERHUB_USERNAME\|DOCKERHUB_TOKEN" .env; then
    echo "  ✅ Authentification Docker Hub configurée"
else
    echo "  ⚠️  Authentification Docker Hub non configurée (100 req/6h limite)"
fi

# Vérifier Portainer
if [ -f .env ] && grep -q "PORTAINER_URL" .env; then
    echo "  ✅ Intégration Portainer configurée"
    echo "     Mode: Hybride (Docker + Portainer) ou Portainer SEUL"
else
    echo "  ⚠️  Intégration Portainer non configurée"
    echo "     Mode: Docker local uniquement"
fi

echo ""

# Détecter le mode
if [ -f .env ] && grep -q "PORTAINER_URL" .env && ! [ -S /var/run/docker.sock ]; then
    echo "🎯 Mode détecté: PORTTAINER SEUL"
    echo "   L'application utilisera uniquement l'API Portainer"
    echo ""
elif [ -f .env ] && grep -q "PORTAINER_URL" .env && [ -S /var/run/docker.sock ]; then
    echo "🎯 Mode détecté: HYBRIDE (Docker + Portainer)"
    echo "   L'application utilisera les deux sources de données"
    echo ""
else
    echo "🎯 Mode détecté: DOCKER LOCAL"
    echo "   L'application utilisera le socket Docker local"
    echo ""
fi

echo "🚀 Construction et démarrage des conteneurs..."
echo ""

# Builder et démarrer
docker compose up -d --build

echo ""
echo "✅ Conteneurs démarrés avec succès!"
echo ""
echo "📊 Accédez à l'application sur: http://localhost:3000"
echo ""
echo "💡 Pour arrêter l'application:"
echo "   docker compose down"
echo ""
echo "💡 Pour voir les logs:"
echo "   docker compose logs -f"
echo ""
echo "💡 Pour modifier la configuration:"
echo "   nano .env"
echo "   docker compose down && docker compose up -d --build"
echo ""
echo "💡 Pour forcer le rebuild sans cache:"
echo "   docker compose down -v && docker compose up -d --build --no-cache"
echo ""
