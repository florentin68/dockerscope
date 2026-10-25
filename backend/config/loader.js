const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuration par défaut
const defaultConfig = {
  portainer: { url: null, api_key: null, endpoint_id: '1' },
  docker_hub: { username: null, password: null, token: null },
  registries: { github: { token: null }, gitlab: { token: null }, quay: { token: null } },
  notifications: {
    telegram: { enabled: false, token: null, chat_id: null, parse_mode: 'HTML' },
    gotify: { enabled: false, url: null, token: null, priority: 5 }
  },
  settings: { check_interval: 86400000, notification_cooldown: 3600000 }
};

let config = { ...defaultConfig };

/**
 * Charge la configuration depuis le fichier YAML ou JSON
 * Priorité: YAML > JSON > variables d'environnement
 */
function loadConfig() {
  try {
    const configYamlPath = path.join(__dirname, '..', 'config', 'config.yml');
    const configJsonPath = path.join(__dirname, '..', 'config', 'config.json');
    
    let fileConfig = {};
    
    // Essayer de charger le YAML en premier
    if (fs.existsSync(configYamlPath)) {
      fileConfig = yaml.load(fs.readFileSync(configYamlPath, 'utf8'));
      console.log('✓ Configuration chargée depuis config/config.yml');
    }
    // Sinon essayer le JSON
    else if (fs.existsSync(configJsonPath)) {
      fileConfig = JSON.parse(fs.readFileSync(configJsonPath, 'utf8'));
      console.log('✓ Configuration chargée depuis config/config.json');
    }
    
    if (Object.keys(fileConfig).length > 0) {
      // Fusionner avec les variables d'environnement (les env variables priment)
      config = {
        portainer: {
          url: process.env.PORTAINER_URL || fileConfig.portainer?.url || null,
          api_key: process.env.PORTAINER_API_KEY || fileConfig.portainer?.api_key || null,
          endpoint_id: process.env.PORTAINER_ENDPOINT_ID || fileConfig.portainer?.endpoint_id || '1'
        },
        docker_hub: {
          username: process.env.DOCKERHUB_USERNAME || fileConfig.docker_hub?.username || null,
          password: process.env.DOCKERHUB_PASSWORD || fileConfig.docker_hub?.password || null,
          token: process.env.DOCKERHUB_TOKEN || fileConfig.docker_hub?.token || null
        },
        registries: {
          github: { token: process.env.GITHUB_TOKEN || fileConfig.registries?.github?.token || null },
          gitlab: { token: process.env.GITLAB_TOKEN || fileConfig.registries?.gitlab?.token || null },
          quay: { token: process.env.QUAY_TOKEN || fileConfig.registries?.quay?.token || null }
        },
        notifications: {
          telegram: {
            enabled: fileConfig.notifications?.telegram?.enabled || false,
            token: process.env.TELEGRAM_TOKEN || fileConfig.notifications?.telegram?.token || null,
            chat_id: process.env.TELEGRAM_CHAT_ID || fileConfig.notifications?.telegram?.chat_id || null,
            parse_mode: fileConfig.notifications?.telegram?.parse_mode || 'HTML'
          },
          gotify: {
            enabled: fileConfig.notifications?.gotify?.enabled || false,
            url: process.env.GOTIFY_URL || fileConfig.notifications?.gotify?.url || null,
            token: process.env.GOTIFY_TOKEN || fileConfig.notifications?.gotify?.token || null,
            priority: fileConfig.notifications?.gotify?.priority || 5
          }
        },
        settings: {
          check_interval: fileConfig.settings?.check_interval || 86400000,
          notification_cooldown: fileConfig.settings?.notification_cooldown || 3600000
        }
      };
    }
  } catch (error) {
    console.log('⚠ Impossible de charger la configuration:', error.message);
  }
}

/**
 * Retourne la configuration actuelle
 */
function getConfig() {
  return config;
}

/**
 * Met à jour la configuration
 */
function setConfig(newConfig) {
  config = { ...config, ...newConfig };
}

module.exports = {
  loadConfig,
  getConfig,
  setConfig,
  defaultConfig
};
