import React, { useState, useEffect } from 'react';
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
  Lock,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import './SettingsScreen.css';

export default function SettingsScreen({ 
  serverConfig, 
  isConfigLoading = false, 
  configError = null, 
  onRetryFetchConfig, 
  onSaveSettings,
  isDemoMode = false
}) {
  const [deviceName, setDeviceName] = useState('');
  const [pirSensitivity, setPirSensitivity] = useState('HIGH');
  const [claheClipLimit, setClaheClipLimit] = useState(2.2);
  const [videoClipDuration, setVideoClipDuration] = useState(30);
  const [streamQuality, setStreamQuality] = useState('1080P_24FPS');
  const [lowConfidenceCapture, setLowConfidenceCapture] = useState(true);
  const [autoIrNightSync, setAutoIrNightSync] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state whenever real server configuration is loaded/updated
  useEffect(() => {
    if (serverConfig) {
      if (serverConfig.deviceName != null) setDeviceName(serverConfig.deviceName);
      if (serverConfig.pirSensitivity != null) setPirSensitivity(serverConfig.pirSensitivity);
      if (serverConfig.claheClipLimit != null) setClaheClipLimit(serverConfig.claheClipLimit);
      if (serverConfig.videoClipDuration != null) setVideoClipDuration(serverConfig.videoClipDuration);
      if (serverConfig.streamQuality != null) setStreamQuality(serverConfig.streamQuality);
      if (serverConfig.lowConfidenceCapture != null) setLowConfidenceCapture(Boolean(serverConfig.lowConfidenceCapture));
      if (serverConfig.autoIrNightSync != null) setAutoIrNightSync(Boolean(serverConfig.autoIrNightSync));
    }
  }, [serverConfig]);

  const handleSave = async () => {
    const payload = {
      deviceName,
      pirSensitivity,
      claheClipLimit,
      videoClipDuration,
      streamQuality,
      lowConfidenceCapture,
      autoIrNightSync,
    };
    if (onSaveSettings) {
      setIsSaving(true);
      try {
        await onSaveSettings(payload);
        setToastMessage('Configuration committed to edge node.');
      } catch (err) {
        setToastMessage(`Failed to save configuration: ${err.message || 'Server error'}`);
      } finally {
        setIsSaving(false);
        setTimeout(() => setToastMessage(''), 3500);
      }
    }
  };

  if (isConfigLoading) {
    return (
      <div className="settings-screen-container">
        <div className="glass-panel mono" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-muted-sage)' }}>
          <RefreshCw size={24} className="spin-icon" style={{ margin: '0 auto 12px', display: 'block' }} />
          <span>QUERYING EDGE HARDWARE CONFIGURATION...</span>
        </div>
      </div>
    );
  }

  if (configError || !serverConfig) {
    return (
      <div className="settings-screen-container">
        <div 
          className="glass-panel mono" 
          style={{ 
            padding: '30px', 
            textAlign: 'center', 
            border: '1px solid rgba(255, 77, 79, 0.3)',
            background: 'rgba(255, 77, 79, 0.08)'
          }}
        >
          <AlertTriangle size={32} style={{ color: '#ff7875', margin: '0 auto 14px', display: 'block' }} />
          <h2 style={{ fontSize: '16px', color: '#ff7875', marginBottom: '8px' }}>
            EDGE CONFIGURATION UNAVAILABLE
          </h2>
          <p style={{ color: 'var(--color-muted-sage)', fontSize: '13px', maxWidth: '540px', margin: '0 auto 20px', lineHeight: 1.6 }}>
            {configError || 'Unable to retrieve active hardware settings from edge device. Connect to the device gateway to inspect or modify configuration registers.'}
          </p>
          {onRetryFetchConfig && (
            <button 
              type="button" 
              onClick={onRetryFetchConfig}
              className="mono"
              style={{
                background: 'rgba(255, 77, 79, 0.25)',
                border: '1px solid #ff7875',
                color: '#fff',
                padding: '8px 18px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <RefreshCw size={13} />
              <span>RETRY CONFIGURATION SYNC</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-screen-container">
      {isDemoMode && (
        <div 
          className="mono demo-config-banner" 
          style={{
            background: 'rgba(250, 173, 20, 0.12)',
            border: '1px solid rgba(250, 173, 20, 0.3)',
            color: '#faad14',
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertTriangle size={14} />
          <span>DEMO MODE ACTIVE: Configuration shown is a sample preset. Changes will not be committed to physical hardware.</span>
        </div>
      )}

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
            <label className="field-label">WI-FI SSID (REPORTED)</label>
            <input 
              type="text" 
              className="field-input mono" 
              value={serverConfig.wifiSSID || 'Unconfigured'} 
              readOnly
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
          </div>

          <div className="setting-field">
            <label className="field-label">IP ADDRESS (REPORTED)</label>
            <input 
              type="text" 
              className="field-input mono" 
              value={serverConfig.ipAddress || 'Dynamic / DHCP'} 
              readOnly
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
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
              <span>BEARER / X-API-KEY AUTH ACTIVE</span>
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
            <button 
              className="save-btn mono" 
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save size={14} />
              <span>{isSaving ? 'COMMITTING...' : 'COMMIT CHANGES TO NOCTURPOD'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
