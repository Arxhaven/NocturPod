import React, { useState, useEffect, useCallback } from 'react';
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
  INITIAL_DEVICE_STATUS, 
  INITIAL_METRICS, 
  INITIAL_EVENTS, 
  INITIAL_FOOTAGE, 
  INITIAL_IMAGES, 
  INITIAL_AI_SUMMARY 
} from './data/mockData';
import { 
  checkBackendHealth, 
  fetchDeviceStatus, 
  fetchEvents, 
  fetchImages, 
  fetchFootage, 
  fetchAiSummary, 
  fetchMetrics, 
  triggerSnapshot, 
  toggleRecording,
  saveDeviceSettings 
} from './services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(INITIAL_DEVICE_STATUS);
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [footage, setFootage] = useState(INITIAL_FOOTAGE);
  const [images, setImages] = useState(INITIAL_IMAGES);
  const [aiSummary, setAiSummary] = useState(INITIAL_AI_SUMMARY);

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [claheActive, setClaheActive] = useState(true);
  const [toastNotification, setToastNotification] = useState(null);

  const showToast = useCallback((msg) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 3500);
  }, []);

  // Synchronize data from backend
  const refreshAllData = useCallback(async () => {
    try {
      const [dev, met, evts, imgs, foot, ai] = await Promise.all([
        fetchDeviceStatus(),
        fetchMetrics(),
        fetchEvents(),
        fetchImages(),
        fetchFootage(),
        fetchAiSummary()
      ]);
      if (dev) setDeviceStatus(dev);
      if (met) setMetrics(met);
      if (evts && evts.length > 0) setEvents(evts);
      if (imgs && imgs.length > 0) setImages(imgs);
      if (foot && foot.length > 0) setFootage(foot);
      if (ai) setAiSummary(ai);
    } catch (err) {
      console.warn("Background data refresh notice:", err);
    }
  }, []);

  // Check Python API backend health on launch
  useEffect(() => {
    async function verifyBackend() {
      const health = await checkBackendHealth();
      if (health.connected) {
        showToast(`Backend Connected • Model: ${health.data.ai_engine || 'YOLOv8n'}`);
        refreshAllData();
      }
    }
    verifyBackend();

    // Regular polling for device telemetry & heartbeat
    const interval = setInterval(() => {
      fetchDeviceStatus().then(dev => {
        if (dev) setDeviceStatus(dev);
      });
      fetchMetrics().then(met => {
        if (met) setMetrics(met);
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [refreshAllData, showToast]);

  const handleQuickCapture = async () => {
    try {
      showToast('Dispatching snapshot request to NocturPod edge node...');
      const res = await triggerSnapshot();
      showToast(`Capture command [${res.command_id}] queued. Edge node processing...`);
      
      // Allow edge node 1.5 seconds to acquire frame, upload, and run AI
      setTimeout(async () => {
        const [updatedImgs, updatedEvts, updatedMetrics] = await Promise.all([
          fetchImages(),
          fetchEvents(),
          fetchMetrics()
        ]);
        if (updatedImgs && updatedImgs.length > 0) {
          setImages(updatedImgs);
          setSelectedImage(updatedImgs[0]);
          showToast(`Still frame captured and committed to Images.`);
        }
        if (updatedEvts && updatedEvts.length > 0) setEvents(updatedEvts);
        if (updatedMetrics) setMetrics(updatedMetrics);
      }, 1800);
    } catch (err) {
      showToast(`Snapshot error: ${err.message}`);
    }
  };

  const handleToggleRecording = async () => {
    const nextState = !isRecording;
    setIsRecording(nextState);
    try {
      await toggleRecording(nextState);
      if (nextState) {
        showToast('1080p H.264 stream recording initiated on edge node.');
      } else {
        showToast('Recording stopped. Finalizing clip and spooling to storage...');
        setTimeout(async () => {
          const [updatedFootage, updatedEvts, updatedMetrics] = await Promise.all([
            fetchFootage(),
            fetchEvents(),
            fetchMetrics()
          ]);
          if (updatedFootage && updatedFootage.length > 0) setFootage(updatedFootage);
          if (updatedEvts && updatedEvts.length > 0) setEvents(updatedEvts);
          if (updatedMetrics) setMetrics(updatedMetrics);
          showToast('New video clip available in Footage.');
        }, 2000);
      }
    } catch (err) {
      showToast(`Recording control notice: ${err.message}`);
    }
  };

  const handleToggleClahe = () => {
    setClaheActive(!claheActive);
    showToast(`CLAHE Adaptive Luminance: ${!claheActive ? 'ENABLED' : 'BYPASSED'}`);
  };

  const handleSaveSettings = async (settings) => {
    try {
      await saveDeviceSettings(settings);
      showToast('Hardware preferences persisted to NocturPod edge node.');
      const updated = await fetchDeviceStatus();
      if (updated) setDeviceStatus(updated);
    } catch (err) {
      showToast(`Settings error: ${err.message}`);
    }
  };

  const getTabTitles = () => {
    switch (activeTab) {
      case 'overview':
        return { title: 'Overview', subtitle: 'SYSTEM SUMMARY & PRIMARY FEED' };
      case 'live':
        return { title: 'Live Monitor', subtitle: 'TACTICAL REAL-TIME OPTICAL FEED & HUD' };
      case 'events':
        return { title: 'Sensor Events', subtitle: 'CHRONOLOGICAL SENSOR AUDIT TRAIL' };
      case 'footage':
        return { title: 'Recorded Footage', subtitle: '1080P H.264 LOCAL VIDEO ARCHIVE' };
      case 'images':
        return { title: 'Image Captures', subtitle: 'EDGE STILL FRAMES & CLAHE ENHANCEMENTS' };
      case 'ai':
        return { title: 'AI Vision Analysis', subtitle: 'YOLOV8N QUANTIZED PIPELINE & INFERENCE BENCH' };
      case 'device':
        return { title: 'Device Console', subtitle: 'RPI4 / OV5647 / 850NM IR HARDWARE TELEMETRY' };
      case 'settings':
        return { title: 'System Configuration', subtitle: 'SENSOR, STORAGE & SECURITY PREFERENCES' };
      default:
        return { title: 'Dashboard', subtitle: '' };
    }
  };

  const { title, subtitle } = getTabTitles();

  return (
    <div className="app-shell">
      {/* Subtle Live Animated Background */}
      <LiveBackground />

      {/* Persistent Left Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={setActiveTab}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        deviceStatus={deviceStatus}
      />

      {/* Main Content Workspace */}
      <div className="workspace-container">
        <TopBar 
          title={title} 
          subtitle={subtitle} 
          deviceStatus={deviceStatus}
          onQuickCapture={handleQuickCapture}
        />

        <main className="content-viewport">
          {activeTab === 'overview' && (
            <OverviewScreen 
              deviceStatus={deviceStatus}
              metrics={metrics}
              events={events}
              onSelectEvent={(evt) => {
                if (evt.mediaType === 'VIDEO') {
                  const clip = footage.find(f => f.videoUrl === evt.fullMediaUrl) || footage[0];
                  setSelectedVideo(clip);
                } else {
                  const img = images.find(i => i.id === evt.id) || {
                    id: evt.id,
                    title: evt.label,
                    url: evt.fullMediaUrl || evt.thumbnail,
                    timestamp: evt.timestamp,
                    aiTag: evt.label,
                    confidence: evt.confidence,
                    eventId: evt.id
                  };
                  setSelectedImage(img);
                }
              }}
              onNavigate={setActiveTab}
              onSnapshot={handleQuickCapture}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
              claheActive={claheActive}
              onToggleClahe={handleToggleClahe}
            />
          )}

          {activeTab === 'live' && (
            <LiveMonitorScreen 
              deviceStatus={deviceStatus}
              onSnapshot={handleQuickCapture}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
              claheActive={claheActive}
              onToggleClahe={handleToggleClahe}
              events={events}
            />
          )}

          {activeTab === 'events' && (
            <EventsScreen 
              events={events}
              onSelectEvent={(evt) => {
                if (evt.mediaType === 'VIDEO') {
                  const clip = footage.find(f => f.videoUrl === evt.fullMediaUrl) || footage[0];
                  setSelectedVideo(clip);
                } else {
                  const img = images.find(i => i.id === evt.id) || {
                    id: evt.id,
                    title: evt.label,
                    url: evt.fullMediaUrl || evt.thumbnail,
                    timestamp: evt.timestamp,
                    aiTag: evt.label,
                    confidence: evt.confidence,
                    eventId: evt.id
                  };
                  setSelectedImage(img);
                }
              }}
            />
          )}

          {activeTab === 'footage' && (
            <FootageScreen 
              footageList={footage}
              onSelectVideo={(video) => setSelectedVideo(video)}
            />
          )}

          {activeTab === 'images' && (
            <ImagesScreen 
              images={images}
              onSelectImage={(img) => setSelectedImage(img)}
            />
          )}

          {activeTab === 'ai' && (
            <AIScreen 
              aiSummary={aiSummary}
            />
          )}

          {activeTab === 'device' && (
            <DeviceScreen 
              deviceStatus={deviceStatus}
              onRefreshTelemetry={async () => {
                const refreshed = await fetchDeviceStatus();
                if (refreshed) {
                  setDeviceStatus(refreshed);
                  showToast("Hardware registers updated from NocturPod edge node.");
                }
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsScreen 
              deviceStatus={deviceStatus}
              onSaveSettings={handleSaveSettings}
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
