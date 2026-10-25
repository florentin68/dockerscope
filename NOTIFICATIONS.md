# Configuration des Notifications

Ce document explique comment configurer les notifications Telegram et Gotify pour Docker Services Updater.

## 📁 Configuration

### Méthode 1 : Fichier de configuration (recommandé)

Créez ou modifiez le fichier `config/notifications.json` :

```json
{
  "notifications": {
    "telegram": {
      "enabled": true,
      "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "chat_id": -1001234567890,
      "parse_mode": "HTML"
    },
    "gotify": {
      "enabled": true,
      "url": "https://gotify.example.com",
      "token": "AbCdEfGhIjKlMnOp",
      "priority": 5
    }
  }
}
```

### Méthode 2 : Variables d'environnement

Vous pouvez aussi configurer les notifications via le fichier `.env` :

```bash
# Telegram
TELEGRAM_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# Gotify
GOTIFY_URL=https://gotify.example.com
GOTIFY_TOKEN=AbCdEfGhIjKlMnOp
```

**Priorité** : Les variables d'environnement **priment** sur le fichier de configuration.

## 📱 Configuration Telegram

### 1. Créer un bot Telegram

1. Ouvrez une conversation avec [@BotFather](https://t.me/BotFather) sur Telegram
2. Envoyez `/newbot`
3. Suivez les instructions pour nommer votre bot
4. **Copiez le token** généré (format : `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Obtenir votre Chat ID

1. Envoyez un message à votre bot
2. Visitez cette URL dans votre navigateur (remplacez `TOKEN` par votre token) :
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Cherchez le champ `chat.id` dans la réponse JSON
4. Pour les groupes, le chat_id commence par `-100` (ex: `-1001234567890`)

### 3. Tester la configuration

```bash
curl -X POST http://localhost:3001/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Test de notification Telegram"}'
```

Vous devriez recevoir un message dans votre conversation Telegram.

## 🔔 Configuration Gotify

### 1. Installer Gotify

Suivez les instructions sur [gotify.net](https://gotify.net)

### 2. Créer une application

1. Connectez-vous à votre instance Gotify
2. Allez dans **Apps** → **Create**
3. Donnez un nom à votre application (ex: "Docker Services Updater")
4. **Copiez le token** généré
5. Notez l'URL de votre instance Gotify (ex: `https://gotify.example.com`)

### 3. Tester la configuration

```bash
curl -X POST http://localhost:3001/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Test de notification Gotify", "title": "Test"}'
```

Vous devriez recevoir une notification dans votre application Gotify.

## 🔄 Notifications automatiques

### Vérification périodique

Le backend vérifie automatiquement les mises à jour **toutes les 30 secondes** et envoie une notification si :
- Des mises à jour sont détectées
- Le cooldown de 1 heure est passé (pour éviter les spam)

### Endpoint de vérification manuelle

Pour déclencher une vérification et envoyer des notifications manuellement :

```bash
curl http://localhost:3001/api/services/check-and-notify
```

Réponse :
```json
{
  "success": true,
  "servicesChecked": 10,
  "servicesWithUpdates": 3,
  "notified": true,
  "services": [
    {"name": "mon-service-1"},
    {"name": "mon-service-2"},
    {"name": "mon-service-3"}
  ]
}
```

## 📊 Exemple de notification

### Telegram
```
⬆️ Mises à jour disponibles

📦 3 mise(s) à jour disponible(s):

• mon-application/backend
• mon-application/frontend  
• database/postgres
```

### Gotify
- **Titre** : ⬆️ Mises à jour disponibles
- **Message** : 📦 3 mise(s) à jour disponible(s):\n\n• mon-application/backend\n• mon-application/frontend\n• database/postgres
- **Priorité** : 5 (configurable)

## 🚨 Dépannage

### Telegram
- **Erreur "Not Found"** : Vérifiez que le token et le chat_id sont corrects
- **Erreur "Bad Request: chat not found"** : Le chat_id est incorrect
- **Erreur "Unauthorized"** : Le token est invalide

### Gotify
- **Erreur de connexion** : Vérifiez que l'URL est correcte (avec HTTPS si nécessaire)
- **Erreur "Invalid token"** : Le token Gotify est incorrect
- **Erreur 404** : L'endpoint `/message` n'existe pas, vérifiez la version de Gotify

## 🔒 Sécurité

- Ne partagez **jamais** vos tokens dans des dépôts publics
- Utilisez des variables d'environnement pour les environnements de production
- Limitez les permissions des tokens (ex: bot Telegram avec permissions minimales)

## 📝 Configuration avancée

### Cooldown des notifications

Pour éviter le spam, les notifications ne sont envoyées qu'une fois par heure pour les mêmes mises à jour.

### Personnalisation du message

Vous pouvez modifier le format des messages en modifiant le code dans `backend/server.js` (fonction `sendNotification`).

### Priorité Gotify

Les valeurs de priorité pour Gotify :
- 0-4 : Faible priorité
- 5 : Priorité normale (par défaut)
- 6-10 : Haute priorité
