import React, { useState, useEffect } from 'react';
import LiveBackground from './components/LiveBackground';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ImageViewerModal from './components/ImageViewerModal';
import VideoPlayerModal from './components/VideoPlayerModal';

import OverviewScreen from './screens/OverviewScreen';
import LiveMonitorScreen from './screens/LiveMonitorScreen';
import EventsScreen from './screens/EventsScreen';
import FootageScreen from './screens/FootageScreen';
import ImagesScreen from './screens/ImagesScreen';
import AIScreen from './screens/AIScreen';
import DeviceScreen from './screens/DeviceScreen';
import SettingsScreen from './screens/SettingsScreen';

import { 
  INITIAL_DEVICE_STATUS as DEMO_DEVICE_STATUS, 
  INITIAL_METRICS as DEMO_METRICS, 
  INITIAL_EVENTS as DEMO_EVENTS, 
  INITIAL_FOOTAGE as DEMO_FOOTAGE, 
  INITIAL_IMAGES as DEMO_IMAGES, 
  INITIAL_AI_SUMMARY as DEMO_AI_SUMMARY 
} from './data/mockData';
import { 
  checkBackendHealth,
  fetchTelemetry,
  fetchEvents,
  fetchImages,
  fetchFootage,
  fetchAiStatus,
  fetchConfig,
  saveConfig,
  triggerCaptureCommand,
  triggerRecordCommand,
  resolveMediaUrl
} from './services/api';
import { 
  INITIAL_DISCONNECTED_STATUS, 
  INITIAL_BLANK_METRICS,
  evaluateDeviceStatus 
} from './utils/deviceStatus';
import { resolveEventMedia } from './utils/eventSelection';
import { 
  executeSnapshotWorkflow, 
  mapBackendImageRecord 
} from './utils/manualCapture';
import './App.css';

const DEFAULT_STANDBY_AI_SUMMARY = {
  totalAnalyzedToday: 0,
  processingStatus: 'STANDBY',
  queueLength: 0,
  latencyMs: null,
  modelName: 'YOLOv8n Perimeter Security',
  claheClipLimit: 'Adaptive CLAHE',
  classesTracked: ['Person', 'Vehicle', 'Bicycle', 'Animal'],
  pipelineStages: ['Optical Ingestion', 'Adaptive CLAHE', 'YOLOv8n Inference', 'Storage Archival']
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Real initial states: disconnected, zeroed, without fake data
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(INITIAL_DISCONNECTED_STATUS);
  const [metrics, setMetrics] = useState(INITIAL_BLANK_METRICS);
  const [events, setEvents] = useState([]);
  const [footage, setFootage] = useState([]);
  const [images, setImages] = useState([]);
  const [aiSummary, setAiSummary] = useState(DEFAULT_STANDBY_AI_SUMMARY);

  const [serverConfig, setServerConfig] = useState(null);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [configError, setConfigError] = useState(null);

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRefreshingImages, setIsRefreshingImages] = useState(false);
  const [isRefreshingFootage, setIsRefreshingFootage] = useState(false);
  const [claheActive, setClaheActive] = useState(true);
  const [toastNotification, setToastNotification] = useState(null);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);
  const [telemetryError, setTelemetryError] = useState(null);

  // Initialize and check API backend health and real data on launch
  const initData = async () => {
    setIsConfigLoading(true);
    setConfigError(null);

    const health = await checkBackendHealth();
    if (health.connected) {
      showToast(`Connected to NocturPod Gateway (${health.data?.service || 'Online'})`);
      
      // Fetch actual hardware device status and telemetry
      const tel = await fetchTelemetry();
      const honestStatus = evaluateDeviceStatus(health, tel, INITIAL_DISCONNECTED_STATUS);
      setDeviceStatus(honestStatus);

      // Fetch AI pipeline status
      const aiData = await fetchAiStatus();
      if (aiData) {
        setAiSummary({
          totalAnalyzedToday: 0,
          processingStatus: aiData.status || (aiData.is_ready ? 'ONLINE' : 'STANDBY'),
          modelName: aiData.detection_engine || 'YOLOv8n Perimeter Security',
          claheClipLimit: aiData.enhancement_pipeline || 'Adaptive CLAHE',
          isReady: aiData.is_ready,
          classesTracked: ['Person', 'Vehicle', 'Bicycle', 'Animal'],
          pipelineStages: ['Ingest', 'Adaptive CLAHE', 'YOLOv8n Inference']
        });
      }

      // Fetch real events
      let loadedEvents = [];
      const realEvents = await fetchEvents();
      if (Array.isArray(realEvents) && realEvents.length > 0) {
        loadedEvents = realEvents.map((evt, idx) => {
          const rawTime = evt.timestamp || evt.created_at || new Date().toISOString();
          let formattedTime = rawTime;
          try {
            const d = new Date(rawTime);
            if (!isNaN(d.getTime())) {
              formattedTime = d.toISOString().replace('T', ' ').slice(0, 19);
            }
          } catch {
            // keep raw
          }

          const primaryUrl = evt.enhanced_url || evt.original_url || evt.url || evt.thumbnail;
          const detections = Array.isArray(evt.detections) ? evt.detections : [];
          const primaryDet = detections[0] || null;

          return {
            id: evt.event_id || evt.id || `evt-${idx}`,
            eventId: evt.event_id,
            timestamp: formattedTime,
            originalTimestamp: rawTime,
            type: evt.type || (evt.media_type === 'VIDEO' ? 'FOOTAGE_RECORDED' : 'MOTION_TRIGGERED'),
            label: evt.type === 'MANUAL_CAPTURE' ? 'Manual Capture' : (evt.type === 'VIDEO_RECORDING' ? 'Footage Recording' : (primaryDet?.label ? `${primaryDet.label} Detected` : 'Motion Triggered')),
            confidence: primaryDet?.confidence ?? null,
            aiStatus: evt.ai_status || 'PENDING',
            processingStatus: evt.processing_status || 'PENDING',
            thumbnail: resolveMediaUrl(primaryUrl),
            fullMediaUrl: resolveMediaUrl(evt.enhanced_url || evt.original_url || evt.fullMediaUrl),
            mediaType: evt.media_type || (evt.type === 'VIDEO_RECORDING' ? 'VIDEO' : 'IMAGE'),
            duration: evt.duration || null,
            detections,
            notes: evt.notes || `Event ${evt.event_id || idx}`
          };
        });
        setEvents(loadedEvents);
      } else {
        setEvents([]);
      }

      // Fetch real captures
      let loadedImages = [];
      const realImages = await fetchImages();
      if (Array.isArray(realImages) && realImages.length > 0) {
        loadedImages = realImages.map(img => mapBackendImageRecord(img, resolveMediaUrl));
        setImages(loadedImages);
      } else {
        setImages([]);
      }

      // Fetch real footage
      let loadedFootage = [];
      const realFootage = await fetchFootage();
      if (Array.isArray(realFootage) && realFootage.length > 0) {
        loadedFootage = realFootage.map((clip, idx) => {
          const rawTime = clip.timestamp || clip.created_at || new Date().toISOString();
          let formattedTime = rawTime;
          try {
            const d = new Date(rawTime);
            if (!isNaN(d.getTime())) {
              formattedTime = d.toISOString().replace('T', ' ').slice(0, 19);
            }
          } catch {
            // keep raw
          }
          const primaryUrl = clip.enhanced_url || clip.original_url || clip.videoUrl;

          return {
            id: clip.event_id || clip.id || `vid-${idx}`,
            eventId: clip.event_id,
            title: clip.notes || 'Recorded Video Clip',
            timestamp: formattedTime,
            duration: clip.duration || 'N/A',
            resolution: '1280×720 (OV5647)',
            videoUrl: resolveMediaUrl(primaryUrl),
            thumbnail: clip.thumbnail ? resolveMediaUrl(clip.thumbnail) : null,
            camera: 'Primary Optical OV5647',
            aiStatus: clip.ai_status || 'PENDING',
            processingStatus: clip.processing_status || 'PENDING',
            aiSummary: clip.ai_status === 'PROCESSING' ? 'AI Enhancement Pending' : 'Raw Video Recording',
            detections: clip.detections || []
          };
        });
        setFootage(loadedFootage);
      } else {
        setFootage([]);
      }

      // Update honest dashboard metrics
      setMetrics({
        motionEventsToday: loadedEvents.filter(e => e.type !== 'MANUAL_CAPTURE').length,
        capturesToday: loadedImages.length,
        recordedMinutesToday: Math.round(loadedFootage.reduce((acc, c) => acc + (parseInt(c.duration, 10) || 0), 0) / 60),
        aiDetectionsToday: loadedEvents.filter(e => e.detections && e.detections.length > 0).length,
        uptimeStr: tel?.uptimeHours != null ? `${tel.uptimeHours}h ${tel.uptimeMinutes}m` : 'N/A',
        healthScore: honestStatus.status === 'ONLINE' ? '98%' : 'OFFLINE'
      });

      // Fetch active device configuration if supported
      try {
        const cfg = await fetchConfig();
        if (cfg) {
          setServerConfig(cfg);
        }
      } catch {
        // Fallback
      } finally {
        setIsConfigLoading(false);
      }
    } else {
      // Honest offline status
      const offlineStatus = evaluateDeviceStatus(health, null, INITIAL_DISCONNECTED_STATUS);
      setDeviceStatus(offlineStatus);
      setConfigError(health.error || 'Edge gateway unreachable');
      setIsConfigLoading(false);
      showToast('NocturPod Backend offline. Operating in disconnected state.');
    }
  };

  useEffect(() => {
    if (!isDemoMode) {
      initData();
    }
  }, [isDemoMode]);

  const toggleDemoMode = () => {
    if (!isDemoMode) {
      // Enable Demo Mode with explicit visual indicator
      setIsDemoMode(true);
      setDeviceStatus({ ...DEMO_DEVICE_STATUS, status: 'ONLINE' });
      setMetrics(DEMO_METRICS);
      setEvents(DEMO_EVENTS);
      setFootage(DEMO_FOOTAGE);
      setImages(DEMO_IMAGES);
      setAiSummary(DEMO_AI_SUMMARY);
      setServerConfig({
        deviceName: DEMO_DEVICE_STATUS.name,
        pirSensitivity: 'HIGH',
        claheClipLimit: 2.2,
        videoClipDuration: 30,
        streamQuality: '1080P_24FPS',
        lowConfidenceCapture: true,
        autoIrNightSync: true,
        wifiSSID: DEMO_DEVICE_STATUS.wifiSSID,
        ipAddress: DEMO_DEVICE_STATUS.ipAddress
      });
      setConfigError(null);
      showToast('DEMO MODE ENABLED: Displaying simulated sample data.');
    } else {
      // Revert to Real Hardware Mode
      setIsDemoMode(false);
      setDeviceStatus(INITIAL_DISCONNECTED_STATUS);
      setMetrics(INITIAL_BLANK_METRICS);
      setEvents([]);
      setFootage([]);
      setImages([]);
      setAiSummary(DEFAULT_STANDBY_AI_SUMMARY);
      setServerConfig(null);
      showToast('Switched to live backend mode.');
    }
  };

  const showToast = (msg) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 4500);
  };

  // Full manual snapshot workflow: POST command -> queued state -> poll media -> display
  const handleQuickCapture = async () => {
    if (isCapturing) {
      showToast("A capture is already in progress. Please wait for the current upload.");
      return;
    }

    setIsCapturing(true);

    try {
      showToast("Dispatching snapshot command to edge device queue...");
      const newImage = await executeSnapshotWorkflow({
        triggerCaptureFn: triggerCaptureCommand,
        fetchImagesFn: fetchImages,
        resolveMediaUrlFn: resolveMediaUrl,
        onStatusUpdate: (st) => {
          if (st.status === 'QUEUED') {
            showToast(`Capture command [${st.commandId}] queued. Waiting for Raspberry Pi upload...`);
          } else if (st.status === 'POLLING') {
            // Optional progress
          }
        },
        pollIntervalMs: 2500,
        maxAttempts: 10
      });

      // Genuine capture received
      setImages(prev => [newImage, ...prev]);

      // Add to event stream
      const newEvent = {
        id: newImage.eventId || `evt-${newImage.id.slice(-4)}`,
        eventId: newImage.eventId,
        timestamp: newImage.timestamp,
        type: 'MANUAL_CAPTURE',
        label: 'Manual Snapshot (Hardware)',
        confidence: null,
        aiStatus: newImage.aiStatus || 'CAPTURED',
        thumbnail: newImage.thumbnail,
        fullMediaUrl: newImage.url,
        mediaType: 'IMAGE',
        detections: newImage.boundingBoxes || [],
        notes: `Optical frame ${newImage.id} captured via hardware trigger.`
      };
      setEvents(prev => [newEvent, ...prev]);

      setMetrics(prev => ({
        ...prev,
        capturesToday: (prev.capturesToday || 0) + 1,
      }));

      showToast(`Hardware capture [${newImage.eventId || newImage.id}] received and saved.`);
      setSelectedImage(newImage);
    } catch (err) {
      showToast(`Capture failed: ${err.message || 'Edge camera offline or upload timed out.'}`);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleToggleRecording = async () => {
    try {
      const nextAction = isRecording ? 'STOP' : 'START';
      const res = await triggerRecordCommand(nextAction);
      setIsRecording(!isRecording);
      showToast(`Recording command queued (ID: ${res.command_id || 'sent'}).`);
    } catch (err) {
      showToast(`Recording command error: ${err.message}`);
    }
  };

  const handleRefreshImages = async () => {
    setIsRefreshingImages(true);
    try {
      const realImages = await fetchImages();
      if (Array.isArray(realImages)) {
        const mapped = realImages.map(img => mapBackendImageRecord(img, resolveMediaUrl));
        setImages(mapped);
        setMetrics(prev => ({ ...prev, capturesToday: mapped.length }));
        showToast(`Storage refreshed: ${mapped.length} captures loaded.`);
      }
    } catch (err) {
      showToast(`Failed to refresh images: ${err.message}`);
    } finally {
      setIsRefreshingImages(false);
    }
  };

  const handleRefreshFootage = async () => {
    setIsRefreshingFootage(true);
    try {
      const realFootage = await fetchFootage();
      if (Array.isArray(realFootage)) {
        const mapped = realFootage.map((clip, idx) => ({
          id: clip.event_id || clip.id || `vid-${idx}`,
          eventId: clip.event_id,
          title: clip.notes || 'Recorded Video Clip',
          timestamp: clip.timestamp ? clip.timestamp.replace('T', ' ').slice(0, 19) : new Date().toISOString().slice(0, 19),
          duration: clip.duration || 'N/A',
          resolution: '1280×720 (OV5647)',
          videoUrl: resolveMediaUrl(clip.enhanced_url || clip.original_url || clip.videoUrl),
          thumbnail: clip.thumbnail ? resolveMediaUrl(clip.thumbnail) : null,
          camera: 'Primary Optical OV5647',
          aiStatus: clip.ai_status || 'PENDING',
          processingStatus: clip.processing_status || 'PENDING',
          aiSummary: clip.ai_status === 'PROCESSING' ? 'AI Enhancement Pending' : 'Raw Video Recording',
          detections: clip.detections || []
        }));
        setFootage(mapped);
        showToast(`Footage refreshed: ${mapped.length} clips loaded.`);
      }
    } catch (err) {
      showToast(`Failed to refresh footage: ${err.message}`);
    } finally {
      setIsRefreshingFootage(false);
    }
  };

  const handleRefreshTelemetry = async () => {
    setIsRefreshingTelemetry(true);
    setTelemetryError(null);
    try {
      const tel = await fetchTelemetry();
      if (tel) {
        setDeviceStatus(evaluateDeviceStatus({ connected: true }, tel, deviceStatus));
        showToast("Live telemetry synced from hardware backend.");
      } else {
        setTelemetryError("Backend did not return device telemetry.");
        showToast("Telemetry sync failed: Device unresponsive.");
      }
    } catch (err) {
      setTelemetryError(err.message || "Telemetry request failed.");
      showToast("Telemetry sync failed.");
    } finally {
      setIsRefreshingTelemetry(false);
    }
  };

  // Centralized, safe event selection resolving actual event media
  const handleSelectEvent = (evt) => {
    const resolved = resolveEventMedia(evt, images, footage);
    if (resolved.found) {
      if (resolved.mediaType === 'VIDEO') {
        setSelectedVideo(resolved.media);
      } else {
        setSelectedImage(resolved.media);
      }
    } else {
      showToast(`Media for event ${evt.id} is being processed or unavailable.`);
    }
  };

  const handleToggleClahe = () => {
    setClaheActive(!claheActive);
    showToast(`Adaptive CLAHE luminance filter ${!claheActive ? 'ACTIVATED' : 'BYPASS'}.`);
  };

  return (
    <div className="app-shell">
      {/* Dynamic low-light background canvas */}
      <LiveBackground activeTab={activeTab} isConnected={deviceStatus.status === 'ONLINE'} />

      {/* Primary Collapsible Tactical Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={setActiveTab}
        setActiveTab={setActiveTab} 
        collapsed={sidebarCollapsed} 
        isCollapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed} 
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        deviceStatus={deviceStatus}
        eventCount={events.length}
        isDemoMode={isDemoMode}
      />

      <div className={`workspace-container ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        {/* Top Operational Status & Telemetry HUD Bar */}
        <TopBar 
          deviceStatus={deviceStatus} 
          title={
            activeTab === 'overview' ? 'NOCTURNAL SURVEILLANCE OVERVIEW' :
            activeTab === 'live' ? 'OPTICAL SENSOR MONITOR // FEED' :
            activeTab === 'events' ? 'SECURITY AUDIT EVENT TIMELINE' :
            activeTab === 'footage' ? 'RECORDED FOOTAGE ARCHIVE' :
            activeTab === 'images' ? 'OPTICAL HIGH-RES CAPTURES' :
            activeTab === 'ai' ? 'QUANTIZED VISION INFERENCE ENGINE' :
            activeTab === 'device' ? 'HARDWARE HEALTH & SUBSYSTEMS' :
            'EDGE GATEWAY SYSTEM SETTINGS'
          }
          subtitle={
            activeTab === 'overview' ? 'Real-time perimeter surveillance & telemetry' :
            activeTab === 'live' ? 'OmniVision OV5647 optical feed with adaptive CLAHE' :
            activeTab === 'events' ? 'PIR motion-triggered chronological detection stream' :
            activeTab === 'footage' ? 'H.264 encrypted local circular buffer footage' :
            activeTab === 'images' ? 'Lossless captures and edge AI classifications' :
            activeTab === 'ai' ? 'YOLOv8n quantized model and low-light enhancement' :
            activeTab === 'device' ? 'SoC thermal monitoring and hardware bus status' :
            'Configure detection thresholds and hardware interfaces'
          }
          onQuickCapture={handleQuickCapture}
          isCapturing={isCapturing}
          isDemoMode={isDemoMode}
          onToggleDemoMode={toggleDemoMode}
        />

        {/* Global Demo Mode Warning Banner */}
        {isDemoMode && (
          <div 
            className="demo-mode-alert-bar mono"
            style={{
              background: 'rgba(250, 173, 20, 0.15)',
              borderBottom: '1px solid rgba(250, 173, 20, 0.4)',
              color: '#faad14',
              padding: '8px 24px',
              fontSize: '11px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <span>
              ⚠ DEMO MODE ACTIVE: Displaying simulated sample captures and telemetry. Physical hardware is not connected.
            </span>
            <button
              type="button"
              onClick={toggleDemoMode}
              className="mono"
              style={{
                background: 'rgba(250, 173, 20, 0.25)',
                border: '1px solid #faad14',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              EXIT DEMO MODE
            </button>
          </div>
        )}

        <main className="content-viewport">
          {activeTab === 'overview' && (
            <OverviewScreen 
              deviceStatus={deviceStatus}
              metrics={metrics}
              events={events}
              onSelectEvent={handleSelectEvent}
              onNavigate={setActiveTab}
              onSnapshot={handleQuickCapture}
              isCapturing={isCapturing}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
              claheActive={claheActive}
              onToggleClahe={handleToggleClahe}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'live' && (
            <LiveMonitorScreen 
              deviceStatus={deviceStatus}
              onSnapshot={handleQuickCapture}
              isCapturing={isCapturing}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
              claheActive={claheActive}
              onToggleClahe={handleToggleClahe}
              events={events}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'events' && (
            <EventsScreen 
              events={events}
              onSelectEvent={handleSelectEvent}
            />
          )}

          {activeTab === 'footage' && (
            <FootageScreen 
              footageList={footage}
              onSelectVideo={(video) => setSelectedVideo(video)}
              onRefreshFootage={handleRefreshFootage}
              isRefreshing={isRefreshingFootage}
            />
          )}

          {activeTab === 'images' && (
            <ImagesScreen 
              images={images}
              onSelectImage={(img) => setSelectedImage(img)}
              onRefreshImages={handleRefreshImages}
              isRefreshing={isRefreshingImages}
            />
          )}

          {activeTab === 'ai' && (
            <AIScreen 
              aiSummary={aiSummary}
              isDemoMode={isDemoMode}
            />
          )}

          {activeTab === 'device' && (
            <DeviceScreen 
              deviceStatus={deviceStatus}
              onRefreshTelemetry={handleRefreshTelemetry}
              isRefreshing={isRefreshingTelemetry}
              telemetryError={telemetryError}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsScreen 
              serverConfig={serverConfig}
              isConfigLoading={isConfigLoading}
              configError={configError}
              onRetryFetchConfig={initData}
              onSaveSettings={async (newConfig) => {
                if (isDemoMode) {
                  setServerConfig(newConfig);
                  showToast("Demo configuration saved locally.");
                  return;
                }
                const res = await saveConfig(newConfig);
                if (res && res.status === 'ok') {
                  setServerConfig(res.config || newConfig);
                  showToast("Configuration committed to edge storage.");
                }
              }}
              isDemoMode={isDemoMode}
            />
          )}
        </main>
      </div>

      {/* Global Image Viewer Modal */}
      {selectedImage && (
        <ImageViewerModal 
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onPrev={() => {
            const idx = images.findIndex(i => i.id === selectedImage.id);
            if (idx > 0) setSelectedImage(images[idx - 1]);
          }}
          onNext={() => {
            const idx = images.findIndex(i => i.id === selectedImage.id);
            if (idx < images.length - 1) setSelectedImage(images[idx + 1]);
          }}
        />
      )}

      {/* Global Video Player Modal */}
      {selectedVideo && (
        <VideoPlayerModal 
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {/* Floating System Toast */}
      {toastNotification && (
        <div className="floating-app-toast mono">
          <span className="toast-bullet" />
          <span>{toastNotification}</span>
        </div>
      )}
    </div>
  );
}
