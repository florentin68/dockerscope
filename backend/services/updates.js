/**
 * Module Updates - Vérification des mises à jour pour les images Docker
 */

const https = require('https');
const { getConfig } = require('../config/loader');

/**
 * Parser le nom d'une image Docker
 * Ex: ghcr.io/user/repo:tag -> { registry: 'ghcr.io', repo: 'user/repo', tag: 'tag' }
 */
function parseImageName(image) {
  if (!image) {
    return { registry: null, repo: null, tag: null };
  }
  
  let registry = 'docker.io';
  let repo = image;
  let tag = 'latest';
  
  // Extraire le registry s'il est présent
  const registryMatch = image.match(/^([^\/]+)\/([^\/]+\/.+)$/);
  if (registryMatch) {
    registry = registryMatch[1];
    repo = registryMatch[2];
  }
  
  // Extraire le tag
  const tagMatch = repo.match(/^(.+):([^:]+)$/);
  if (tagMatch) {
    repo = tagMatch[1];
    tag = tagMatch[2];
  }
  
  // Gérer les tags par défaut
  if (repo.includes('@sha256')) {
    // Image avec digest - immuable
    const parts = repo.split('@sha256:');
    repo = parts[0];
    tag = `sha256:${parts[1]}`;
  }
  
  return { registry, repo, tag };
}

/**
 * Obtenir les headers d'authentification pour un registry
 */
function getRegistryAuthHeaders(registry) {
  const config = getConfig();
  const authConfig = {
    'docker.io': {
      username: config.docker_hub.username,
      password: config.docker_hub.password || config.docker_hub.token
    },
    'ghcr.io': {
      username: 'token',
      password: config.registries.github.token
    },
    'gitlab.com': {
      username: 'gitlab-ci-token',
      password: config.registries.gitlab.token
    },
    'quay.io': {
      username: 'robot',
      password: config.registries.quay.token
    }
  };
  
  const registryConfig = authConfig[registry] || {};
  
  if (registryConfig.username && registryConfig.password) {
    const authString = Buffer.from(`${registryConfig.username}:${registryConfig.password}`).toString('base64');
    return { 'Authorization': `Basic ${authString}` };
  }
  
  return {};
}

/**
 * Récupérer le manifest d'une image depuis un registry
 */
async function fetchManifest(registry, repo, tag) {
  const headers = getRegistryAuthHeaders(registry);
  
  // API v2
  const url = new URL(`https://${registry}/v2/${repo}/manifests/${tag}`);
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'GET',
    headers: {
      ...headers,
      'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const manifest = JSON.parse(data);
            resolve(manifest);
          } catch (e) {
            reject(new Error('Invalid manifest format'));
          }
        } else if (res.statusCode === 401) {
          reject(new Error('Authentification refusée pour le registry'));
        } else {
          reject(new Error(`Erreur ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Récupérer les tags disponibles pour une image
 */
async function fetchImageTags(registry, repo) {
  const headers = getRegistryAuthHeaders(registry);
  
  const url = new URL(`https://${registry}/v2/${repo}/tags/list`);
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'GET',
    headers: headers
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const tagsData = JSON.parse(data);
            resolve(tagsData.tags || []);
          } catch (e) {
            reject(new Error('Invalid tags format'));
          }
        } else if (res.statusCode === 401) {
          reject(new Error('Authentification refusée pour le registry'));
        } else {
          reject(new Error(`Erreur ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Vérifier les mises à jour pour une image
 */
async function checkImageUpdate(image, currentTag) {
  const config = getConfig();
  const { registry, repo, tag: currentTagParsed } = parseImageName(image);
  
  // Si c'est une image avec digest (@sha256), elle est immuable - pas de vérification possible
  if (currentTagParsed && currentTagParsed.startsWith('sha256:')) {
    return {
      hasUpdate: false,
      error: 'Image avec digest - immuable, pas de vérification possible',
      currentTag: currentTagParsed,
      availableTags: [],
      newerVersions: [],
      registry: registry
    };
  }
  
  try {
    // Obtenir les tags disponibles
    const availableTags = await fetchImageTags(registry, repo);
    
    if (!availableTags || availableTags.length === 0) {
      return {
        hasUpdate: false,
        error: 'Aucun tag disponible trouvé',
        currentTag: currentTagParsed,
        availableTags: [],
        newerVersions: [],
        registry: registry
      };
    }
    
    // Filtrer les tags valides (semver-like ou timestamps)
    const validTags = availableTags.filter(tag => {
      // Exclure les tags avec des caractères spéciaux (sauf . - _)
      return /^[a-zA-Z0-9\.\-_]+$/.test(tag);
    });
    
    if (validTags.length === 0) {
      return {
        hasUpdate: false,
        error: 'Aucun tag valide trouvé',
        currentTag: currentTagParsed,
        availableTags: validTags,
        newerVersions: [],
        registry: registry
      };
    }
    
    // Si le currentTag est 'latest', vérifier s'il y a des mises à jour
    if (currentTagParsed === 'latest' || !currentTagParsed) {
      // Pour 'latest', on ne peut pas vraiment vérifier - on suppose que c'est toujours à jour
      return {
        hasUpdate: false,
        currentTag: 'latest',
        availableTags: validTags,
        newerVersions: [],
        registry: registry
      };
    }
    
    // Comparaison simple: vérifier si le currentTag existe dans les tags disponibles
    // et s'il y a des tags plus récents (par ordre alphabétique pour simplifier)
    const sortedTags = validTags.sort();
    const currentIndex = sortedTags.indexOf(currentTagParsed);
    
    if (currentIndex === -1) {
      // Le tag actuel n'existe pas - peut-être qu'il a été supprimé
      return {
        hasUpdate: true,
        currentTag: currentTagParsed,
        availableTags: sortedTags,
        newerVersions: sortedTags,
        registry: registry
      };
    }
    
    const newerVersions = sortedTags.slice(currentIndex + 1);
    
    return {
      hasUpdate: newerVersions.length > 0,
      currentTag: currentTagParsed,
      availableTags: sortedTags,
      newerVersions: newerVersions,
      registry: registry
    };
  } catch (error) {
    return {
      hasUpdate: false,
      error: error.message,
      currentTag: currentTagParsed,
      availableTags: [],
      newerVersions: [],
      registry: registry
    };
  }
}

/**
 * Vérifier les mises à jour pour tous les conteneurs
 */
async function checkAllUpdates(containers) {
  const results = [];
  
  for (const container of containers) {
    const updateInfo = await checkImageUpdate(container.image, null);
    results.push({
      containerId: container.id,
      image: container.image,
      updateInfo
    });
  }
  
  return results;
}

module.exports = {
  parseImageName,
  getRegistryAuthHeaders,
  fetchManifest,
  fetchImageTags,
  checkImageUpdate,
  checkAllUpdates
};
