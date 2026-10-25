import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  Tabs,
  Tab,
  Paper,
  Divider,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  Save as SaveIcon,
  Close as CloseIcon,
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const SettingsModal = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState({
    dockerHub: { username: '', password: '', token: '', configured: false },
    portainer: { url: '', apiKey: '', configured: false }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Récupérer la configuration actuelle
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE}/config`);
        setConfig({
          dockerHub: {
            username: response.data.dockerHub.username || '',
            password: '',
            token: '',
            configured: response.data.dockerHub.configured || false
          },
          portainer: {
            url: response.data.portainer.url || '',
            apiKey: '',
            configured: response.data.portainer.configured || false
          }
        });
      } catch (err) {
        console.error('Erreur récupération config:', err);
        setError('Impossible de récupérer la configuration');
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchConfig();
    }
  }, [open]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setError(null);
    setSuccess(null);
  };

  const handleDockerHubSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Note: Dans une vraie application, on envoie au backend pour sauvegarder dans les variables d'environnement
      // Ici, on affiche juste un message car les variables d'environnement doivent être configurées au démarrage
      setSuccess(
        'Pour activer l\'authentification Docker Hub, redémarrez l\'application avec les variables d\'environnement: ' +
        'DOCKERHUB_USERNAME=' + (config.dockerHub.username || '<votre_username>') +
        (config.dockerHub.token ? ' ou DOCKERHUB_TOKEN=<votre_token>' : '')
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePortainerSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Vérifier la connexion à Portainer
      if (config.portainer.url && config.portainer.apiKey) {
        try {
          const endpointsResponse = await axios.get(`${API_BASE}/portainer/endpoints`);
          if (endpointsResponse.data.success) {
            setSuccess(
              'Pour activer l\'intégration Portainer, redémarrez l\'application avec les variables d\'environnement: ' +
              'PORTAINER_URL=' + config.portainer.url +
              ', PORTAINER_API_KEY=' + (config.portainer.apiKey ? '*****' : '<votre_api_key>')
            );
          }
        } catch (testError) {
          setError('Impossible de se connecter à Portainer. Vérifiez l\'URL et la clé API.');
        }
      } else {
        setError('Veuillez fournir l\'URL et la clé API de Portainer');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <SettingsIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Configuration
      </DialogTitle>
      
      {error && (
        <Alert severity="error" sx={{ mx: 2, mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mx: 2, mt: 1 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <DialogContent dividers>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <Typography>Chargement de la configuration...</Typography>
          </Box>
        ) : (
          <>
            <Tabs value={activeTab} onChange={handleTabChange}>
              <Tab label="Docker Hub" />
              <Tab label="Portainer" />
            </Tabs>
            
            <Box sx={{ mt: 2 }}>
              {activeTab === 0 && (
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Authentification Docker Hub
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Configurez l'authentification Docker Hub pour éviter les limites de rate (100 requêtes/6h pour les utilisateurs non authentifiés).
                  </Typography>
                  
                  <form onSubmit={handleDockerHubSubmit}>
                    <TextField
                      fullWidth
                      label="Nom d'utilisateur Docker Hub"
                      variant="outlined"
                      value={config.dockerHub.username}
                      onChange={(e) => setConfig({
                        ...config,
                        dockerHub: { ...config.dockerHub, username: e.target.value }
                      })}
                      margin="normal"
                      helperText="Votre nom d'utilisateur Docker Hub"
                    />
                    
                    <TextField
                      fullWidth
                      label="Token Docker Hub (optionnel)"
                      variant="outlined"
                      value={config.dockerHub.token}
                      onChange={(e) => setConfig({
                        ...config,
                        dockerHub: { ...config.dockerHub, token: e.target.value }
                      })}
                      margin="normal"
                      type={showPassword ? 'text' : 'password'}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                            >
                              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                      helperText="Token d'accès personnel Docker Hub (alternative au mot de passe)"
                    />
                    
                    <TextField
                      fullWidth
                      label="Mot de passe (optionnel)"
                      variant="outlined"
                      value={config.dockerHub.password}
                      onChange={(e) => setConfig({
                        ...config,
                        dockerHub: { ...config.dockerHub, password: e.target.value }
                      })}
                      margin="normal"
                      type="password"
                      helperText="Mot de passe Docker Hub (utilisé si aucun token n'est fourni)"
                    />
                  </form>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Box display="flex" alignItems="center" gap={1}>
                    {config.dockerHub.configured ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <ErrorIcon color="warning" />
                    )}
                    <Typography variant="body2">
                      {config.dockerHub.configured 
                        ? 'Authentification Docker Hub configurée'
                        : 'Authentification Docker Hub non configurée'}
                    </Typography>
                  </Box>
                </Paper>
              )}
              
              {activeTab === 1 && (
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Intégration Portainer
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Configurez l'intégration avec Portainer pour gérer les mises à jour des services via l'API Portainer.
                  </Typography>
                  
                  <form onSubmit={handlePortainerSubmit}>
                    <TextField
                      fullWidth
                      label="URL de Portainer"
                      variant="outlined"
                      value={config.portainer.url}
                      onChange={(e) => setConfig({
                        ...config,
                        portainer: { ...config.portainer, url: e.target.value }
                      })}
                      margin="normal"
                      placeholder="https://portainer.votre-domaine.com"
                      helperText="URL de votre instance Portainer"
                    />
                    
                    <TextField
                      fullWidth
                      label="Clé API Portainer"
                      variant="outlined"
                      value={config.portainer.apiKey}
                      onChange={(e) => setConfig({
                        ...config,
                        portainer: { ...config.portainer, apiKey: e.target.value }
                      })}
                      margin="normal"
                      type={showApiKey ? 'text' : 'password'}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowApiKey(!showApiKey)}
                              edge="end"
                            >
                              {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                      helperText="Clé API pour accéder à l'API Portainer"
                    />
                  </form>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Box display="flex" alignItems="center" gap={1}>
                    {config.portainer.configured ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <ErrorIcon color="warning" />
                    )}
                    <Typography variant="body2">
                      {config.portainer.configured 
                        ? 'Intégration Portainer configurée'
                        : 'Intégration Portainer non configurée'}
                    </Typography>
                  </Box>
                  
                  {config.portainer.configured && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        Une fois configuré, vous pourrez:
                      </Typography>
                      <Typography variant="body2" component="li">
                        - Mettre à jour les services directement via Portainer
                      </Typography>
                      <Typography variant="body2" component="li">
                        - Configurer des webhooks pour les mises à jour automatiques
                      </Typography>
                    </Box>
                  )}
                </Paper>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose} startIcon={<CloseIcon />}>
          Fermer
        </Button>
        <Button 
          onClick={activeTab === 0 ? handleDockerHubSubmit : handlePortainerSubmit}
          startIcon={<SaveIcon />}
          variant="contained"
          disabled={saving}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsModal;
