import React, { useState } from 'react';
import { CheckCircle2, Camera, Radar, Lightbulb, Save, AlertTriangle } from 'lucide-react';
import './SettingsScreen.css';

const STORAGE_KEY = 'nocturpod-hardware-settings-v1';
const DEFAULT_SETTINGS = {
  cameraSettings: { auto_exposure: true, exposure_time_us: 20000, analogue_gain: 3, auto_white_balance: true, brightness: 0, contrast: 1, saturation: 0.65, sharpness: 1 },
  pirSettings: { enabled: true, cooldown_seconds: 15 },
  lightingSettings: { mode: 'WHITE', white_intensity: 100, night_intensity: 100 },
};

function loadSavedSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      cameraSettings: { ...DEFAULT_SETTINGS.cameraSettings, ...(saved.cameraSettings || {}) },
      pirSettings: { ...DEFAULT_SETTINGS.pirSettings, ...(saved.pirSettings || {}) },
      lightingSettings: { ...DEFAULT_SETTINGS.lightingSettings, ...(saved.lightingSettings || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function SettingRange({ label, value, min, max, step, onChange, disabled = false, format = (v) => v, hint }) {
  return (
    <div className="setting-field">
      <div className="slider-label-row">
        <label className="field-label">{label}</label>
        <span className="slider-value mono">{format(value)}</span>
      </div>
      <input
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <span className="setting-hint">{hint}</span>}
    </div>
  );
}

export default function SettingsScreen({ deviceStatus, onSaveSettings }) {
  const [settings, setSettings] = useState(loadSavedSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastError, setToastError] = useState(false);

  const updateSection = (section, key, value) => {
    setSettings((previous) => ({
      ...previous,
      [section]: { ...previous[section], [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!onSaveSettings) {
      setToastMessage('Settings handler is unavailable.');
      setToastError(true);
      return;
    }
    setIsSaving(true);
    setToastMessage('');
    try {
      await onSaveSettings(settings);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // Hardware settings have still been queued even if browser storage is unavailable.
      }
      setToastMessage('Commands queued. Keep the Raspberry Pi agent online to apply them.');
      setToastError(false);
    } catch (error) {
      setToastMessage(error?.message || 'Could not queue settings.');
      setToastError(true);
    } finally {
      setIsSaving(false);
      setTimeout(() => setToastMessage(''), 6000);
    }
  };

  const camera = settings.cameraSettings;
  const pir = settings.pirSettings;
  const lighting = settings.lightingSettings;
  const nodeOnline = ['ONLINE', 'RECORDING'].includes(String(deviceStatus?.status || '').toUpperCase());

  return (
    <div className="settings-screen-container">
      {toastMessage && (
        <div className={'toast-notification mono ' + (toastError ? 'toast-error' : '')}>
          {toastError ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="settings-intro glass-panel">
        <div className="settings-intro-icon"><Camera size={20} /></div>
        <div className="settings-intro-copy">
          <h2>EDGE HARDWARE CONTROLS</h2>
          <p>Settings are sent to the Raspberry Pi agent and saved there after the active hardware driver accepts them.</p>
        </div>
        <span className={'hardware-state mono ' + (nodeOnline ? 'hardware-online' : 'hardware-offline')}>
          {nodeOnline ? 'EDGE ONLINE' : 'EDGE STATUS UNCONFIRMED'}
        </span>
      </div>

      <div className="settings-grid">
        <section className="settings-card settings-card-wide glass-panel">
          <div className="card-head">
            <div className="card-title-line"><Camera size={16} /><span className="card-head-title">CAMERA EXPOSURE & CLARITY</span></div>
            <span className="card-head-sub mono">OV5647 / LIBCAMERA · DRIVER-SUPPORTED CONTROLS ONLY</span>
          </div>

          <label className="checkbox-wrap">
            <input
              type="checkbox"
              checked={camera.auto_exposure}
              onChange={(event) => updateSection('cameraSettings', 'auto_exposure', event.target.checked)}
            />
            <span className="cb-label">Automatic exposure (recommended for changing light)</span>
          </label>

          <div className="setting-control-grid">
            <SettingRange
              label="MANUAL EXPOSURE TIME"
              value={camera.exposure_time_us}
              min={1000} max={60000} step={1000}
              disabled={camera.auto_exposure}
              onChange={(value) => updateSection('cameraSettings', 'exposure_time_us', value)}
              format={(value) => (value / 1000).toFixed(0) + ' ms'}
              hint="Longer exposure brightens dark scenes but can blur moving people."
            />
            <SettingRange
              label="SENSOR ANALOGUE GAIN"
              value={camera.analogue_gain}
              min={1} max={8} step={0.5}
              disabled={camera.auto_exposure}
              onChange={(value) => updateSection('cameraSettings', 'analogue_gain', value)}
              format={(value) => value.toFixed(1) + '×'}
              hint="Gain behaves like an ISO control; high gain amplifies image noise."
            />
            <SettingRange
              label="BRIGHTNESS"
              value={camera.brightness}
              min={-1} max={1} step={0.1}
              onChange={(value) => updateSection('cameraSettings', 'brightness', value)}
              format={(value) => value.toFixed(1)}
            />
            <SettingRange
              label="CONTRAST"
              value={camera.contrast}
              min={0.5} max={2} step={0.1}
              onChange={(value) => updateSection('cameraSettings', 'contrast', value)}
              format={(value) => value.toFixed(1) + '×'}
            />
            <SettingRange
              label="COLOR SATURATION"
              value={camera.saturation}
              min={0} max={2} step={0.05}
              onChange={(value) => updateSection('cameraSettings', 'saturation', value)}
              format={(value) => value.toFixed(2) + '×'}
              hint="Set to 0 for grayscale night images if IR light causes red/purple color casts."
            />
            <SettingRange
              label="SHARPNESS"
              value={camera.sharpness}
              min={0} max={2} step={0.1}
              onChange={(value) => updateSection('cameraSettings', 'sharpness', value)}
              format={(value) => value.toFixed(1) + '×'}
              hint="Excessive sharpening can make sensor grain and halos worse."
            />
          </div>

          <label className="checkbox-wrap">
            <input
              type="checkbox"
              checked={camera.auto_white_balance}
              onChange={(event) => updateSection('cameraSettings', 'auto_white_balance', event.target.checked)}
            />
            <span className="cb-label">Automatic white balance</span>
          </label>
          <p className="settings-note">Camera-driver support varies. If a control is not supported, the Pi agent reports it instead of claiming it was applied.</p>
        </section>

        <section className="settings-card glass-panel">
          <div className="card-head">
            <div className="card-title-line"><Radar size={16} /><span className="card-head-title">PIR MOTION TRIGGER</span></div>
            <span className="card-head-sub mono">HC-SR501 · BCM GPIO 17 / PHYSICAL PIN 11</span>
          </div>

          <label className="checkbox-wrap">
            <input
              type="checkbox"
              checked={pir.enabled}
              onChange={(event) => updateSection('pirSettings', 'enabled', event.target.checked)}
            />
            <span className="cb-label">Enable motion-triggered still capture</span>
          </label>

          <SettingRange
            label="MOTION CAPTURE COOLDOWN"
            value={pir.cooldown_seconds}
            min={5} max={120} step={5}
            onChange={(value) => updateSection('pirSettings', 'cooldown_seconds', value)}
            format={(value) => value + ' sec'}
            hint="Prevents repeated images while the PIR output stays high."
          />

          <div className="settings-note">
            HC-SR501 OUT must connect to BCM GPIO 17, with common GND. Allow the sensor to warm up after reboot. If GPIO cannot initialize, enabling PIR fails visibly in the agent log.
          </div>
        </section>

        <section className="settings-card glass-panel">
          <div className="card-head">
            <div className="card-title-line"><Lightbulb size={16} /><span className="card-head-title">ILLUMINATION</span></div>
            <span className="card-head-sub mono">WHITE / NIGHT / AUTO</span>
          </div>

          <div className="setting-field">
            <label className="field-label">LIGHTING MODE</label>
            <select
              className="field-select mono"
              value={lighting.mode}
              onChange={(event) => updateSection('lightingSettings', 'mode', event.target.value)}
            >
              <option value="WHITE">WHITE · NORMAL LIGHT</option>
              <option value="NIGHT">NIGHT · IR DRIVER</option>
              <option value="AUTO">AUTO · FRAME-LUMINANCE SWITCHING</option>
            </select>
          </div>

          <SettingRange
            label="WHITE LIGHT INTENSITY"
            value={lighting.white_intensity}
            min={0} max={100} step={5}
            onChange={(value) => updateSection('lightingSettings', 'white_intensity', value)}
            format={(value) => value + '%'}
            hint="Dimming requires a PWM-compatible LED driver."
          />
          <SettingRange
            label="NIGHT / IR LIGHT INTENSITY"
            value={lighting.night_intensity}
            min={0} max={100} step={5}
            onChange={(value) => updateSection('lightingSettings', 'night_intensity', value)}
            format={(value) => value + '%'}
            hint="Leave at 100% for relay-only outputs; do not PWM a mechanical relay."
          />
          <p className="settings-note">AUTO uses live frame luminance and hysteresis, not a dedicated ambient-light sensor. IR LEDs may still glow red physically; saturation controls affect recorded color, not emitted wavelength.</p>
        </section>
      </div>

      <div className="settings-save-row">
        <button type="button" className="save-btn mono" onClick={handleSave} disabled={isSaving}>
          <Save size={15} />
          <span>{isSaving ? 'QUEUEING SETTINGS…' : 'APPLY HARDWARE SETTINGS'}</span>
        </button>
      </div>
    </div>
  );
}
