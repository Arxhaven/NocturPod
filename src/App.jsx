import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import DeviceScreen from './screens/DeviceScreen';
import AIScreen from './screens/AIScreen';
import SettingsScreen from './screens/SettingsScreen';

import { EMPTY_DEVICE_STATUS } from './data/mockData';
import { 
  fetchDeviceStatus, 
  fetchEvents, 
  fetchImages, 
  fetchFootage, 
  triggerSnapshot, 
  toggleRecording,
  deleteEvent,
  setLightMode
} from './services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(EMPTY_DEVICE_STATUS);
  const [backendOnline, setBackendOnline] = useState(false);
  
  const [events, setEvents] = useState([]);
  const [footage, setFootage] = useState([]);
  const [images, setImages] = useState([]);

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSwitchingLight, setIsSwitchingLight] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);
  const isPollingRef = useRef(false);

  const showToast = useCallback((text, isWarning = false) => {
    setToastNotification({ text, isWarning });
    setTimeout(() => {
      setToastNotification((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  const refreshMedia = useCallback(async () => {
    try {
      const [evts, imgs, foot] = await Promise.all([
        fetchEvents(),
        fetchImages(),
        fetchFootage()
      ]);
      if (evts) setEvents(evts);
      if (imgs) setImages(imgs);
      if (foot) setFootage(foot);
    } catch (err) {
      console.warn("Media sync notice:", err);
    }
  }, []);

  // Single authoritative polling loop for device telemetry
  useEffect(() => {
    let isMounted = true;

    const pollTelemetry = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const dev = await fetchDeviceStatus();
        if (!isMounted) return;

        if (dev) {
          setBackendOnline(true);
          setDeviceStatus(dev);

          // Synchronize recording state authoritatively from device status
          if (dev.status === 'RECORDING') {
            setIsRecording(true);
          } else if (dev.status === 'ONLINE' && isRecording) {
            setIsRecording(false);
          }
        } else {
          // Backend is unreachable or returned error
          setBackendOnline(false);
          setDeviceStatus((prev) => ({
            ...prev,
            status: 'OFFLINE',
            camera_status: 'OFFLINE',
            wifi_status: 'OFFLINE'
          }));
        }
      } catch {
        if (!isMounted) return;
        setBackendOnline(false);
        setDeviceStatus((prev) => ({
          ...prev,
          status: 'OFFLINE',
          camera_status: 'OFFLINE',
          wifi_status: 'OFFLINE'
        }));
      } finally {
        isPollingRef.current = false;
      }
    };

    // Initial immediate poll & media load
    pollTelemetry();
    refreshMedia();

    // Central 3-second heartbeat polling interval
    const interval = setInterval(() => {
      pollTelemetry();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [refreshMedia, isRecording]);

  // Refresh media when switching to media/events tabs
  useEffect(() => {
    if (activeTab === 'images' || activeTab === 'footage' || activeTab === 'events') {
      refreshMedia();
    }
  }, [activeTab, refreshMedia]);

  // Genuine Edge Snapshot Capture flow
  const handleQuickCapture = async () => {
    if (!backendOnline) {
      showToast('BACKEND UNAVAILABLE — Cannot dispatch capture command', true);
      return;
    }

    try {
      setIsCapturing(true);
      showToast('CAPTURE COMMAND SENT — WAITING FOR EDGE NODE...');
      const res = await triggerSnapshot();
      showToast(`Command acknowledged [${res.command_id || 'DISPATCHED'}]. Acquiring frame...`);
      
      // Allow brief period for edge acquisition and Supabase ingestion
      setTimeout(async () => {
        await refreshMedia();
        setIsCapturing(false);
        showToast('Capture processed and registered in media archive');
      }, 3500);
    } catch (err) {
      setIsCapturing(false);
      showToast(`Capture Error: ${err.message}`, true);
    }
  };

  // Genuine Edge Video Recording flow
  const handleToggleRecording = async (nextRecordingState) => {
    if (!backendOnline) {
      showToast('BACKEND UNAVAILABLE — Cannot toggle recording', true);
      return;
    }

    try {
      const actionText = nextRecordingState ? 'START RECORDING' : 'STOP RECORDING';
      showToast(`COMMAND SENT: ${actionText} — WAITING FOR DEVICE...`);
      await toggleRecording(nextRecordingState);
      
      // Update optimistic state while device processes command
      setIsRecording(nextRecordingState);
      showToast(nextRecordingState 
        ? 'RECORDING COMMAND QUEUED — Edge node activating storage stream' 
        : 'STOPPING RECORDING — Edge node finalizing video asset...'
      );

      if (!nextRecordingState) {
        setTimeout(async () => {
          await refreshMedia();
        }, 3500);
      }
    } catch (err) {
      showToast(`Record Error: ${err.message}`, true);
    }
  };

  // Genuine Dual Light Mode toggle flow (Mode A: White / Mode B: Night)
  const handleToggleLightMode = async (targetMode) => {
    if (!backendOnline) {
      showToast('BACKEND UNAVAILABLE — Cannot dispatch light mode command', true);
      return;
    }

    const previousMode = deviceStatus?.light_mode || deviceStatus?.lightMode || 'WHITE';
    if (targetMode === previousMode) return;

    try {
      setIsSwitchingLight(true);
      showToast(`DISPATCHING LIGHT MODE: ${targetMode === 'NIGHT' ? 'MODE B (NIGHT / LOW-LIGHT)' : 'MODE A (WHITE / NORMAL)'}...`);
      
      // Optimistic UI update
      setDeviceStatus(prev => ({
        ...prev,
        light_mode: targetMode,
        lightMode: targetMode,
      }));

      await setLightMode(targetMode);
      showToast(`LIGHT MODE CONFIRMED: ${targetMode === 'NIGHT' ? 'MODE B (NIGHT / LOW-LIGHT)' : 'MODE A (WHITE / NORMAL)'}`);
    } catch (err) {
      // Revert optimistic update on failure
      setDeviceStatus(prev => ({
        ...prev,
        light_mode: previousMode,
        lightMode: previousMode,
      }));
      showToast(`Light Mode Error: ${err.message}`, true);
    } finally {
      setIsSwitchingLight(false);
    }
  };

  // Delete event and associated media
  const handleDeleteEvent = async (eventId) => {
    try {
      showToast(`Deleting ${eventId}...`);
      await deleteEvent(eventId);
      showToast(`Capture ${eventId} deleted successfully`);
      setSelectedImage(null);
      setSelectedVideo(null);
      setImages(prev => prev.filter(item => (item.event_id || item.id) !== eventId));
      setFootage(prev => prev.filter(item => (item.event_id || item.id) !== eventId));
      setEvents(prev => prev.filter(item => (item.event_id || item.id) !== eventId));
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, true);
    }
  };

  return (
    <div className="app-shell">
      <LiveBackground />

      {/* Primary Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={setActiveTab} 
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        deviceStatus={deviceStatus}
        backendOnline={backendOnline}
      />

      {/* Main App Workspace */}
      <div className={`workspace-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar 
          deviceStatus={deviceStatus} 
          backendOnline={backendOnline}
          onQuickCapture={handleQuickCapture}
          isCapturing={isCapturing}
          activeTab={activeTab}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          onToggleLightMode={handleToggleLightMode}
          isSwitchingLight={isSwitchingLight}
        />

        {/* Global Toast Notification */}
        {toastNotification && (
          <div className="app-toast-pill mono glass-panel">
            <span className={`toast-dot ${toastNotification.isWarning ? 'warning' : ''}`} />
            <span className="toast-msg">{toastNotification.text}</span>
          </div>
        )}

        {/* Authenticated Workspace Content Router */}
        <main className="content-viewport" id="main-content">
          {activeTab === 'overview' && (
            <OverviewScreen 
              deviceStatus={deviceStatus}
              capturesCount={images.length}
              recordingsCount={footage.length}
              onNavigate={setActiveTab}
              onSnapshot={handleQuickCapture}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
            />
          )}

          {activeTab === 'live' && (
            <LiveMonitorScreen 
              deviceStatus={deviceStatus}
              onSnapshot={handleQuickCapture}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
              onToggleLightMode={handleToggleLightMode}
              isSwitchingLight={isSwitchingLight}
            />
          )}

          {activeTab === 'images' && (
            <ImagesScreen 
              images={images}
              onSelectImage={setSelectedImage}
            />
          )}

          {activeTab === 'footage' && (
            <FootageScreen 
              footageList={footage}
              onSelectVideo={setSelectedVideo}
            />
          )}

          {activeTab === 'events' && (
            <EventsScreen 
              events={events}
              onSelectEvent={(evt) => {
                if (evt.media_type === 'VIDEO') {
                  setSelectedVideo(evt);
                } else {
                  setSelectedImage(evt);
                }
              }}
            />
          )}

          {activeTab === 'device' && (
            <DeviceScreen 
              deviceStatus={deviceStatus}
              onRefreshTelemetry={async () => {
                const dev = await fetchDeviceStatus();
                if (dev) {
                  setDeviceStatus(dev);
                  setBackendOnline(true);
                  showToast('Device telemetry refreshed from edge node');
                } else {
                  setBackendOnline(false);
                  showToast('Backend ping failed — Node unreachable', true);
                }
              }}
            />
          )}

          {activeTab === 'ai' && <AIScreen />}

          {activeTab === 'settings' && (
            <SettingsScreen 
              deviceStatus={deviceStatus}
            />
          )}
        </main>
      </div>

      {/* Genuine Media Inspection Modals */}
      {selectedImage && (
        <ImageViewerModal 
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onDelete={handleDeleteEvent}
        />
      )}

      {selectedVideo && (
        <VideoPlayerModal 
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onDelete={handleDeleteEvent}
        />
      )}
    </div>
  );
}
