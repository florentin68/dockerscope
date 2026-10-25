/**
 * Module Portainer - Gestion des conteneurs via l'API Portainer
 */

const https = require('https');
const http = require('http');
const { getConfig } = require('../config/loader');

/**
 * Faire une requête à l'API Portainer
 */
async function portainerRequest(endpoint, method = 'GET', data = null) {
  const config = getConfig();
  
  if (!config.portainer.url || !config.portainer.api_key) {
    throw new Error('Configuration Portainer manquante: PORTAINER_URL et PORTAINER_API_KEY requis');
  }
  
  const endpointId = config.portainer.endpoint_id || 1;
  const url = new URL(`${config.portainer.url}/api/endpoints/${endpointId}${endpoint}`);
  
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.portainer.api_key
    }
  };
  
  return new Promise((resolve, reject) => {
    const protocol = url.protocol === 'https:' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          try {
            const errorData = JSON.parse(data);
            reject(new Error(errorData.message || errorData.detail || `Erreur ${res.statusCode}`));
          } catch (e) {
            reject(new Error(`Erreur Portainer: ${res.statusCode} - ${data}`));
          }
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Vérifier la connexion Portainer
 */
async function checkPortainerConnection() {
  try {
    const endpoints = await portainerRequest('/endpoints');
    return { connected: true, endpoints: endpoints.length };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Obtenir la liste de tous les conteneurs via Portainer
 */
async function getPortainerContainers() {
  try {
    const containers = await portainerRequest('/containers/json');
    return containers;
  } catch (error) {
    console.log('Erreur récupération conteneurs Portainer:', error.message);
    return [];
  }
}

/**
 * Obtenir les détails d'un conteneur via Portainer
 */
async function getPortainerContainerDetails(containerId) {
  try {
    const container = await portainerRequest(`/containers/${containerId}/json`);
    return container;
  } catch (error) {
    console.log(`Erreur détails conteneur ${containerId}:`, error.message);
    return null;
  }
}

/**
 * Démarrer un conteneur via Portainer
 */
async function startPortainerContainer(containerId) {
  try {
    await portainerRequest(`/containers/${containerId}/start`, 'POST');
    return { success: true, message: `Conteneur ${containerId} démarré via Portainer` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Arrêter un conteneur via Portainer
 */
async function stopPortainerContainer(containerId) {
  try {
    await portainerRequest(`/containers/${containerId}/stop`, 'POST');
    return { success: true, message: `Conteneur ${containerId} arrêté via Portainer` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Redémarrer un conteneur via Portainer
 */
async function restartPortainerContainer(containerId) {
  try {
    await portainerRequest(`/containers/${containerId}/restart`, 'POST');
    return { success: true, message: `Conteneur ${containerId} redémarré via Portainer` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Mettre à jour un conteneur via Portainer (recreate avec pull latest)
 */
async function updatePortainerContainer(containerId) {
  try {
    // Obtenir les détails du conteneur
    const container = await getPortainerContainerDetails(containerId);
    if (!container) {
      throw new Error('Conteneur non trouvé');
    }
    
    // Puller la nouvelle image
    await portainerRequest(`/containers/${containerId}/pull`, 'POST');
    
    // Recreer le conteneur avec la nouvelle image
    await portainerRequest(`/containers/${containerId}/recreate`, 'POST');
    
    return { success: true, message: `Conteneur ${containerId} mis à jour via Portainer` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtenir les informations des services/containers depuis Portainer
 */
async function getPortainerServices() {
  try {
    const containers = await getPortainerContainers();
    const services = [];
    const config = getConfig();
    
    for (const container of containers) {
      try {
        const details = await getPortainerContainerDetails(container.Id);
        
        const serviceInfo = {
          id: container.Id,
          name: container.Names ? container.Names[0].replace('/','') : container.Id.substring(0,12),
          type: 'container',
          state: container.State,
          status: container.Status,
          image: container.Image,
          imageId: container.ImageID,
          created: container.Created,
          ports: details?.NetworkSettings?.Ports || {},
          labels: details?.Config?.Labels || {},
          hasUpdate: false,
          updateInfo: {},
          updateError: null,
          source: 'portainer',
          canUpdateViaDocker: false,
          canUpdateViaPortainer: true
        };
        
        services.push(serviceInfo);
      } catch (error) {
        console.log(`Erreur traitement conteneur Portainer ${container.Id}:`, error.message);
      }
    }
    
    return services;
  } catch (error) {
    console.log('Erreur récupération services Portainer:', error.message);
    return [];
  }
}

/**
 * Mettre à jour un service via Portainer
 */
async function updatePortainerService(serviceId) {
  try {
    await portainerRequest(`/services/${serviceId}/update`, 'POST');
    return { success: true, message: `Service ${serviceId} mis à jour via Portainer` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtenir les endpoints Portainer
 */
async function getPortainerEndpoints() {
  try {
    const endpoints = await portainerRequest('/endpoints');
    return endpoints;
  } catch (error) {
    console.log('Erreur récupération endpoints Portainer:', error.message);
    return [];
  }
}

/**
 * Obtenir les stacks Portainer
 */
async function getPortainerStacks() {
  try {
    const stacks = await portainerRequest('/stacks');
    return stacks;
  } catch (error) {
    console.log('Erreur récupération stacks Portainer:', error.message);
    return [];
  }
}

module.exports = {
  portainerRequest,
  checkPortainerConnection,
  getPortainerContainers,
  getPortainerContainerDetails,
  startPortainerContainer,
  stopPortainerContainer,
  restartPortainerContainer,
  updatePortainerContainer,
  updatePortainerService,
  getPortainerServices,
  getPortainerEndpoints,
  getPortainerStacks
};
