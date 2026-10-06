-- NocturPod Supabase PostgreSQL Production Schema
-- Run this migration in Supabase Dashboard -> SQL Editor

-- 1. Devices Table: Tracks hardware edge devices, network, and operational metrics
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    hardware_model TEXT NOT NULL,
    camera_model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OFFLINE', -- ONLINE, OFFLINE, CAPTURING, RECORDING, PROCESSING
    camera_status TEXT NOT NULL DEFAULT 'OFFLINE', -- ONLINE, OFFLINE
    wifi_status TEXT NOT NULL DEFAULT 'DISCONNECTED',
    wifi_ssid TEXT,
    wifi_rssi INTEGER,
    ip_address TEXT,
    storage_used_gb REAL DEFAULT 0,
    storage_total_gb REAL DEFAULT 0,
    cpu_temp_c REAL,
    cpu_usage_percent REAL,
    ram_usage_percent REAL,
    uptime_seconds INTEGER DEFAULT 0,
    software_version TEXT,
    ai_model_version TEXT,
    stream_fps INTEGER DEFAULT 15,
    stream_resolution TEXT DEFAULT '1280x720',
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Events Table: Distinct sensor/capture events with unique NP_YYYYMMDD_HHMMSS_### IDs
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- MANUAL_CAPTURE, VIDEO_RECORDING
    status TEXT NOT NULL DEFAULT 'CAPTURE_REQUESTED', -- CAPTURE_REQUESTED, CAPTURED, RECORDING, RECORDED, COMPLETE, FAILED
    ai_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETE, FAILED
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration TEXT DEFAULT '0s',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Media Assets Table: Separate tracks for ORIGINAL and ENHANCED media
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    media_type TEXT NOT NULL, -- IMAGE, VIDEO
    variant TEXT NOT NULL,    -- ORIGINAL, ENHANCED
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    resolution TEXT DEFAULT '1280x720',
    duration TEXT DEFAULT '0s',
    processing_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETE, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Detections Table: Object bounding boxes and confidence scores
CREATE TABLE IF NOT EXISTS detections (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    confidence REAL NOT NULL,
    x1 REAL NOT NULL,
    y1 REAL NOT NULL,
    x2 REAL NOT NULL,
    y2 REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Device Commands Table: Queue for commands dispatched to the Raspberry Pi
CREATE TABLE IF NOT EXISTS device_commands (
    command_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- CAPTURE_IMAGE, START_RECORDING, STOP_RECORDING
    payload JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, DISPATCHED, EXECUTED, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    error_message TEXT
);

-- 6. System Logs Table: Structured operational audit trail
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL, -- INFO, WARNING, ERROR
    source TEXT NOT NULL, -- DASHBOARD, EDGE_AGENT, BACKEND, AI_ENGINE
    message TEXT NOT NULL
);

-- Indexes for optimal querying
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_device_id ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_event_id ON media_assets(event_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_variant ON media_assets(variant);
CREATE INDEX IF NOT EXISTS idx_commands_status ON device_commands(status, device_id);
CREATE INDEX IF NOT EXISTS idx_detections_event_id ON detections(event_id);

-- Storage bucket creation instruction:
-- In Supabase Dashboard -> Storage -> New Bucket:
-- Name: nocturpod-media
-- Public: Unchecked (private; backend generates secure signed URLs for frontend display/download)
