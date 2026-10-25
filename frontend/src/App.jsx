import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Collapse
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  SystemUpdate as SystemUpdateIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Link as LinkIcon,
  Sync as SyncIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Cloud as CloudIcon,
  Dns as DnsIcon
} from '@mui/icons-material';
import SettingsModal from './components/SettingsModal.jsx';
import DockScopeLogo from './components/DockScopeLogo.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const App = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updateFilter, setUpdateFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [config, setConfig] = useState({
    dockerHubConfigured: false,
    portainerConfigured: false,
    portainerUrl: null,
    dockerConnected: false
  });
  const [health, setHealth] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [expandedServices, setExpandedServices] = useState({});

  // Récupérer la configuration et la santé
  const fetchStatus = useCallback(async () => {
    try {
      const [configResponse, healthResponse] = await Promise.allSettled([
        axios.get(`${API_BASE}/config`),
        axios.get(`${API_BASE}/health`)
      ]);
      
      setConfig({
        dockerHubConfigured: configResponse.status === 'fulfilled' ? 
          configResponse.value.data.dockerHub.configured : false,
        portainerConfigured: configResponse.status === 'fulfilled' ? 
          configResponse.value.data.portainer.configured : false,
        portainerUrl: configResponse.status === 'fulfilled' ? 
          configResponse.value.data.portainer.url : null,
        dockerConnected: configResponse.status === 'fulfilled' ? 
          configResponse.value.data.docker.connected : false
      });
      
      setHealth(healthResponse.status === 'fulfilled' ? healthResponse.value.data : null);
    } catch (err) {
      console.error('Erreur récupération status:', err);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_BASE}/services`);
      setServices(response.data);
      
      // Mettre à jour le statut
      await fetchStatus();
    } catch (err) {
      console.error('Erreur lors de la récupération des services:', err);
      if (err.response && err.response.data && err.response.data.hint) {
        setError(`${err.response.data.error || err.message} - ${err.response.data.hint}`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    fetchServices();
    fetchStatus();
    
    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(() => {
      fetchServices();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchServices, fetchStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchServices();
  };

  const handleStartContainer = async (containerId, source) => {
    try {
      if (source === 'portainer') {
        await axios.post(`${API_BASE}/portainer/containers/${containerId}/start`);
      } else {
        await axios.post(`${API_BASE}/containers/${containerId}/start`);
      }
      fetchServices();
    } catch (err) {
      setError(`Erreur lors du démarrage: ${err.message}`);
    }
  };

  const handleStopContainer = async (containerId, source) => {
    try {
      if (source === 'portainer') {
        await axios.post(`${API_BASE}/portainer/containers/${containerId}/stop`);
      } else {
        await axios.post(`${API_BASE}/containers/${containerId}/stop`);
      }
      fetchServices();
    } catch (err) {
      setError(`Erreur lors de l'arrêt: ${err.message}`);
    }
  };

  const handleUpdateContainer = async (container) => {
    if (window.confirm(`Êtes-vous sûr de vouloir mettre à jour ${container.name || container.id.substring(0, 12)} ?`)) {
      try {
        if (container.type === 'service' && container.source === 'portainer' && config.portainerConfigured) {
          await axios.post(`${API_BASE}/portainer/services/${container.id}/update`);
        } else if (container.source === 'portainer' && config.portainerConfigured) {
          await axios.post(`${API_BASE}/portainer/containers/${container.id}/update`);
        } else {
          await axios.post(`${API_BASE}/containers/${container.id}/update`);
        }
        fetchServices();
      } catch (err) {
        setError(`Erreur lors de la mise à jour: ${err.message}`);
      }
    }
  };

  const getStatusColor = (state) => {
    if (!state) return 'default';
    const stateLower = state.toLowerCase();
    if (stateLower.includes('running') || stateLower === 'running') {
      return 'success';
    } else if (stateLower.includes('exited') || stateLower === 'exited') {
      return 'error';
    } else if (stateLower.includes('paused') || stateLower === 'paused') {
      return 'warning';
    } else if (stateLower.includes('created') || stateLower === 'created') {
      return 'info';
    }
    return 'default';
  };

  const getStatusText = (item) => {
    if (item.type === 'service' && item.status) {
      return item.status;
    }
    if (item.containers && item.containers.length > 0) {
      // Pour un service avec conteneurs, retourner le statut global
      const statuses = item.containers.map(c => getStatusText(c));
      if (statuses.every(s => s.toLowerCase().includes('running'))) {
        return 'Running';
      } else if (statuses.some(s => s.toLowerCase().includes('running'))) {
        return 'Partial';
      }
      return statuses[0] || 'Unknown';
    }
    return item.state || item.status || 'Unknown';
  };

  const getStatusIcon = (state) => {
    if (!state) return null;
    const stateLower = state.toLowerCase();
    if (stateLower.includes('running') || stateLower === 'running' || stateLower === 'partial') {
      return <CheckCircleIcon fontSize="small" />;
    } else if (stateLower.includes('exited') || stateLower === 'exited') {
      return <StopIcon fontSize="small" />;
    } else if (stateLower.includes('paused') || stateLower === 'paused') {
      return <WarningIcon fontSize="small" />;
    }
    return <ErrorIcon fontSize="small" />;
  };

  const formatImageName = (image) => {
    if (!image) return 'N/A';
    if (image.length > 40) {
      return `${image.substring(0, 20)}...${image.substring(image.length - 15)}`;
    }
    return image;
  };

  // Helper pour obtenir les informations d'un conteneur/service
  const getItemInfo = (item) => {
    if (item.type === 'service' || (item.containers && item.containers.length > 0)) {
      return {
        id: item.id || `${item.project}-${item.service}`,
        name: item.service || item.name,
        type: item.type || 'service',
        source: item.source,
        hasUpdate: item.hasUpdate,
        canUpdateViaDocker: item.canUpdateViaDocker,
        canUpdateViaPortainer: item.canUpdateViaPortainer,
        containers: item.containers || [],
        project: item.project,
        service: item.service,
        updateError: item.updateError,
        taskError: item.taskError,
        runningTasks: item.runningTasks,
        desiredTasks: item.desiredTasks,
        status: getStatusText(item),
        images: item.images || item.image || item.containers?.map(c => c.image).join(', ')
      };
    }
    // Conteneur standalone
    return {
      id: item.id,
      name: item.name,
      type: item.type || 'container',
      source: item.source,
      hasUpdate: item.hasUpdate,
      canUpdateViaDocker: item.canUpdateViaDocker,
      canUpdateViaPortainer: item.canUpdateViaPortainer,
      containers: [],
      status: getStatusText(item),
      images: item.image
    };
  };

  const filteredServices = services.map(getItemInfo).filter((service) => {
    const nameMatch = service.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      service.images?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      service.containers.some(container =>
                        container.name?.toLowerCase().includes(searchTerm.toLowerCase())
                      );
    
    const status = service.status.toLowerCase();
    const statusMatch = statusFilter === 'all' || 
                        (statusFilter === 'running' && (status.includes('running') || status === 'running' || status === 'partial')) ||
                        (statusFilter === 'exited' && (status.includes('exited') || status === 'exited')) ||
                        (statusFilter === 'paused' && (status.includes('paused') || status === 'paused')) ||
                        (statusFilter === 'created' && (status.includes('created') || status === 'created')) ||
                        service.containers.some(container =>
                          getStatusText(container).toLowerCase().includes(statusFilter)
                        );
    
    const updateStatus = service.hasUpdate === true ? 'update-available' : 'up-to-date';
    const updateMatch = updateFilter === 'all' || updateStatus === updateFilter;
    
    return nameMatch && statusMatch && updateMatch;
  });

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Compter les services par source
  const normalizedServices = services.map(getItemInfo);
  const dockerSourceCount = normalizedServices.filter(s => s.source === 'docker').length;
  const portainerSourceCount = normalizedServices.filter(s => s.source === 'portainer').length;
  const servicesWithUpdatesAndRunningTasks = normalizedServices.filter(service =>
    service.type === 'service' &&
    service.hasUpdate === true &&
    (Number.isInteger(service.runningTasks)
      ? service.runningTasks > 0
      : service.containers.some(container => container.state?.toLowerCase() === 'running'))
  ).length;

  if (loading && services.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, margin: 'auto' }}>
      <Box sx={{ mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={1}>
          <DockScopeLogo size={64} />
          <Box>
            <Typography variant="h3" component="h1">
              DockScope
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Surveillez vos services Docker et repérez les mises à jour disponibles
            </Typography>
          </Box>
        </Box>
        
        {/* Badges de configuration */}
        <Box display="flex" gap={1} mt={2} flexWrap="wrap">
          {health?.dockerPing ? (
            <Chip
              label={`Docker local ✓ (${dockerSourceCount} services)`}
              color="success"
              size="small"
              icon={<DnsIcon fontSize="small" />}
            />
          ) : (
            <Chip
              label="Docker local indisponible"
              color="warning"
              size="small"
              icon={<DnsIcon fontSize="small" />}
              onClick={() => setSettingsOpen(true)}
              sx={{ cursor: 'pointer' }}
            />
          )}
          
          {health?.portainerPing ? (
            <Chip
              label={`Portainer ✓ (${portainerSourceCount} services)`}
              color="success"
              size="small"
              icon={<CloudIcon fontSize="small" />}
            />
          ) : (
            <Chip
              label="Portainer indisponible"
              color="warning"
              size="small"
              icon={<CloudIcon fontSize="small" />}
              onClick={() => setSettingsOpen(true)}
              sx={{ cursor: 'pointer' }}
            />
          )}
          
          {config.dockerHubConfigured ? (
            <Tooltip title="Identifiants configurés. L’accès est vérifié séparément pour chaque dépôt ; les images locales ou privées peuvent être inaccessibles.">
              <Chip
                label="Docker Hub configuré"
                color="info"
                size="small"
                icon={<CheckCircleIcon fontSize="small" />}
              />
            </Tooltip>
          ) : (
            <Chip
              label="Docker Hub non configuré"
              color="warning"
              size="small"
              icon={<WarningIcon fontSize="small" />}
              onClick={() => setSettingsOpen(true)}
              sx={{ cursor: 'pointer' }}
            />
          )}
          
          {config.portainerConfigured && config.portainerUrl && (
            <Chip
              label={`Portainer: ${new URL(config.portainerUrl).hostname}`}
              color="primary"
              size="small"
              component="a"
              href={config.portainerUrl}
              target="_blank"
              rel="noopener noreferrer"
              clickable
              icon={<LinkIcon fontSize="small" />}
            />
          )}

          <Tooltip title="Services avec une mise à jour disponible et au moins une tâche en cours d’exécution.">
            <Chip
              label={`${servicesWithUpdatesAndRunningTasks} service${servicesWithUpdatesAndRunningTasks === 1 ? '' : 's'} à mettre à jour avec tâche active`}
              color={servicesWithUpdatesAndRunningTasks > 0 ? 'warning' : 'success'}
              size="small"
              icon={<SystemUpdateIcon fontSize="small" />}
            />
          </Tooltip>
          
          {services.length > 0 && (
            <Chip
              label={`Total: ${services.length} services`}
              color="info"
              size="small"
            />
          )}
          
          <Chip
            label={sourceDetailsOpen ? 'Masquer détails' : 'Détails sources'}
            size="small"
            onClick={() => setSourceDetailsOpen(!sourceDetailsOpen)}
            icon={sourceDetailsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ cursor: 'pointer' }}
          />
        </Box>
        
        <Collapse in={sourceDetailsOpen}>
          <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {health?.dockerPing && health?.portainerPing
                ? 'L\'application utilise Docker local ET Portainer pour une gestion optimale.'
                : health?.dockerPing
                  ? 'L\'application utilise Docker local pour lister vos services.'
                  : health?.portainerPing
                    ? 'L\'application utilise Portainer pour lister vos services.'
                    : '⚠️ Aucune source de données n’est actuellement joignable.'
              }
              {health?.dockerError && (
                <Typography variant="body2" color="error">
                  <br />Erreur Docker: {health.dockerError}
                </Typography>
              )}
              {health?.portainerError && (
                <Typography variant="body2" color="error">
                  <br />Erreur Portainer: {health.portainerError}
                </Typography>
              )}
            </Typography>
          </Box>
        </Collapse>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {services.length === 0 && !loading && !error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Aucune source n’a renvoyé de conteneur.
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardHeader
          title="Filtres et Contrôles"
          action={
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={refreshing || loading}
              >
                {refreshing ? <CircularProgress size={20} /> : 'Rafraîchir'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<SettingsIcon />}
                onClick={() => setSettingsOpen(true)}
              >
                Configuration
              </Button>
            </Box>
          }
        />
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Rechercher (nom ou image)"
                variant="outlined"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={statusFilter}
                  label="Statut"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">Tous les statuts</MenuItem>
                  <MenuItem value="running">En cours d'exécution</MenuItem>
                  <MenuItem value="exited">Arrêté</MenuItem>
                  <MenuItem value="paused">En pause</MenuItem>
                  <MenuItem value="created">Créé</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Mises à jour</InputLabel>
                <Select
                  value={updateFilter}
                  label="Mises à jour"
                  onChange={(e) => setUpdateFilter(e.target.value)}
                >
                  <MenuItem value="all">Tous</MenuItem>
                  <MenuItem value="update-available">⚠️ Mises à jour disponibles</MenuItem>
                  <MenuItem value="up-to-date">✅ À jour</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {services.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Services ({filteredServices.length} / {services.length})
          </Typography>

          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nom / Service</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Image(s)</TableCell>
                  <TableCell>Mise à jour</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredServices
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((service) => {
                    const hasContainers = service.containers && service.containers.length > 0;
                    const hasDetails = hasContainers || service.type === 'service' || service.taskError;
                    const serviceKey = `${service.id}-${service.source}`;
                    
                    return (
                      <React.Fragment key={serviceKey}>
                      <TableRow hover>
                        <TableCell>
                          <Tooltip title={service.name}>
                            <Typography variant="body1" fontWeight="bold" noWrap>
                              {service.name}
                            </Typography>
                          </Tooltip>
                          {hasDetails && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              {hasContainers && (
                                <Chip
                                  label={`${service.containers.length} conteneur${service.containers.length > 1 ? 's' : ''}`}
                                  size="small"
                                  color="info"
                                  sx={{ mt: 0.5 }}
                                />
                              )}
                              <Button
                                size="small"
                                onClick={() => setExpandedServices(current => ({
                                  ...current,
                                  [serviceKey]: !current[serviceKey]
                                }))}
                                endIcon={expandedServices[serviceKey] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                              >
                                {expandedServices[serviceKey] ? 'Masquer' : 'Détails'}
                              </Button>
                            </Box>
                          )}
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {service.id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={service.type === 'service' ? 'Service' : 'Conteneur'}
                            size="small"
                            color={service.type === 'service' ? 'primary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={service.source === 'docker' ? 'Local' : service.source === 'portainer' ? 'Portainer' : 'Mixte'}
                            size="small"
                            color={service.source === 'docker' ? 'primary' : service.source === 'portainer' ? 'secondary' : 'default'}
                            icon={service.source === 'docker' ? <DnsIcon fontSize="small" /> : <CloudIcon fontSize="small" />}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={service.status}
                            size="small"
                            color={Number.isInteger(service.runningTasks) && Number.isInteger(service.desiredTasks)
                              ? service.desiredTasks === 0
                                ? 'default'
                                : service.runningTasks === service.desiredTasks
                                  ? 'success'
                                  : 'error'
                              : getStatusColor(service.status)}
                            icon={getStatusIcon(service.status)}
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title={service.images || 'N/A'}>
                            <Typography noWrap sx={{ maxWidth: 200 }}>
                              {formatImageName(service.images)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {service.hasUpdate === true ? (
                            <Chip
                              label="Mise à jour disponible"
                              color="error"
                              size="small"
                              icon={<SystemUpdateIcon fontSize="small" />}
                            />
                          ) : service.hasUpdate === false ? (
                            <Chip
                              label="À jour"
                              color="success"
                              size="small"
                              icon={<CheckCircleIcon fontSize="small" />}
                            />
                          ) : (
                            <Chip
                              label="Inconnu"
                              color="default"
                              size="small"
                            />
                          )}
                          {service.updateError && (
                            <Tooltip title={service.updateError}>
                              <ErrorIcon color="error" fontSize="small" sx={{ ml: 1 }} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={1}>
                            {hasContainers && service.containers.some(c => getStatusText(c).toLowerCase().includes('exited')) && (
                              <Tooltip title="Démarrer tous">
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => service.containers.forEach(c => handleStartContainer(c.id, c.source))}
                                >
                                  <PlayArrowIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {hasContainers && service.containers.some(c => getStatusText(c).toLowerCase().includes('running')) && (
                              <Tooltip title="Arrêter tous">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => service.containers.forEach(c => handleStopContainer(c.id, c.source))}
                                >
                                  <StopIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {service.hasUpdate === true && service.type === 'service' && service.source === 'portainer' && (
                              <Tooltip title="Mettre à jour le service Swarm via Portainer">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => handleUpdateContainer(service)}
                                >
                                  <SystemUpdateIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {service.type !== 'service' && service.hasUpdate === true && service.canUpdateViaDocker && !service.canUpdateViaPortainer && (
                              <Tooltip title="Mettre à jour (Docker local)">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleUpdateContainer(hasContainers ? service.containers[0] : service)}
                                >
                                  <SyncIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {service.type !== 'service' && service.hasUpdate === true && service.canUpdateViaPortainer && !service.canUpdateViaDocker && (
                              <Tooltip title="Mettre à jour via Portainer">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => handleUpdateContainer(hasContainers ? service.containers[0] : service)}
                                >
                                  <SystemUpdateIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {service.type !== 'service' && service.hasUpdate === true && service.canUpdateViaDocker && service.canUpdateViaPortainer && (
                              <Box display="flex" gap={1}>
                                <Tooltip title="Mettre à jour via Docker local">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => handleUpdateContainer(hasContainers ? service.containers[0] : service)}
                                  >
                                    <SyncIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Mettre à jour via Portainer">
                                  <IconButton
                                    size="small"
                                    color="secondary"
                                    onClick={() => handleUpdateContainer(hasContainers ? service.containers[0] : service)}
                                  >
                                    <SystemUpdateIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                      {hasContainers && (
                        <TableRow>
                          <TableCell colSpan={8} sx={{ py: 0, borderBottom: expandedServices[serviceKey] ? undefined : 'none' }}>
                            <Collapse in={!!expandedServices[serviceKey]} timeout="auto" unmountOnExit>
                              <Box sx={{ my: 1, ml: 4 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  Conteneurs associés à {service.project ? `${service.project}/` : ''}{service.service || service.name}
                                </Typography>
                                {service.taskError && (
                                  <Alert severity="warning" sx={{ mb: 1 }}>
                                    {service.taskError}
                                  </Alert>
                                )}
                                {!service.containers.length && !service.taskError && (
                                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    Aucune tâche active n’est associée à ce service.
                                  </Typography>
                                )}
                                <Table size="small" aria-label={`Conteneurs associés à ${service.name}`}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Conteneur</TableCell>
                                      <TableCell>Source</TableCell>
                                      <TableCell>Statut</TableCell>
                                      <TableCell>Image</TableCell>
                                      <TableCell>Mise à jour</TableCell>
                                      <TableCell>Actions</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {service.containers.map(container => (
                                      <TableRow key={container.id}>
                                        <TableCell>{container.name || container.id}</TableCell>
                                        <TableCell>{container.source === 'docker' ? 'Docker local' : 'Portainer'}</TableCell>
                                        <TableCell>
                                          <Chip
                                            label={getStatusText(container)}
                                            size="small"
                                            color={getStatusColor(getStatusText(container))}
                                          />
                                        </TableCell>
                                        <TableCell>{container.image || 'N/A'}</TableCell>
                                        <TableCell>
                                          {container.hasUpdate ? 'Disponible' : container.updateError ? 'Inconnue' : 'À jour'}
                                        </TableCell>
                                        <TableCell>
                                          {container.canManageContainer !== false && getStatusText(container).toLowerCase().includes('exited') && (
                                            <IconButton
                                              size="small"
                                              color="success"
                                              aria-label={`Démarrer ${container.name}`}
                                              onClick={() => handleStartContainer(container.id, container.source)}
                                            >
                                              <PlayArrowIcon />
                                            </IconButton>
                                          )}
                                          {container.canManageContainer !== false && getStatusText(container).toLowerCase().includes('running') && (
                                            <IconButton
                                              size="small"
                                              color="error"
                                              aria-label={`Arrêter ${container.name}`}
                                              onClick={() => handleStopContainer(container.id, container.source)}
                                            >
                                              <StopIcon />
                                            </IconButton>
                                          )}
                                          {container.canManageContainer !== false && container.hasUpdate && (
                                            <IconButton
                                              size="small"
                                              color="primary"
                                              aria-label={`Mettre à jour ${container.name}`}
                                              onClick={() => handleUpdateContainer(container)}
                                            >
                                              {container.source === 'portainer' ? <SystemUpdateIcon /> : <SyncIcon />}
                                            </IconButton>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={filteredServices.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Services par page"
            labelDisplayedRows={({ from, to, count }) => {
              const displayText = count !== -1 ? `${from}-${to} sur ${count}` : `${from}-${to} sur plus de ${to}`;
              return displayText;
            }}
          />
        </>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" py={2}>
          <CircularProgress size={24} />
        </Box>
      )}

      <Box sx={{ mt: 4, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Note:</strong> {config.dockerHubConfigured 
            ? 'L\'authentification Docker Hub est configurée.'
            : 'Les vérifications de mises à jour utilisent l\'API Docker Hub (100 requêtes/6h pour les utilisateurs non authentifiés). '
          }
          {config.portainerConfigured && 'L\'intégration Portainer est active.'}
          {!health?.dockerPing && !health?.portainerPing && (
            <Typography variant="body2" color="error">
              <br />⚠️ Aucune source de données n’est actuellement joignable.
            </Typography>
          )}
        </Typography>
      </Box>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </Box>
  );
};

export default App;
