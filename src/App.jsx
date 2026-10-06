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
import DeviceScreen from './screens/DeviceScreen';

import { EMPTY_DEVICE_STATUS } from './data/mockData';
import { 
  checkBackendHealth, 
  fetchDeviceStatus, 
  fetchEvents, 
  fetchImages, 
  fetchFootage, 
  triggerSnapshot, 
  toggleRecording
} from './services/api';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(EMPTY_DEVICE_STATUS);
  const [events, setEvents] = useState([]);
  const [footage, setFootage] = useState([]);
  const [images, setImages] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);

  const showToast = useCallback((msg) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 3500);
  }, []);

  // Synchronize data from backend
  const refreshAllData = useCallback(async () => {
    try {
      const [dev, evts, imgs, foot] = await Promise.all([
        fetchDeviceStatus(),
        fetchEvents(),
        fetchImages(),
        fetchFootage()
      ]);
      if (dev) {
        setDeviceStatus(dev);
        if (dev.status === 'RECORDING') {
          setIsRecording(true);
        } else if (dev.status === 'ONLINE' && isRecording) {
          setIsRecording(false);
        }
      }
      if (evts) setEvents(evts);
      if (imgs) setImages(imgs);
      if (foot) setFootage(foot);
    } catch (err) {
      console.warn("Data sync notice:", err);
    }
  }, [isRecording]);

  // Check Backend health and poll telemetry
  useEffect(() => {
    async function verifyBackend() {
      const health = await checkBackendHealth();
      if (health.connected) {
        setBackendOnline(true);
        refreshAllData();
      } else {
        setBackendOnline(false);
      }
    }
    verifyBackend();

    const interval = setInterval(() => {
      fetchDeviceStatus().then(dev => {
        if (dev) {
          setDeviceStatus(dev);
          setBackendOnline(true);
        } else {
          setBackendOnline(false);
        }
      });
      // Periodically refresh captures/events if active tab requires it
      if (activeTab === 'events' || activeTab === 'images' || activeTab === 'footage') {
        refreshAllData();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, refreshAllData]);

  const handleQuickCapture = async () => {
    try {
      showToast('Dispatching capture command to NocturPod edge node...');
      const res = await triggerSnapshot();
      showToast(`Capture queued [${res.command_id}]. Acquiring frame & enhancing...`);
      
      // Refresh after a brief delay for edge acquisition & enhancement
      setTimeout(async () => {
        const [updatedImgs, updatedEvts] = await Promise.all([
          fetchImages(),
          fetchEvents()
        ]);
        if (updatedImgs) setImages(updatedImgs);
        if (updatedEvts) setEvents(updatedEvts);
      }, 2500);
    } catch (err) {
      showToast(`Capture Error: ${err.message}`);
    }
  };

  const handleToggleRecording = async (nextRecordingState) => {
    try {
      const actionText = nextRecordingState ? 'START RECORDING' : 'STOP RECORDING';
      showToast(`Dispatching ${actionText} to edge node...`);
      await toggleRecording(nextRecordingState);
      setIsRecording(nextRecordingState);
      showToast(nextRecordingState ? 'Recording initiated' : 'Recording stopped. Processing...');

      if (!nextRecordingState) {
        // Refresh recordings after stop
        setTimeout(async () => {
          const [updatedFoot, updatedEvts] = await Promise.all([
            fetchFootage(),
            fetchEvents()
          ]);
          if (updatedFoot) setFootage(updatedFoot);
          if (updatedEvts) setEvents(updatedEvts);
        }, 3000);
      }
    } catch (err) {
      showToast(`Record Error: ${err.message}`);
    }
  };

  return (
    <div className="nocturpod-app-shell">
      <LiveBackground />

      {/* Primary Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={setActiveTab} 
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        deviceStatus={deviceStatus}
      />

      {/* Main Workspace */}
      <div className={`main-workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar 
          deviceStatus={deviceStatus} 
          onQuickCapture={handleQuickCapture}
          activeTab={activeTab}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
        />

        {/* Global Toast */}
        {toastNotification && (
          <div className="app-toast-pill mono glass-panel">
            <span className="toast-dot" />
            <span className="toast-msg">{toastNotification}</span>
          </div>
        )}

        {/* Workspace Content Router */}
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
              onRefreshTelemetry={refreshAllData}
            />
          )}
        </main>
      </div>

      {/* Modals for Original / Enhanced Viewing & Downloading */}
      {selectedImage && (
        <ImageViewerModal 
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {selectedVideo && (
        <VideoPlayerModal 
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
}
