/**
 * Module Docker - Gestion des conteneurs via l'API Docker locale
 */

const Docker = require('dockerode');
const { getConfig } = require('../config/loader');

let docker = null;
let dockerConnected = false;

/**
 * Initialiser la connexion Docker
 */
function initDocker() {
  try {
    // Créer une nouvelle instance Dockerode
    docker = new Docker();
    
    // Tester la connexion
    docker.listContainers({ all: true }, (err) => {
      if (err) {
        console.log('⚠ Impossible de se connecter à Docker local:', err.message);
        dockerConnected = false;
      } else {
        dockerConnected = true;
        console.log('✓ Connecté au socket Docker');
      }
    });
    
    return docker;
  } catch (error) {
    console.log('⚠ Erreur initialisation Docker:', error.message);
    dockerConnected = false;
    return null;
  }
}

/**
 * Vérifie si Docker est connecté
 */
function isDockerConnected() {
  return dockerConnected && docker !== null;
}

/**
 * Obtenir l'instance Docker
 */
function getDocker() {
  return docker;
}

/**
 * Lister tous les conteneurs Docker
 */
async function listContainers() {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const containers = await docker.listContainers({ all: true });
  return containers;
}

/**
 * Obtenir les informations détaillées d'un conteneur
 */
async function inspectContainer(containerId) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  return await container.inspect();
}

/**
 * Démarrer un conteneur
 */
async function startContainer(containerId) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  await container.start();
  return { success: true, message: `Conteneur ${containerId} démarré` };
}

/**
 * Arrêter un conteneur
 */
async function stopContainer(containerId) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  await container.stop();
  return { success: true, message: `Conteneur ${containerId} arrêté` };
}

/**
 * Redémarrer un conteneur
 */
async function restartContainer(containerId) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  await container.restart();
  return { success: true, message: `Conteneur ${containerId} redémarré` };
}

/**
 * Mettre à jour un conteneur (pull latest image et redémarrer)
 */
async function updateContainer(containerId) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  const inspect = await container.inspect();
  const imageName = inspect.Config.Image;
  
  // Puller la dernière version de l'image
  await pullImage(imageName);
  
  // Redémarrer le conteneur avec la nouvelle image
  await container.stop();
  await container.start();
  
  return { success: true, message: `Conteneur ${containerId} mis à jour` };
}

/**
 * Puller une image Docker
 */
async function pullImage(imageName) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err, stream) => {
      if (err) {
        return reject(err);
      }
      
      docker.modem.followProgress(stream, (err, output) => {
        if (err) {
          return reject(err);
        }
        resolve(output);
      });
    });
  });
}

/**
 * Supprimer un conteneur
 */
async function removeContainer(containerId) {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const container = docker.getContainer(containerId);
  await container.remove({ force: true });
  return { success: true, message: `Conteneur ${containerId} supprimé` };
}

/**
 * Obtenir les conteneurs Docker avec leurs informations
 */
async function getDockerServices() {
  if (!isDockerConnected() || !docker) {
    throw new Error('Docker local non disponible');
  }
  
  const containers = await listContainers();
  const services = [];
  
  for (const containerInfo of containers) {
    try {
      const container = docker.getContainer(containerInfo.Id);
      const inspect = await container.inspect();
      const config = getConfig();
      
      const serviceInfo = {
        id: containerInfo.Id,
        name: containerInfo.Names ? containerInfo.Names[0].replace('/','') : containerInfo.Id.substring(0,12),
        type: 'container',
        state: containerInfo.State,
        status: containerInfo.Status,
        image: inspect.Config.Image,
        imageId: containerInfo.ImageID,
        created: inspect.Created,
        ports: inspect.NetworkSettings?.Ports || {},
        labels: inspect.Config?.Labels || {},
        hasUpdate: false,
        updateInfo: {},
        updateError: null,
        source: 'docker',
        canUpdateViaDocker: true,
        canUpdateViaPortainer: false
      };
      
      services.push(serviceInfo);
    } catch (error) {
      console.log(`Erreur traitement conteneur ${containerInfo.Id}:`, error.message);
    }
  }
  
  return services;
}

module.exports = {
  initDocker,
  isDockerConnected,
  getDocker,
  listContainers,
  inspectContainer,
  startContainer,
  stopContainer,
  restartContainer,
  updateContainer,
  pullImage,
  removeContainer,
  getDockerServices
};
