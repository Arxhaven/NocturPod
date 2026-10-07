import React, { useState } from 'react';
import { 
  Sliders, 
  CheckCircle2
} from 'lucide-react';
import './SettingsScreen.css';

export default function SettingsScreen({ deviceStatus, onSaveSettings }) {
  const [deviceName, setDeviceName] = useState(deviceStatus?.device_name || deviceStatus?.name || '');
  const [toastMessage, setToastMessage] = useState('');

  const handleSave = async () => {
    if (onSaveSettings) {
      await onSaveSettings({ deviceName });
    }
    setToastMessage('Configuration committed to edge node.');
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
        <div className="settings-card glass-panel">
          <div className="card-head">
            <span className="card-head-title">DEVICE CONFIGURATION</span>
            <span className="card-head-sub mono">NODE IDENTITY</span>
          </div>

          <div className="setting-field">
            <label className="field-label">DEVICE IDENTIFIER / HOSTNAME</label>
            <input 
              type="text" 
              className="text-input mono" 
              value={deviceName}
              placeholder="e.g. nocturpod-edge-01"
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>

          <div className="card-actions">
            <button className="save-btn mono" onClick={handleSave}>
              <span>SAVE CONFIGURATION</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
