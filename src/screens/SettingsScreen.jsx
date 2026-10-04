import React, { useState } from 'react';
import { 
  Sliders, 
  ShieldCheck, 
  Camera, 
  Wifi, 
  Bell, 
  HardDrive, 
  Save, 
  RotateCcw,
  CheckCircle2,
  Lock
} from 'lucide-react';
import './SettingsScreen.css';

export default function SettingsScreen({ deviceStatus, onSaveSettings }) {
  const [deviceName, setDeviceName] = useState('NocturPod α-1');
  const [pirSensitivity, setPirSensitivity] = useState('HIGH');
  const [claheClipLimit, setClaheClipLimit] = useState(2.2);
  const [videoClipDuration, setVideoClipDuration] = useState(30);
  const [streamQuality, setStreamQuality] = useState('1080P_24FPS');
  const [lowConfidenceCapture, setLowConfidenceCapture] = useState(true);
  const [autoIrNightSync, setAutoIrNightSync] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  const handleSave = () => {
    setToastMessage('Hardware configuration dispatched to edge node.');
    setTimeout(() => setToastMessage(''), 3000);
  };

  return (
    <div className="settings-screen-container">
      {toastMessage && (
        <div className="toast-notification mono">
          <CheckCircle2 size={15} color="#52c41a" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="settings-grid">
        {/* General Device & Identity */}
        <div className="settings-card glass-panel">
          <div className="card-head">
            <span className="card-head-title">DEVICE IDENTITY & NETWORK</span>
            <span className="card-head-sub mono">HARDWARE HOSTNAME & WI-FI</span>
          </div>

          <div className="setting-field">
            <label className="field-label">DEVICE IDENTIFIER / HOSTNAME</label>
            <input 
              type="text" 
              className="field-input mono" 
              value={deviceName} 
              onChange={(e) => setDeviceName(e.target.value)} 
            />
          </div>

          <div className="setting-field">
            <label className="field-label">WI-FI SSID (2.4GHz / 5GHz DUAL BAND)</label>
            <input 
              type="text" 
              className="field-input mono" 
              defaultValue="NocturNet-Secure-5G" 
            />
          </div>

          <div className="setting-field">
            <label className="field-label">STATIC IP RESERVATION</label>
            <input 
              type="text" 
              className="field-input mono" 
              defaultValue="192.168.1.142" 
            />
          </div>
        </div>

        {/* Camera Sensor & Night Vision */}
        <div className="settings-card glass-panel">
          <div className="card-head">
            <span className="card-head-title">OV5647 CAMERA & IR ILLUMINATION</span>
            <span className="card-head-sub mono">OPTICAL SENSOR PREFERENCES</span>
          </div>

          <div className="setting-field">
            <label className="field-label">STREAM RESOLUTION & ENCODING</label>
            <select 
              className="field-select mono"
              value={streamQuality}
              onChange={(e) => setStreamQuality(e.target.value)}
            >
              <option value="1080P_24FPS">1920×1080 @ 24 FPS (Nominal H.264)</option>
              <option value="1080P_30FPS">1920×1080 @ 30 FPS (High Bandwidth)</option>
              <option value="720P_30FPS">1280×720 @ 30 FPS (Power Saver)</option>
            </select>
          </div>

          <div className="setting-checkbox-row">
            <label className="checkbox-wrap">
              <input 
                type="checkbox" 
                checked={autoIrNightSync} 
                onChange={(e) => setAutoIrNightSync(e.target.checked)} 
              />
              <span className="cb-label">Auto-Switch 850nm IR-Cut filter based on illuminance</span>
            </label>
          </div>

          <div className="setting-field">
            <label className="field-label">EDGE CAPTURE DURATION PER TRIGGER (SECONDS)</label>
            <input 
              type="number" 
              className="field-input mono" 
              value={videoClipDuration} 
              onChange={(e) => setVideoClipDuration(Number(e.target.value))} 
              min={5} 
              max={120} 
            />
          </div>
        </div>

        {/* AI & Edge Detection Worker */}
        <div className="settings-card glass-panel">
          <div className="card-head">
            <span className="card-head-title">EDGE AI INFERENCE & CLAHE</span>
            <span className="card-head-sub mono">YOLOV8N PREPROCESSING TUNING</span>
          </div>

          <div className="setting-field">
            <div className="slider-label-row">
              <label className="field-label">CLAHE ADAPTIVE CLIP LIMIT: {claheClipLimit}</label>
              <span className="mono slider-hint">1.8 (Milder) – 2.5 (Aggressive)</span>
            </div>
            <input 
              type="range" 
              min="1.8" 
              max="2.5" 
              step="0.05"
              className="range-input" 
              value={claheClipLimit} 
              onChange={(e) => setClaheClipLimit(parseFloat(e.target.value))} 
            />
          </div>

          <div className="setting-checkbox-row">
            <label className="checkbox-wrap">
              <input 
                type="checkbox" 
                checked={lowConfidenceCapture} 
                onChange={(e) => setLowConfidenceCapture(e.target.checked)} 
              />
              <span className="cb-label">
                EvidenceWorker: Auto-crop and store ambiguous targets (0.30–0.65 conf) in SQLite
              </span>
            </label>
          </div>

          <div className="setting-field">
            <label className="field-label">PIR MOTION SENSITIVITY</label>
            <select 
              className="field-select mono"
              value={pirSensitivity}
              onChange={(e) => setPirSensitivity(e.target.value)}
            >
              <option value="HIGH">HIGH (Immediate 120µs trigger)</option>
              <option value="MEDIUM">MEDIUM (Filter short transient noise)</option>
              <option value="LOW">LOW (Large movement only)</option>
            </select>
          </div>
        </div>

        {/* Security & Access */}
        <div className="settings-card glass-panel">
          <div className="card-head">
            <span className="card-head-title">SECURITY & ENCRYPTION</span>
            <span className="card-head-sub mono">TRANSPORT & KEY MANAGEMENT</span>
          </div>

          <div className="setting-field">
            <label className="field-label">REST API & WEBSOCKET TLS</label>
            <div className="sec-pill mono">
              <Lock size={13} color="#52c41a" />
              <span>ECDSA TLS 1.3 / AES-256-GCM ACTIVE</span>
            </div>
          </div>

          <div className="setting-field">
            <label className="field-label">STORAGE RETENTION POLICY</label>
            <select className="field-select mono" defaultValue="AUTO_PURGE_90">
              <option value="AUTO_PURGE_90">Auto-purge oldest footage when 90% SSD full</option>
              <option value="MANUAL">Strict Manual Deletion only</option>
            </select>
          </div>

          <div className="save-bar">
            <button className="save-btn mono" onClick={handleSave}>
              <Save size={14} />
              <span>COMMIT CHANGES TO NOCTURPOD</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
