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
  INITIAL_DEVICE_STATUS, 
  INITIAL_METRICS, 
  INITIAL_EVENTS, 
  INITIAL_FOOTAGE, 
  INITIAL_IMAGES, 
  INITIAL_AI_SUMMARY 
} from './data/mockData';
import { checkBackendHealth } from './services/api';
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

  // Check Python API backend health on launch
  useEffect(() => {
    async function verifyBackend() {
      const health = await checkBackendHealth();
      if (health.connected) {
        showToast(`Backend AI Server Connected (${health.data.model})`);
      }
    }
    verifyBackend();
  }, []);

  const showToast = (msg) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 3500);
  };

  const handleQuickCapture = () => {
    const newId = `img-${Date.now().toString().slice(-4)}`;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const newImage = {
      id: newId,
      title: 'Manual Snapshot (Triggered)',
      timestamp: nowStr,
      resolution: '1920×1080',
      iso: 'ISO 1600 (IR Active)',
      shutter: '1/50s',
      url: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1600&q=85',
      thumbnail: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=600&q=80',
      aiTag: 'Person',
      confidence: 0.952,
      eventId: `evt-${Date.now().toString().slice(-3)}`,
      claheApplied: claheActive,
      boundingBoxes: [{ label: 'Person', confidence: 0.952, x1: 20, y1: 15, x2: 65, y2: 85 }]
    };

    setImages([newImage, ...images]);
    setMetrics(prev => ({
      ...prev,
      capturesToday: prev.capturesToday + 1,
      aiDetectionsToday: prev.aiDetectionsToday + 1
    }));

    showToast(`Edge capture [${newId}] saved & queued to SQLite.`);
    setSelectedImage(newImage);
  };

  const handleToggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      showToast('1080p H.264 stream recording initiated.');
    } else {
      showToast('Recording stopped. Clip committed to local SSD.');
      setMetrics(prev => ({
        ...prev,
        recordedMinutesToday: prev.recordedMinutesToday + 1
      }));
    }
  };

  const handleToggleClahe = () => {
    setClaheActive(!claheActive);
    showToast(`CLAHE Adaptive Luminance: ${!claheActive ? 'ENABLED' : 'BYPASSED'}`);
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
        return { title: 'Device Console', subtitle: 'RPI4 / OV5647 / AM312 HARDWARE TELEMETRY' };
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
                  const clip = footage[0];
                  setSelectedVideo(clip);
                } else {
                  const img = images[0];
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
              onRefreshTelemetry={() => {
                setDeviceStatus(prev => ({
                  ...prev,
                  cpuTempC: +(44.0 + Math.random() * 2).toFixed(1),
                  lastHeartbeatSec: 1
                }));
                showToast("Hardware registers updated (Telemetry nominal).");
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsScreen 
              deviceStatus={deviceStatus}
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
