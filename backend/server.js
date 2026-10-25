const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration globale chargée depuis le fichier ou les variables d'environnement
let config = {
  portainer: { url: null, api_key: null, endpoint_id: '1' },
  docker_hub: { username: null, password: null, token: null },
  registries: { github: { token: null }, gitlab: { token: null }, quay: { token: null } },
  notifications: {
    telegram: { enabled: false, token: null, chat_id: null, parse_mode: 'HTML' },
    gotify: { enabled: false, url: null, token: null, priority: 5 }
  },
  settings: { check_interval: 86400000, notification_cooldown: 3600000 }
};

// Charger la configuration depuis le fichier config.yml ou config.json
function loadConfig() {
  try {
    const configYamlPath = path.join(__dirname, 'config', 'config.yml');
    const configJsonPath = path.join(__dirname, 'config', 'config.json');
    
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
    
    // Fusionner les variables d'environnement avec le fichier; elles sont prioritaires.
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
          enabled: process.env.TELEGRAM_ENABLED === 'true' || fileConfig.notifications?.telegram?.enabled || false,
          token: process.env.TELEGRAM_TOKEN || fileConfig.notifications?.telegram?.token || null,
          chat_id: process.env.TELEGRAM_CHAT_ID || fileConfig.notifications?.telegram?.chat_id || null,
          parse_mode: fileConfig.notifications?.telegram?.parse_mode || 'HTML'
        },
        gotify: {
          enabled: process.env.GOTIFY_ENABLED === 'true' || fileConfig.notifications?.gotify?.enabled || false,
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
  } catch (error) {
    console.log('⚠ Impossible de charger la configuration:', error.message);
  }
}

// État de la connexion Docker
let dockerConnected = false;
let docker = null;

// Les configurations sont maintenant chargées via loadConfig()

// Envoyer une notification Telegram
function sendTelegramNotification(message, parseMode = 'HTML') {
  if (!config.notifications.telegram.enabled || !config.notifications.telegram.token || !config.notifications.telegram.chat_id) {
    return Promise.resolve(false);
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
          const result = JSON.parse(data);
          if (result.ok) {
            console.log('✓ Notification Telegram envoyée');
            resolve(true);
          } else {
            console.log('⚠ Échec notification Telegram:', result.description);
            resolve(false);
          }
        } catch (e) {
          console.log('⚠ Erreur parsing réponse Telegram');
          resolve(false);
        }
      });
    }).on('error', () => {
      console.log('⚠ Erreur envoi notification Telegram');
      resolve(false);
    }).end();
  });
}

// Envoyer une notification Gotify
function sendGotifyNotification(title, message, priority = 5) {
  if (!config.notifications.gotify.enabled || !config.notifications.gotify.url || !config.notifications.gotify.token) {
    return Promise.resolve(false);
  }

  const postData = JSON.stringify({
    title: title,
    message: message,
    priority: priority
  });

  const url = new URL(`${config.notifications.gotify.url}/message?token=${config.notifications.gotify.token}`);

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Notification Gotify envoyée');
          resolve(true);
        } else {
          console.log('⚠ Échec notification Gotify:', res.statusCode);
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      console.log('⚠ Erreur envoi notification Gotify');
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

// Envoyer une notification via tous les canaux configurés
async function sendNotification(title, message) {
  const results = await Promise.allSettled([
    sendTelegramNotification(message),
    sendGotifyNotification(title, message, config.notifications.gotify.priority)
  ]);
  
  return results.some(r => r.status === 'fulfilled' && r.value === true);
}

// Initialisation Docker (facultative)
function initDocker() {
  try {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
    dockerConnected = true;
    console.log('✓ Connecté au socket Docker');
    return docker;
  } catch (socketError) {
    console.log('⚠ Socket Docker non disponible, tentative avec TCP...');
    try {
      docker = new Docker({ host: 'localhost', port: 2375 });
      dockerConnected = true;
      console.log('✓ Connecté au TCP Docker (localhost:2375)');
      return docker;
    } catch (tcpError) {
      console.log('⚠ Impossible de se connecter à Docker local:' + tcpError.message);
      dockerConnected = false;
      return null;
    }
  }
}

// Appel HTTP générique pour Portainer
function portainerRequest(method, endpoint, data = null, endpointId = config.portainer.endpoint_id) {
  if (!config.portainer.url || !config.portainer.api_key) {
    return Promise.reject(new Error('Portainer non configuré. Configurez config.portainer.url et config.portainer.api_key'));
  }

  let baseUrl = config.portainer.url;
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `http://${baseUrl}`;
  }
  const parsedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    return Promise.reject(new Error('config.portainer.url doit utiliser http:// ou https://'));
  }
  const basePath = `${parsedBaseUrl.origin}${parsedBaseUrl.pathname.replace(/\/+$/, '')}/`;
  const endpointPath = endpoint.startsWith('docker/')
    ? `endpoints/${encodeURIComponent(endpointId)}/${endpoint}`
    : endpoint;
  const url = new URL(`api/${endpointPath}`, basePath);

  return new Promise((resolve, reject) => {
    const options = {
      method: method || 'GET',
      headers: {
        'X-API-Key': config.portainer.api_key,
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: false
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`Portainer API erreur: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout Portainer API'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = data;
        try {
          body = JSON.parse(data);
        } catch (error) {
          // The caller reports invalid or unexpected response bodies.
        }
        resolve({ 
          statusCode: res.statusCode, 
          headers: res.headers,
          body 
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('Timeout Docker Hub'));
    });
  });
}

// Cache pour les tags des registries
const tagCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Helper: Extraire le registry, repository, tag et digest de l'image
function parseImageName(imageName) {
  if (!imageName) return { registry: 'docker.io', repo: '', tag: 'latest', digest: null, hasDigest: false };
  
  let registry = 'docker.io';
  let repo = imageName;
  let tag = 'latest';
  let digest = null;
  let hasDigest = false;
  
  // Extraire le digest si présent (ex: image@sha256:...)
  const atIndex = imageName.indexOf('@');
  if (atIndex > -1) {
    const digestPart = imageName.substring(atIndex + 1);
    // Vérifier que c'est bien un digest sha256
    if (digestPart.startsWith('sha256:')) {
      digest = digestPart;
      repo = imageName.substring(0, atIndex);
      hasDigest = true;
    }
  }
  
  // Extraire le registry si présent (ex: ghcr.io/owner/repo:tag)
  const firstSlash = repo.indexOf('/');
  const firstComponent = firstSlash > -1 ? repo.substring(0, firstSlash) : '';
  const hasRegistry = firstSlash > -1 && (
    firstComponent.includes('.') ||
    firstComponent.includes(':') ||
    firstComponent === 'localhost'
  );
  
  if (hasRegistry) {
    const registryEnd = repo.indexOf('/', firstSlash + 1);
    if (registryEnd === -1) {
      // Format: registry/repo:tag
      registry = repo.substring(0, firstSlash);
      repo = repo.substring(firstSlash + 1);
    } else {
      // Format: registry/owner/repo:tag
      registry = repo.substring(0, firstSlash);
      repo = repo.substring(firstSlash + 1);
    }
  }
  
  // Extraire le tag
  const colonIndex = repo.lastIndexOf(':');
  const lastSlash = repo.lastIndexOf('/');
  
  if (colonIndex > lastSlash) {
    const repoWithoutTag = repo.substring(0, colonIndex);
    tag = repo.substring(colonIndex + 1);
    repo = repoWithoutTag;
  }
  
  // Normaliser les registries Docker Hub
  if (registry === 'docker.io' || registry === '' || registry === 'index.docker.io') {
    registry = 'docker.io';
  }
  
  // Ajouter library/ pour les images officielles Docker Hub
  if (registry === 'docker.io' && !repo.includes('/')) {
    repo = `library/${repo}`;
  }
  
  return { registry, repo, tag, digest, hasDigest };
}

// Helper: Comparer les versions semver (simplifié)
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = v2.split('.').map(p => parseInt(p, 10) || 0);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// Générer le token d'authentification Docker Hub
function getDockerHubAuthToken() {
  const password = config.docker_hub.token || config.docker_hub.password;
  if (config.docker_hub.username && password) {
    return `Basic ${Buffer.from(`${config.docker_hub.username}:${password}`).toString('base64')}`;
  }
  
  return null;
}

function getBearerChallengeParameters(challenge) {
  if (!challenge?.startsWith('Bearer ')) {
    return null;
  }

  const parameters = {};
  const parameterPattern = /([a-zA-Z]+)="([^"]*)"/g;
  for (const match of challenge.slice(7).matchAll(parameterPattern)) {
    parameters[match[1]] = match[2];
  }
  return parameters;
}

async function getRegistryBearerToken(challenge, repo) {
  const parameters = getBearerChallengeParameters(challenge);
  if (!parameters?.realm) {
    return null;
  }

  const tokenUrl = new URL(parameters.realm);
  if (tokenUrl.protocol !== 'https:') {
    throw new Error('Le service de jetons du registre doit utiliser HTTPS');
  }
  if (parameters.service) {
    tokenUrl.searchParams.set('service', parameters.service);
  }
  tokenUrl.searchParams.set('scope', parameters.scope || `repository:${repo}:pull`);

  const headers = {};
  if (tokenUrl.hostname === 'auth.docker.io') {
    const authorization = getDockerHubAuthToken();
    if (authorization) headers.Authorization = authorization;
  } else if (
    (tokenUrl.hostname === 'ghcr.io' || tokenUrl.hostname === 'www.ghcr.io') &&
    config.registries.github.token
  ) {
    headers.Authorization = `Basic ${Buffer.from(`token:${config.registries.github.token}`).toString('base64')}`;
  }

  const response = await requestJson(tokenUrl, { headers });
  if (response.statusCode !== 200) {
    return null;
  }
  return response.body.token || response.body.access_token || null;
}

// Fonction pour récupérer les infos d'une image depuis un registry (manifest)
async function getImageManifestInfo(registry, repo, reference) {
  // reference peut être un tag ou un digest
  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');
  const manifestRegistry = registry === 'docker.io' ? 'registry-1.docker.io' : registry;
  const manifestUrl = new URL(`https://${manifestRegistry}/v2/${encodedRepo}/manifests/${reference}`);
  
  // Accept header pour le manifest (supporte v2, OCI manifest et OCI index)
  const acceptHeader = 'application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.oci.image.index.v1+json';
  
  try {
    const manifestResponse = await requestJson(manifestUrl, {
      headers: { 
        'Accept': acceptHeader
      }
    });
    
    if (manifestResponse.statusCode === 200) {
      const manifest = manifestResponse.body;
      return {
        digest: manifestResponse.headers['docker-content-digest'] || null,
        created: manifestResponse.headers['date'] || null,
        manifest: manifest
      };
    }
    
    // Si 401, essayer avec auth selon le registry
    if (manifestResponse.statusCode === 401) {
      const bearerToken = await getRegistryBearerToken(
        manifestResponse.headers['www-authenticate'],
        repo
      );
      if (bearerToken) {
        const retryResponse = await requestJson(manifestUrl, {
          headers: {
            'Accept': acceptHeader,
            'Authorization': `Bearer ${bearerToken}`
          }
        });
        if (retryResponse.statusCode === 200) {
          return {
            digest: retryResponse.headers['docker-content-digest'] || null,
            created: retryResponse.headers['date'] || null,
            manifest: retryResponse.body
          };
        }
      }

      // Pour Docker Hub
      if (registry === 'docker.io' || registry === 'registry-1.docker.io') {
        const authUrl = new URL('https://auth.docker.io/token');
        authUrl.searchParams.set('service', 'registry.docker.io');
        authUrl.searchParams.set('scope', `repository:${repo}:pull`);
        
        const authorization = getDockerHubAuthToken();
        const tokenResponse = await requestJson(authUrl, {
          headers: authorization ? { Authorization: authorization } : {}
        });
        
        if (tokenResponse.statusCode === 200) {
          const registryToken = tokenResponse.body.token || tokenResponse.body.access_token;
          const retryResponse = await requestJson(manifestUrl, {
            headers: {
              'Accept': acceptHeader,
              'Authorization': `Bearer ${registryToken}`
            }
          });
          
          if (retryResponse.statusCode === 200) {
            return {
              digest: retryResponse.headers['docker-content-digest'] || null,
              created: retryResponse.headers['date'] || null,
              manifest: retryResponse.body
            };
          }
        }
      }
      
      // Pour GHCR
      if (registry === 'ghcr.io') {
        const authUrl = new URL('https://ghcr.io/token');
        authUrl.searchParams.set('service', 'ghcr.io');
        authUrl.searchParams.set('scope', `repository:${repo}:pull`);
        
        const authHeaders = {};
        if (config.registries.github.token) {
          authHeaders['Authorization'] = `Bearer ${config.registries.github.token}`;
        }
        
        const tokenResponse = await requestJson(authUrl, { headers: authHeaders });
        if (tokenResponse.statusCode === 200) {
          const registryToken = tokenResponse.body.token || tokenResponse.body.access_token;
          const retryResponse = await requestJson(manifestUrl, {
            headers: {
              'Accept': acceptHeader,
              'Authorization': `Bearer ${registryToken}`
            }
          });
          
          if (retryResponse.statusCode === 200) {
            return {
              digest: retryResponse.headers['docker-content-digest'] || null,
              created: retryResponse.headers['date'] || null,
              manifest: retryResponse.body
            };
          }
        }
      }
    }
    
    return { digest: null, created: null, manifest: null };
  } catch (error) {
    console.log(`Erreur récupération manifest pour ${repo}:${reference}:`, error.message);
    return { digest: null, created: null, manifest: null };
  }
}

// Fonction générique pour récupérer les tags d'un registry
async function getRegistryTags(registry, repo) {
  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');
  
  // Normaliser le registry pour Docker Hub
  if (registry === 'docker.io' || registry === 'registry-1.docker.io' || registry === '') {
    // Docker Hub v2 API
    const authUrl = new URL('https://auth.docker.io/token');
    authUrl.searchParams.set('service', 'registry.docker.io');
    authUrl.searchParams.set('scope', `repository:${repo}:pull`);

    const authorization = getDockerHubAuthToken();
    const tokenResponse = await requestJson(authUrl, {
      headers: authorization ? { Authorization: authorization } : {}
    });
    
    if (tokenResponse.statusCode !== 200) {
      throw new Error(`Authentification Docker Hub: HTTP ${tokenResponse.statusCode}`);
    }

    const registryToken = tokenResponse.body.token || tokenResponse.body.access_token;
    if (!registryToken) {
      throw new Error('Docker Hub n’a pas renvoyé de jeton de registre');
    }

    const tagsUrl = new URL(`https://registry-1.docker.io/v2/${encodedRepo}/tags/list?n=500`);
    const tagsResponse = await requestJson(tagsUrl, {
      headers: { Authorization: `Bearer ${registryToken}` }
    });
    
    if (tagsResponse.statusCode === 401) {
      throw new Error(
        `Docker Hub a refusé l’accès au dépôt "${repo}". Vérifiez le nom de l’image, ` +
        'la visibilité du dépôt et les droits du compte/token configuré.'
      );
    }
    if (tagsResponse.statusCode === 404) {
      throw new Error(`Repository ${repo} non trouvé sur Docker Hub`);
    }
    if (tagsResponse.statusCode !== 200) {
      throw new Error(`Docker Hub API erreur: HTTP ${tagsResponse.statusCode}`);
    }
    return tagsResponse.body.tags || [];
  }
  
  // GitHub Container Registry (ghcr.io)
  else if (registry === 'ghcr.io') {
    // GHCR nécessite une authentification via token endpoint (même pour les images publiques)
    const authUrl = new URL('https://ghcr.io/token');
    authUrl.searchParams.set('service', 'ghcr.io');
    authUrl.searchParams.set('scope', `repository:${repo}:pull`);
    
    // Essayer avec le token GitHub si disponible
    const authHeaders = {};
    if (config.registries.github.token) {
      authHeaders['Authorization'] = `Bearer ${config.registries.github.token}`;
    }
    
    let tokenResponse = await requestJson(authUrl, { headers: authHeaders });
    
    // Si 401 et pas de token, essayer anonymement (certains packages publics permettent ça)
    if (tokenResponse.statusCode === 401 && !config.registries.github.token) {
      tokenResponse = await requestJson(authUrl, { headers: {} });
    }
    
    if (tokenResponse.statusCode !== 200) {
      throw new Error(`Impossible d'obtenir un token d'authentification pour GHCR: HTTP ${tokenResponse.statusCode}. Configurez config.registries.github.token dans .env.`);
    }
    
    const registryToken = tokenResponse.body.token || tokenResponse.body.access_token;
    if (!registryToken) {
      throw new Error('GHCR n’a pas renvoyé de jeton de registre');
    }
    
    const tagsUrl = new URL(`https://${registry}/v2/${encodedRepo}/tags/list?n=500`);
    const tagsResponse = await requestJson(tagsUrl, {
      headers: { Authorization: `Bearer ${registryToken}` }
    });
    
    if (tagsResponse.statusCode === 404) {
      throw new Error(`Repository ${repo} non trouvé sur GHCR`);
    }
    if (tagsResponse.statusCode !== 200) {
      throw new Error(`GHCR API erreur: HTTP ${tagsResponse.statusCode}`);
    }
    return tagsResponse.body.tags || [];
  }
  
  // GitLab Container Registry
  else if (registry.includes('gitlab.com') || registry === 'registry.gitlab.com') {
    const tagsUrl = new URL(`https://${registry}/v2/${encodedRepo}/tags/list?n=500`);
    const headers = {};
    
    if (config.registries.gitlab.token) {
      headers['Authorization'] = `Bearer ${config.registries.gitlab.token}`;
    }
    
    const tagsResponse = await requestJson(tagsUrl, { headers });
    
    if (tagsResponse.statusCode === 401) {
      throw new Error('Authentification GitLab Registry refusée. Configurez config.registries.gitlab.token dans .env');
    }
    if (tagsResponse.statusCode === 404) {
      throw new Error(`Repository ${repo} non trouvé sur GitLab Registry`);
    }
    if (tagsResponse.statusCode !== 200) {
      throw new Error(`GitLab Registry API erreur: HTTP ${tagsResponse.statusCode}`);
    }
    return tagsResponse.body.tags || [];
  }
  
  // Quay.io
  else if (registry === 'quay.io') {
    // Quay.io utilise une API différente
    const tagsUrl = new URL(`https://${registry}/api/v1/repository/${encodedRepo}/tag/`);
    const headers = {};
    
    if (config.registries.quay.token) {
      headers['Authorization'] = `Bearer ${config.registries.quay.token}`;
    }
    
    const tagsResponse = await requestJson(tagsUrl, { headers });
    
    if (tagsResponse.statusCode === 401) {
      throw new Error('Authentification Quay.io refusée. Configurez config.registries.quay.token dans .env');
    }
    if (tagsResponse.statusCode === 404) {
      throw new Error(`Repository ${repo} non trouvé sur Quay.io`);
    }
    if (tagsResponse.statusCode !== 200) {
      throw new Error(`Quay.io API erreur: HTTP ${tagsResponse.statusCode}`);
    }
    // Quay.io retourne un tableau de tags directement
    return tagsResponse.body.tags || tagsResponse.body || [];
  }
  
  // Registries génériques (compatibles Docker Registry v2)
  else {
    const tagsUrl = new URL(`https://${registry}/v2/${encodedRepo}/tags/list?n=500`);
    let tagsResponse = await requestJson(tagsUrl, {});

    if (tagsResponse.statusCode === 401) {
      const registryToken = await getRegistryBearerToken(
        tagsResponse.headers['www-authenticate'],
        repo
      );
      if (registryToken) {
        tagsResponse = await requestJson(tagsUrl, {
          headers: { Authorization: `Bearer ${registryToken}` }
        });
      }
    }
    
    if (tagsResponse.statusCode === 401) {
      throw new Error(`Authentification refusée pour ${registry}. Configurez le token approprié.`);
    }
    if (tagsResponse.statusCode === 404) {
      throw new Error(`Repository ${repo} non trouvé sur ${registry}`);
    }
    if (tagsResponse.statusCode !== 200) {
      throw new Error(`${registry} API erreur: HTTP ${tagsResponse.statusCode}`);
    }
    return tagsResponse.body.tags || [];
  }
}

// Vérifier si une image a une mise à jour disponible
// Vérifier si une image a une mise à jour disponible
// Support des images avec tag ET avec digest
async function checkImageUpdate(imageName, currentTagOrDigest, containerImageId = null) {
  // Parse l'image pour extraire registry, repo, tag et digest
  const { registry, repo, tag, digest, hasDigest } = parseImageName(imageName);
  
  // Si l'image a un digest, on vérifie si le tag latest/main a un digest différent
  if (hasDigest) {
    const cacheKey = `${imageName}:${digest}`;
    
    const cached = tagCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }
    
    try {
      // Pour une image avec digest, on compare avec le tag latest ou main
      // Essayer d'abord avec 'latest', puis avec 'main'
      let latestManifestInfo = await getImageManifestInfo(registry, repo, 'latest');
      
      // Si latest ne fonctionne pas, essayer main
      if (!latestManifestInfo.digest) {
        latestManifestInfo = await getImageManifestInfo(registry, repo, 'main');
      }
      
      // Si on a un manifest pour latest/main, comparer les digests
      let hasUpdate = false;
      let latestDigest = null;
      
      if (latestManifestInfo.digest) {
        hasUpdate = latestManifestInfo.digest !== digest;
        latestDigest = latestManifestInfo.digest;
      } else {
        // Si on ne peut pas récupérer latest/main, on vérifie juste que le digest existe
        const manifestInfo = await getImageManifestInfo(registry, repo, digest);
        hasUpdate = false; // On ne peut pas déterminer
        latestDigest = manifestInfo.digest;
      }
      
      const result = {
        hasUpdate,
        currentTag: tag || digest,
        availableTags: [],
        newerVersions: [],
        registry,
        currentDigest: digest,
        latestDigest,
        manifestCreated: latestManifestInfo.created
      };
      
      if (!latestDigest) {
        result.error = 'Impossible de récupérer le manifest latest/main pour comparaison';
        result.hasUpdate = false;
      }
      
      tagCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.log(`Erreur vérification digest pour ${imageName}:`, error.message);
      const result = {
        hasUpdate: false,
        error: error.message,
        currentTag: tag || digest,
        availableTags: [],
        registry,
        currentDigest: digest
      };
      tagCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }
  }
  
  // Pour les images avec tag (comportement classique)
  const cacheKey = `${imageName}:${currentTagOrDigest}`;
  
  const cached = tagCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  
  try {
    const availableTags = await getRegistryTags(registry, repo);
    
    if (currentTagOrDigest === 'latest') {
      const result = { hasUpdate: false, currentTag: currentTagOrDigest, availableTags, registry };
      tagCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }
    
    // Filtrer les tags qui ressemblent à des versions (X.Y, X.Y.Z, vX.Y, vX.Y.Z)
    // Inclure aussi les tags numériques simples comme "4", "4.39"
    const versionTags = availableTags.filter(t => /^v?\d+(\.\d+)*$/.test(t));
    const currentVersion = currentTagOrDigest.replace(/^v/, '');
    const newerVersions = versionTags
      .map(t => t.replace(/^v/, ''))
      .filter(v => compareVersions(v, currentVersion) > 0);
    
    const hasUpdate = newerVersions.length > 0;
    
    const result = {
      hasUpdate,
      currentTag: currentTagOrDigest,
      availableTags,
      newerVersions: hasUpdate ? newerVersions : [],
      registry
    };
    
    tagCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
    
  } catch (error) {
    console.log(`Erreur vérification mise à jour pour ${imageName}:${currentTagOrDigest}:`, error.message);
    const result = {
      hasUpdate: false,
      error: error.message,
      currentTag: currentTagOrDigest,
      availableTags: [],
      registry
    };
    tagCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }
}

// Obtenir les services depuis Portainer
async function getServicesFromPortainer() {
  try {
    const endpoints = await portainerRequest('GET', 'endpoints');
    const endpointId = config.portainer.endpoint_id || (endpoints && endpoints[0]?.Id) || '1';
    let services = [];
    let tasks = [];
    let containers = [];

    try {
      services = await portainerRequest('GET', 'docker/services', null, endpointId);
    } catch (error) {
      console.log('Swarm non disponible via Portainer, récupération des conteneurs:', error.message);
    }
    let taskError = null;
    try {
      tasks = await portainerRequest('GET', 'docker/tasks', null, endpointId);
    } catch (error) {
      taskError = error.message;
      console.error('Impossible de récupérer les tâches Swarm via Portainer:', error.message);
    }
    try {
      containers = await portainerRequest('GET', 'docker/containers/json?all=1', null, endpointId);
    } catch (error) {
      console.error('Impossible de récupérer les conteneurs via Portainer:', error.message);
    }

    const containersById = new Map(
      containers.map(container => [container.Id, container])
    );
    const tasksByService = new Map();
    for (const task of tasks) {
      if (task.DesiredState && task.DesiredState !== 'running') {
        continue;
      }
      const serviceTasks = tasksByService.get(task.ServiceID) || [];
      const slot = task.Slot || task.NodeID || task.ID;
      const slotIndex = serviceTasks.findIndex(existing =>
        (existing.Slot || existing.NodeID || existing.ID) === slot
      );
      const existingTask = slotIndex === -1 ? null : serviceTasks[slotIndex];
      if (!existingTask || Date.parse(task.CreatedAt) > Date.parse(existingTask.CreatedAt)) {
        if (slotIndex === -1) {
          serviceTasks.push(task);
        } else {
          serviceTasks[slotIndex] = task;
        }
      }
      tasksByService.set(task.ServiceID, serviceTasks);
    }

    const swarmServiceIds = new Set(services.map(service => service.ID));
    const formattedServices = await Promise.all(services.map(async (service) => {
      const image = service.Spec?.TaskTemplate?.ContainerSpec?.Image || 'unknown';
      const imageId = service.Spec?.TaskTemplate?.ContainerSpec?.Image || 'unknown';
      const { tag } = parseImageName(image);
      let updateInfo = { hasUpdate: false, error: null };

      if (image !== 'unknown') {
        updateInfo = await checkImageUpdate(image, tag, imageId);
      }

      const serviceContainers = (tasksByService.get(service.ID) || []).map(task => {
        const containerId = task.Status?.ContainerStatus?.ContainerID;
        const container = containerId ? containersById.get(containerId) : null;
        const taskName = task.Name || `${service.Spec?.Name}.${task.Slot || ''}.${task.ID?.slice(0, 12)}`;
        const containerLabels = container?.Labels || {};

        return {
          id: containerId || task.ID,
          taskId: task.ID,
          name: container?.Names?.[0]?.replace(/^\//, '') || taskName,
          type: 'task',
          state: container?.State || task.Status?.State || 'unknown',
          status: container?.Status || task.Status?.Message || task.Status?.State || 'unknown',
          image: container?.Image || task.Spec?.ContainerSpec?.Image || image,
          imageId: container?.ImageID || imageId,
          created: container?.Created || task.CreatedAt || 'unknown',
          labels: containerLabels,
          hasUpdate: updateInfo.hasUpdate,
          updateInfo,
          updateError: updateInfo.error,
          source: 'portainer',
          canManageContainer: false
        };
      });
      const runningTasks = serviceContainers.filter(container =>
        container.state === 'running'
      ).length;
      const replicatedTasks = service.Spec?.Mode?.Replicated?.Replicas;
      const desiredTasks = Number.isInteger(replicatedTasks)
        ? replicatedTasks
        : serviceContainers.length;

      return {
        id: service.ID,
        name: service.Spec?.Name || service.ID,
        project: service.Spec?.Labels?.['com.docker.stack.namespace'] || null,
        service: service.Spec?.Name || service.ID,
        type: 'service',
        state: desiredTasks === 0
          ? 'suspended'
          : runningTasks === desiredTasks
            ? 'running'
            : 'degraded',
        status: `${runningTasks}/${desiredTasks} tâches en cours`,
        runningTasks,
        desiredTasks,
        image,
        images: image,
        imageId,
        created: service.CreatedAt || 'unknown',
        labels: service.Spec?.Labels || {},
        containers: serviceContainers,
        hasUpdate: updateInfo.hasUpdate,
        updateInfo,
        updateError: updateInfo.error,
        taskError: taskError ? `Impossible de charger les tâches Swarm : ${taskError}` : null,
        source: 'portainer',
        canUpdateViaPortainer: true,
        canUpdateViaDocker: false
      };
    }));

    const standaloneContainers = containers
      .filter(container => {
        const serviceId = container.Labels?.['com.docker.swarm.service.id'];
        return !serviceId || !swarmServiceIds.has(serviceId);
      })
      .map(container => ({
        id: container.Id,
        name: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
        type: 'container',
        state: container.State || 'unknown',
        status: container.Status || container.State || 'unknown',
        image: container.Image || 'unknown',
        imageId: container.ImageID || container.Image || 'unknown',
        created: container.Created || 'unknown',
        ports: container.Ports || [],
        labels: container.Labels || {},
        source: 'portainer',
        canUpdateViaPortainer: true,
        canUpdateViaDocker: false
      }));

    return [...formattedServices, ...standaloneContainers];
  } catch (error) {
    console.error('Erreur récupération via Portainer:', error.message);
    throw error;
  }
}

// Obtenir les services depuis Docker local
async function getServicesFromDocker() {
  if (!dockerConnected || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  try {
    const containers = await docker.listContainers({ all: true });
    
    const servicesWithUpdates = await Promise.all(
      containers.map(async (container) => {
        try {
          const inspect = await docker.getContainer(container.Id).inspect();
          const imageName = inspect.Config.Image;
          const imageId = inspect.Image;
          const { repo, tag } = parseImageName(imageName);
          
          let updateInfo = { hasUpdate: false, error: null };
          
          if (repo && repo !== 'unknown') {
            try {
              updateInfo = await checkImageUpdate(imageName, tag, imageId);
            } catch (err) {
              updateInfo = { hasUpdate: false, error: err.message };
            }
          }
          
          return {
            id: container.Id.substring(0, 12),
            name: container.Names ? container.Names[0].replace('/', '') : 'unknown',
            type: 'container',
            state: container.State,
            status: container.Status,
            image: imageName,
            imageId: inspect.Image,
            created: inspect.Created,
            ports: container.Ports || [],
            labels: inspect.Config.Labels || {},
            hasUpdate: updateInfo.hasUpdate,
            updateInfo,
            updateError: updateInfo.error,
            source: 'docker',
            // Méthodes de mise à jour disponibles
            canUpdateViaPortainer: false,
            canUpdateViaDocker: true
          };
        } catch (err) {
          return {
            id: container.Id.substring(0, 12),
            name: container.Names ? container.Names[0].replace('/', '') : 'unknown',
            type: 'container',
            state: container.State,
            status: container.Status,
            image: 'unknown',
            hasUpdate: false,
            error: err.message,
            source: 'docker',
            // Méthodes de mise à jour disponibles
            canUpdateViaPortainer: false,
            canUpdateViaDocker: true
          };
        }
      })
    );
    
    return servicesWithUpdates;
  } catch (error) {
    console.error('Erreur récupération via Docker:', error.message);
    throw error;
  }
}

// Obtenir les services (mode hybride)
async function getServices() {
  const sources = [];
  
  // Essayer Docker local en premier
  if (dockerConnected && docker) {
    try {
      const dockerServices = await getServicesFromDocker();
      sources.push(...dockerServices);
    } catch (dockerError) {
      console.log('Docker local non fonctionnel:', dockerError.message);
    }
  }
  
  // Essayer Portainer
  if (config.portainer.url && config.portainer.api_key) {
    try {
      const portainerServices = await getServicesFromPortainer();
      sources.push(...portainerServices);
    } catch (portainerError) {
      console.log('Portainer non fonctionnel:', portainerError.message);
    }
  }
  
  // Si aucune source n'a fonctionné
  if (sources.length === 0) {
    throw new Error('Aucune source de données disponible. Configurez Docker local ou Portainer.');
  }
  
  // Éliminer les doublons (par ID)
  const uniqueSources = [];
  const seenIds = new Set();
  
  for (const source of sources) {
    const sourceKind = source.type === 'service' ? 'service' : 'container';
    const uniqueId = `${sourceKind}:${source.id?.substring(0, 12)}`;
    if (!seenIds.has(uniqueId)) {
      seenIds.add(uniqueId);
      uniqueSources.push(source);
    }
  }
  
  // Regrouper les conteneurs par service (pour Docker Compose)
  const groupedServices = {};
  const standaloneContainers = [];
  
  for (const source of uniqueSources) {
    const serviceName = source.labels?.['com.docker.compose.service'];
    const projectName = source.labels?.['com.docker.compose.project'];
    
    if (serviceName && projectName) {
      // Ce conteneur fait partie d'un service Docker Compose
      if (!groupedServices[projectName]) {
        groupedServices[projectName] = {};
      }
      if (!groupedServices[projectName][serviceName]) {
        groupedServices[projectName][serviceName] = {
          id: `compose:${projectName}:${serviceName}`,
          name: serviceName,
          project: projectName,
          service: serviceName,
          type: 'service',
          containers: [],
          hasUpdate: false,
          canUpdateViaDocker: false,
          canUpdateViaPortainer: false
        };
      }
      groupedServices[projectName][serviceName].containers.push(source);
      const groupedService = groupedServices[projectName][serviceName];
      groupedService.hasUpdate ||= source.hasUpdate;
      groupedService.canUpdateViaDocker ||= source.canUpdateViaDocker;
      groupedService.canUpdateViaPortainer ||= source.canUpdateViaPortainer;
    } else {
      // Conteneur standalone
      standaloneContainers.push(source);
    }
  }
  
  // Convertir groupedServices en tableau
  const groupedList = [];
  for (const projectName of Object.keys(groupedServices).sort()) {
    for (const serviceName of Object.keys(groupedServices[projectName]).sort()) {
      const service = groupedServices[projectName][serviceName];
      service.containers.sort((a, b) => a.name.localeCompare(b.name));
      const runningContainers = service.containers.filter(container =>
        container.state?.toLowerCase() === 'running'
      ).length;
      service.state = runningContainers === service.containers.length
        ? 'running'
        : runningContainers === 0
          ? 'exited'
          : 'mixed';
      service.status = service.state;
      service.images = [...new Set(service.containers.map(container => container.image).filter(Boolean))].join(', ');
      service.source = [...new Set(service.containers.map(container => container.source))].join(', ');
      service.updateError = service.containers.find(container => container.updateError)?.updateError || null;
      groupedList.push(service);
    }
  }
  
  // Ajouter les conteneurs standalone
  standaloneContainers.sort((a, b) => a.name.localeCompare(b.name));
  groupedList.push(...standaloneContainers);
  
  // Trier par nom de service/projet
  groupedList.sort((a, b) => {
    const aName = a.service || a.name || '';
    const bName = b.service || b.name || '';
    return aName.localeCompare(bName);
  });
  
  return groupedList;
}

// Actions via Docker local
async function startContainerLocal(containerId) {
  if (!dockerConnected || !docker) {
    throw new Error('Docker local non disponible');
  }
  const container = docker.getContainer(containerId);
  await container.start();
  return { success: true, message: `Conteneur ${containerId} démarré` };
}

async function stopContainerLocal(containerId) {
  if (!dockerConnected || !docker) {
    throw new Error('Docker local non disponible');
  }
  const container = docker.getContainer(containerId);
  await container.stop();
  return { success: true, message: `Conteneur ${containerId} arrêté` };
}

async function updateContainerLocal(containerId) {
  if (!dockerConnected || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  const inspect = await container.inspect();
  const imageName = inspect.Config.Image;
  const { repo, tag } = parseImageName(imageName);
  
  const stream = await docker.pull(`${repo}:${tag}`);
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err, output) => err ? reject(err) : resolve(output));
  });
  
  await container.stop({ t: 10 });
  await container.start();
  
  return { success: true, message: `Conteneur ${containerId} mis à jour` };
}

// Actions via Portainer
async function startContainerPortainer(containerId, endpointId = config.portainer.endpoint_id) {
  try {
    await portainerRequest('POST', `docker/containers/${containerId}/start`, null, endpointId);
    return { success: true, message: `Conteneur ${containerId} démarré via Portainer` };
  } catch (error) {
    throw new Error(`Impossible de démarrer via Portainer: ${error.message}`);
  }
}

async function stopContainerPortainer(containerId, endpointId = config.portainer.endpoint_id) {
  try {
    await portainerRequest('POST', `docker/containers/${containerId}/stop`, null, endpointId);
    return { success: true, message: `Conteneur ${containerId} arrêté via Portainer` };
  } catch (error) {
    throw new Error(`Impossible d'arrêter via Portainer: ${error.message}`);
  }
}

async function updateContainerPortainer(containerId, endpointId = config.portainer.endpoint_id) {
  try {
    // Pour un conteneur : pull + restart
    const containerInfo = await portainerRequest('GET', `docker/containers/${containerId}/json`, null, endpointId);
    const imageName = containerInfo.Config.Image;
    const { repo, tag } = parseImageName(imageName);
    
    // Pull la nouvelle image
    await portainerRequest('POST', 'docker/images/create?fromImage=' + encodeURIComponent(imageName), null, endpointId);
    
    // Arrêter et démarrer
    await portainerRequest('POST', `docker/containers/${containerId}/stop`, null, endpointId);
    await portainerRequest('POST', `docker/containers/${containerId}/start`, null, endpointId);
    
    return { success: true, message: `Conteneur ${containerId} mis à jour via Portainer` };
  } catch (error) {
    throw new Error(`Impossible de mettre à jour via Portainer: ${error.message}`);
  }
}

async function updateServicePortainer(serviceId, endpointId = config.portainer.endpoint_id) {
  try {
    const service = await portainerRequest('GET', `docker/services/${serviceId}`, null, endpointId);
    const version = service.Version?.Index;
    if (!Number.isInteger(version) || !service.Spec?.TaskTemplate?.ContainerSpec?.Image) {
      throw new Error('La réponse Portainer ne contient pas la version et l’image du service');
    }

    const spec = service.Spec;
    spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate || 0) + 1;
    spec.TaskTemplate.ContainerSpec.Image =
      spec.TaskTemplate.ContainerSpec.Image.split('@')[0];
    await portainerRequest(
      'POST',
      `docker/services/${serviceId}/update?version=${version}&registryAuthFrom=spec`,
      spec,
      endpointId
    );
    
    return { success: true, message: `Service ${serviceId} mis à jour via Portainer` };
  } catch (error) {
    throw new Error(`Impossible de mettre à jour le service via Portainer: ${error.message}`);
  }
}

// Actions hybrides (essaie Docker local puis Portainer)
async function startContainer(containerId) {
  if (dockerConnected && docker) {
    try {
      return await startContainerLocal(containerId);
    } catch (dockerError) {
      console.log('Démarrage local échoué, essai avec Portainer:', dockerError.message);
    }
  }
  
  if (config.portainer.url && config.portainer.api_key) {
    return await startContainerPortainer(containerId);
  }
  
  throw new Error('Aucune méthode disponible pour démarrer le conteneur');
}

async function stopContainer(containerId) {
  if (dockerConnected && docker) {
    try {
      return await stopContainerLocal(containerId);
    } catch (dockerError) {
      console.log('Arrêt local échoué, essai avec Portainer:', dockerError.message);
    }
  }
  
  if (config.portainer.url && config.portainer.api_key) {
    return await stopContainerPortainer(containerId);
  }
  
  throw new Error('Aucune méthode disponible pour arrêter le conteneur');
}

async function updateContainer(containerId, service) {
  const isService = service?.type === 'service';
  
  if (dockerConnected && docker && !isService) {
    try {
      return await updateContainerLocal(containerId);
    } catch (dockerError) {
      console.log('Mise à jour locale échouée, essai avec Portainer:', dockerError.message);
    }
  }
  
  if (config.portainer.url && config.portainer.api_key) {
    if (isService) {
      return await updateServicePortainer(containerId);
    } else {
      return await updateContainerPortainer(containerId);
    }
  }
  
  throw new Error('Aucune méthode disponible pour mettre à jour');
}

// Formater la date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Endpoint: Santé
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dockerConnected: dockerConnected,
      portainerConfigured: !!(config.portainer.url && config.portainer.api_key),
      portainerUrl: config.portainer.url || null,
      dockerHubAuth: !!getDockerHubAuthToken(),
      dockerHubUsername: config.docker_hub.username ? '*****' : null
    };
    
    // Tester Docker si disponible
    if (dockerConnected && docker) {
      try {
        const ping = await docker.ping();
        health.dockerVersion = ping.version || 'unknown';
        health.dockerPing = true;
      } catch (dockerError) {
        health.dockerPing = false;
        health.dockerError = dockerError.message;
      }
    }
    
    // Tester Portainer si configuré
    if (config.portainer.url && config.portainer.api_key) {
      try {
        const endpoints = await portainerRequest('GET', 'endpoints');
        health.portainerEndpoints = endpoints?.length || 0;
        health.portainerPing = true;
      } catch (portainerError) {
        health.portainerPing = false;
        health.portainerError = portainerError.message;
      }
    }
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Endpoint: Configuration actuelle
app.get('/api/config', (req, res) => {
  res.json({
    dockerHub: {
      configured: !!getDockerHubAuthToken(),
      username: config.docker_hub.username ? '*****' : null
    },
    portainer: {
      configured: !!(config.portainer.url && config.portainer.api_key),
      url: config.portainer.url
    },
    docker: {
      connected: dockerConnected
    }
  });
});

// Endpoint: Liste des services/containers avec infos de mise à jour
app.get('/api/services', async (req, res) => {
  try {
    const services = await getServices();
    res.json(services);
  } catch (error) {
    console.error('Erreur /api/services:', error);
    res.status(500).json({ 
      error: error.message,
      hint: 'Configurez Docker local ou Portainer pour accéder aux services'
    });
  }
});

// Endpoint: Tester les notifications
app.post('/api/notifications/test', async (req, res) => {
  try {
    const { message, title } = req.body || {};
    const testMessage = message || '✅ Test de notification - Docker Services Updater fonctionne correctement !';
    const testTitle = title || 'Test Notification';
    
    const success = await sendNotification(testTitle, testMessage);
    
    res.json({
      success,
      message: success ? 'Notifications envoyées avec succès' : 'Aucune notification configurée ou échec de l\'envoi'
    });
  } catch (error) {
    console.error('Erreur test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Vérifier les mises à jour pour une image spécifique
app.get('/api/services/check-updates', async (req, res) => {
  try {
    const { image } = req.query;
    
    if (!image) {
      return res.status(400).json({ error: 'Paramètre image requis' });
    }
    
    const { repo, tag } = parseImageName(image);
    const updateInfo = await checkImageUpdate(image, tag);
    
    res.json({
      image,
      repo,
      tag,
      ...updateInfo
    });
  } catch (error) {
    console.error('Erreur /api/services/check-updates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Vérifier les mises à jour de tous les services et envoyer des notifications
app.get('/api/services/check-and-notify', async (req, res) => {
  try {
    const allServices = await getServices();
    const servicesWithUpdates = allServices.filter(s => s.hasUpdate);
    
    if (servicesWithUpdates.length === 0) {
      return res.json({
        success: true,
        message: 'Aucune mise à jour disponible',
        servicesChecked: allServices.length,
        servicesWithUpdates: 0
      });
    }
    
    // Envoyer une notification unique avec tous les services ayant des mises à jour
    const serviceNames = servicesWithUpdates.map(s => {
      if (s.type === 'service') {
        return `${s.project}/${s.service}`;
      }
      return s.name;
    });
    
    const message = `📦 ${serviceNames.length} mise(s) à jour disponible(s):\n\n` +
      serviceNames.map(name => `• ${name}`).join('\n');
    
    const success = await sendNotification('⬆️ Mises à jour disponibles', message);
    
    res.json({
      success,
      servicesChecked: allServices.length,
      servicesWithUpdates: servicesWithUpdates.length,
      notified: success,
      services: servicesWithUpdates.map(s => ({
        name: s.service || s.name,
        project: s.project
      }))
    });
  } catch (error) {
    console.error('Erreur check-and-notify:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Démarrer un conteneur (hybride)
app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const result = await startContainer(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Erreur démarrage conteneur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Arrêter un conteneur (hybride)
app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const result = await stopContainer(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Erreur arrêt conteneur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Redémarrer avec mise à jour (hybride)
app.post('/api/containers/:id/update', async (req, res) => {
  try {
    const service = services.find(s => s.id === req.params.id) || { type: 'container' };
    const result = await updateContainer(req.params.id, service);
    res.json(result);
  } catch (error) {
    console.error('Erreur mise à jour conteneur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Mettre à jour via Portainer (spécifique)
app.post('/api/portainer/services/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { endpointId } = req.body || {};
    const result = await updateServicePortainer(id, endpointId || config.portainer.endpoint_id);
    res.json(result);
  } catch (error) {
    console.error('Erreur mise à jour Portainer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Obtenir les endpoints Portainer
app.get('/api/portainer/endpoints', async (req, res) => {
  try {
    const endpoints = await portainerRequest('GET', 'endpoints');
    res.json({ success: true, endpoints });
  } catch (error) {
    console.error('Erreur endpoints Portainer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Obtenir les webhooks Portainer
app.get('/api/portainer/webhooks', async (req, res) => {
  try {
    const webhooks = await portainerRequest('GET', 'webhooks');
    res.json({ success: true, webhooks });
  } catch (error) {
    console.error('Erreur webhooks Portainer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Créer un webhook Portainer
app.post('/api/portainer/webhooks', async (req, res) => {
  try {
    const { serviceId, endpointId, webhookUrl, webhookName } = req.body;
    
    if (!serviceId || !webhookUrl) {
      return res.status(400).json({ error: 'serviceId et webhookUrl sont requis' });
    }
    
    const actualEndpointId = endpointId || config.portainer.endpoint_id;
    
    const webhookData = {
      Name: webhookName || `update-${serviceId}`,
      ResourceType: 'service',
      ResourceId: serviceId,
      URL: webhookUrl,
      Method: 'POST'
    };
    
    const result = await portainerRequest('POST', 'webhooks', webhookData, actualEndpointId);
    res.json({ success: true, webhook: result });
  } catch (error) {
    console.error('Erreur création webhook Portainer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Variable globale pour stocker les services (cache)
let servicesCache = [];
let servicesCacheTime = 0;

// Variable pour éviter les notifications trop fréquentes
let lastNotificationTime = 0;

// Endpoint: Obtenir les informations d'un conteneur
app.get('/api/containers/:id', async (req, res) => {
  try {
    // Essayer Docker local
    if (dockerConnected && docker) {
      try {
        const container = docker.getContainer(req.params.id);
        const inspect = await container.inspect();
        return res.json({
          id: container.id,
          name: inspect.Name.replace('/', ''),
          state: inspect.State,
          image: inspect.Config.Image,
          created: inspect.Created,
          ports: inspect.HostConfig.PortBindings || {},
          mounts: inspect.Mounts || [],
          source: 'docker'
        });
      } catch (dockerError) {
        console.log('Docker local non fonctionnel:', dockerError.message);
      }
    }
    
    // Essayer Portainer
    if (config.portainer.url && config.portainer.api_key) {
      try {
        const containerInfo = await portainerRequest('GET', `docker/containers/${req.params.id}/json`);
        return res.json({
          ...containerInfo,
          source: 'portainer'
        });
      } catch (portainerError) {
        console.log('Portainer non fonctionnel:', portainerError.message);
      }
    }
    
    res.status(404).json({ error: 'Conteneur non trouvé' });
  } catch (error) {
    console.error('Erreur info conteneur:', error);
    res.status(500).json({ error: error.message });
  }
});

const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
app.use(express.static(frontendBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API introuvable' });
  }
  if (!req.accepts('html')) {
    return next();
  }
  return res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Démarrer le serveur
try {
  initDocker();
  
  // Mettre à jour le cache des services régulièrement
  setInterval(async () => {
    try {
      const oldServices = servicesCache;
      servicesCache = await getServices();
      servicesCacheTime = Date.now();
      
      // Envoyer des notifications si des mises à jour sont détectées
      const servicesWithUpdates = servicesCache.filter(s => s.hasUpdate);
      const oldServicesWithUpdates = oldServices.filter(s => s.hasUpdate);
      
      // Si on a de nouvelles mises à jour et que le cooldown est passé
      if (servicesWithUpdates.length > 0 && 
          (oldServices.length === 0 || 
           servicesWithUpdates.length > oldServicesWithUpdates.length ||
           Date.now() - lastNotificationTime > config.settings.notification_cooldown)) {
        
        const serviceNames = servicesWithUpdates.map(s => {
          if (s.type === 'service') {
            return `${s.project}/${s.service}`;
          }
          return s.name;
        });
        
        const message = `📦 ${serviceNames.length} mise(s) à jour disponible(s):\n\n` +
          serviceNames.map(name => `• ${name}`).join('\n');
        
        await sendNotification('⬆️ Mises à jour disponibles', message);
        lastNotificationTime = Date.now();
      }
    } catch (error) {
      console.error('Erreur mise à jour cache services:', error.message);
    }
  }, config.settings.check_interval);
  
  // Charger la configuration des notifications
  // Charger la configuration
  loadConfig();

  app.listen(PORT, () => {
    console.log(`✓ Serveur démarré sur le port ${PORT}`);
    console.log(`  Accès à l'API: http://localhost:${PORT}/api/health`);
    console.log(`  Mode: ${dockerConnected ? 'Docker local + ' : ''}${config.portainer.url && config.portainer.api_key ? 'Portainer' : 'Docker local seul'}`);
    
    if (getDockerHubAuthToken()) {
      console.log(`  ✓ Authentification Docker Hub configurée`);
    } else {
      console.log(`  ⚠️  Authentification Docker Hub non configurée (100 req/6h limite)`);
    }
    
    if (config.portainer.url && config.portainer.api_key) {
      console.log(`  ✓ Intégration Portainer configurée`);
    }
    
    if (config.notifications.telegram.enabled) {
      console.log(`  ✓ Notifications Telegram configurées`);
    }
    if (config.notifications.gotify.enabled) {
      console.log(`  ✓ Notifications Gotify configurées`);
    }
    
    console.log(`  ⏰ Vérification des mises à jour: toutes les ${config.settings.check_interval / 1000 / 60} minutes`);
    console.log(`  ⏳ Cooldown des notifications: ${config.settings.notification_cooldown / 1000 / 60} minutes`);
  });
} catch (error) {
  console.error('✗ Erreur au démarrage:', error.message);
  process.exit(1);
}
