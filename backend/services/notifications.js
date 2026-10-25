const https = require('https');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../config/loader');

// Fichier de suivi des notifications
const NOTIFICATIONS_FILE = path.join(__dirname, '..', 'config', 'notifications.json');

// Charger les notifications envoyées
function loadSentNotifications() {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    }
  } catch (error) {
    console.log('⚠ Impossible de charger les notifications envoyées:', error.message);
  }
  return { last_notifications: {} };
}

// Sauvegarder les notifications envoyées
function saveSentNotifications(notifications) {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), 'utf8');
  } catch (error) {
    console.log('⚠ Impossible de sauvegarder les notifications:', error.message);
  }
}

/**
 * Vérifie si une notification pour cette mise à jour a déjà été envoyée
 */
function wasNotificationSent(containerId, image, newVersion) {
  const notifications = loadSentNotifications();
  const key = `${containerId}:${image}`;
  const lastNotification = notifications.last_notifications[key];
  
  if (!lastNotification) return false;
  
  // Vérifier si c'est la même version
  if (lastNotification.version === newVersion) {
    const cooldown = getConfig().settings.notification_cooldown || 3600000;
    const now = Date.now();
    const lastSent = new Date(lastNotification.timestamp).getTime();
    
    // Si le cooldown n'est pas écoulé, ne pas renvoyer une notification
    return (now - lastSent) < cooldown;
  }
  
  return false;
}

/**
 * Marque une notification comme envoyée
 */
function markNotificationSent(containerId, image, newVersion) {
  const notifications = loadSentNotifications();
  const key = `${containerId}:${image}`;
  
  notifications.last_notifications[key] = {
    containerId,
    image,
    version: newVersion,
    timestamp: new Date().toISOString()
  };
  
  saveSentNotifications(notifications);
}

/**
 * Envoyer une notification Telegram
 */
async function sendTelegramNotification(message, parseMode = 'HTML') {
  const config = getConfig();
  
  if (!config.notifications.telegram.enabled || 
      !config.notifications.telegram.token || 
      !config.notifications.telegram.chat_id) {
    return false;
  }

  const url = new URL(`https://api.telegram.org/bot${config.notifications.telegram.token}/sendMessage`);
  url.searchParams.set('chat_id', config.notifications.telegram.chat_id);
  url.searchParams.set('text', message);
  url.searchParams.set('parse_mode', parseMode);

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.ok === true);
        } catch (e) {
          resolve(false);
        }
      });
    }).on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Envoyer une notification Gotify
 */
async function sendGotifyNotification(title, message, priority = 5) {
  const config = getConfig();
  
  if (!config.notifications.gotify.enabled || 
      !config.notifications.gotify.url || 
      !config.notifications.gotify.token) {
    return false;
  }

  const url = new URL(`${config.notifications.gotify.url}/message`);
  
  const postData = JSON.stringify({
    title,
    message,
    priority
  });

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': `Bearer ${config.notifications.gotify.token}`
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(res.statusCode === 200);
      });
    });

    req.on('error', () => {
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Envoyer une notification via tous les canaux configurés
 */
async function sendNotification(title, message) {
  const results = await Promise.allSettled([
    sendTelegramNotification(message),
    sendGotifyNotification(title, message)
  ]);
  
  return results.some(result => result.status === 'fulfilled' && result.value === true);
}

/**
 * Envoyer une notification de mise à jour disponible
 */
async function sendUpdateNotification(container, newVersion) {
  if (!container || !newVersion) return false;
  
  // Vérifier si la notification a déjà été envoyée
  if (wasNotificationSent(container.id, container.image, newVersion)) {
    console.log(`Notification déjà envoyée pour ${container.name} (${newVersion})`);
    return false;
  }
  
  const message = `📦 <b>Mise à jour disponible</b>\n\n` +
    `🏷 <b>Conteneur:</b> <code>${container.name || container.id.substring(0, 12)}</code>\n` +
    `📋 <b>Image:</b> <code>${container.image}</code>\n` +
    `🆕 <b>Nouvelle version:</b> <code>${newVersion}</code>\n\n` +
    `⏰ <i>Une nouvelle version est disponible pour ce conteneur.</i>`;
  
  const success = await sendNotification(`Mise à jour: ${container.name}`, message);
  
  if (success) {
    markNotificationSent(container.id, container.image, newVersion);
  }
  
  return success;
}

module.exports = {
  sendTelegramNotification,
  sendGotifyNotification,
  sendNotification,
  sendUpdateNotification,
  wasNotificationSent,
  markNotificationSent
};
