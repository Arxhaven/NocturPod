/**
 * NocturPod Data Models & Mock Data Layer
 * Designed to mirror future Raspberry Pi, backend database (SQLite detections),
 * and live-inference pipeline structures.
 */

export const INITIAL_DEVICE_STATUS = {
  id: "nocturpod-edge-01",
  name: "NocturPod α-1",
  hardware: "Raspberry Pi 4 Model B (4GB)",
  cameraModel: "Sony/OmniVision OV5647 Night-Vision IR-Cut",
  pirSensor: "AM312 Micro PIR Pyroelectric",
  irEmitter: "850nm High-Output Dual Matrix",
  batteryBank: "20,000mAh PD3.0 Rugged Power Unit",
  status: "ONLINE", // ONLINE, OFFLINE, ARMED, CAPTURING, RECORDING, PROCESSING, READY, WARNING, ERROR
  cameraStatus: "ONLINE",
  pirStatus: "ARMED",
  wifiStatus: "CONNECTED",
  wifiSSID: "NocturNet-Secure-5G",
  wifiRssi: -58,
  ipAddress: "192.168.1.142",
  storageUsedGB: 18.4,
  storageTotalGB: 64.0,
  batteryPercent: 88,
  batteryVoltage: "11.8V",
  powerSource: "BATTERY_DISCHARGING", // BATTERY_DISCHARGING, AC_CHARGING
  cpuTempC: 44.8,
  cpuUsagePercent: 28,
  ramUsagePercent: 41,
  uptimeHours: 54,
  uptimeMinutes: 22,
  lastHeartbeatSec: 2,
  streamFps: 24,
  streamResolution: "1920×1080",
  claheEnabled: true,
  irNightMode: "AUTO_ACTIVE"
};

export const INITIAL_METRICS = {
  motionEventsToday: 19,
  capturesToday: 42,
  recordedMinutesToday: 68,
  aiDetectionsToday: 31,
  uptimeStr: "2d 06h 22m",
  healthScore: "99.4%"
};

export const INITIAL_EVENTS = [
  {
    id: "evt-109",
    deviceId: "nocturpod-edge-01",
    timestamp: "2026-09-30 12:31:04",
    timeAgo: "5m ago",
    type: "MOTION_TRIGGERED",
    label: "Person detected",
    confidence: 0.942,
    aiStatus: "COMPLETE",
    duration: "14s",
    deviceStatus: "READY",
    thumbnail: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=600&q=80",
    fullMediaUrl: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1600&q=85",
    mediaType: "IMAGE",
    detections: [
      { label: "person", confidence: 0.942, box: [140, 80, 420, 580] }
    ],
    notes: "PIR trip in Sector Alpha (South Entryway). IR-Cut filter activated."
  },
  {
    id: "evt-108",
    deviceId: "nocturpod-edge-01",
    timestamp: "2026-09-30 11:48:19",
    timeAgo: "48m ago",
    type: "FOOTAGE_RECORDED",
    label: "Vehicle (Van) passing",
    confidence: 0.884,
    aiStatus: "COMPLETE",
    duration: "42s",
    deviceStatus: "READY",
    thumbnail: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80",
    fullMediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    mediaType: "VIDEO",
    detections: [
      { label: "car", confidence: 0.884, box: [80, 160, 540, 480] }
    ],
    notes: "Edge-triggered 1080p clip saved to local SSD."
  },
  {
    id: "evt-107",
    deviceId: "nocturpod-edge-01",
    timestamp: "2026-09-30 10:15:42",
    timeAgo: "2h ago",
    type: "UNIDENTIFIED_TARGET",
    label: "Low-light ambiguous motion",
    confidence: 0.512,
    aiStatus: "STORED_FOR_INSPECTION",
    duration: "08s",
    deviceStatus: "READY",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
    fullMediaUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=85",
    mediaType: "IMAGE",
    detections: [
      { label: "animal / dog", confidence: 0.512, box: [220, 240, 380, 410] }
    ],
    notes: "EvidenceWorker queued crop to storage/detections.sqlite with CLAHE sharpening."
  },
  {
    id: "evt-106",
    deviceId: "nocturpod-edge-01",
    timestamp: "2026-09-30 08:02:11",
    timeAgo: "4h ago",
    type: "MOTION_TRIGGERED",
    label: "Bicycle / Courier",
    confidence: 0.915,
    aiStatus: "COMPLETE",
    duration: "18s",
    deviceStatus: "READY",
    thumbnail: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80",
    fullMediaUrl: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1600&q=85",
    mediaType: "IMAGE",
    detections: [
      { label: "bicycle", confidence: 0.915, box: [190, 110, 450, 490] }
    ],
    notes: "Perimeter gate traversal recorded."
  },
  {
    id: "evt-105",
    deviceId: "nocturpod-edge-01",
    timestamp: "2026-09-30 04:12:30",
    timeAgo: "8h ago",
    type: "FOOTAGE_RECORDED",
    label: "Night perimeter sweep",
    confidence: 0.965,
    aiStatus: "COMPLETE",
    duration: "60s",
    deviceStatus: "READY",
    thumbnail: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=600&q=80",
    fullMediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    mediaType: "VIDEO",
    detections: [
      { label: "person", confidence: 0.965, box: [260, 90, 430, 520] }
    ],
    notes: "IR illumination active (850nm). Zero ambient illumination."
  }
];

export const INITIAL_FOOTAGE = [
  {
    id: "vid-501",
    title: "Sector-A North Walkway Motion",
    timestamp: "2026-09-30 11:48:19",
    duration: "00:42",
    resolution: "1920×1080 24FPS",
    fileSize: "38.4 MB",
    camera: "OV5647 IR-Cut",
    aiTag: "Vehicle",
    confidence: "88.4%",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    thumbnail: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=800&q=80",
    detections: ["car (88.4%)"]
  },
  {
    id: "vid-502",
    title: "Sector-C Perimeter Low-Light IR Sweep",
    timestamp: "2026-09-30 04:12:30",
    duration: "01:00",
    resolution: "1920×1080 24FPS",
    fileSize: "54.1 MB",
    camera: "OV5647 IR-Cut (850nm)",
    aiTag: "Person",
    confidence: "96.5%",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    thumbnail: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80",
    detections: ["person (96.5%)"]
  },
  {
    id: "vid-503",
    title: "East Garden Gate Motion Burst",
    timestamp: "2026-09-29 23:14:05",
    duration: "00:35",
    resolution: "1920×1080 24FPS",
    fileSize: "29.7 MB",
    camera: "OV5647 IR-Cut (850nm)",
    aiTag: "Animal",
    confidence: "72.1%",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
    detections: ["animal (72.1%)"]
  },
  {
    id: "vid-504",
    title: "Front Courtyard Package Delivery",
    timestamp: "2026-09-29 16:40:12",
    duration: "00:52",
    resolution: "1920×1080 24FPS",
    fileSize: "44.2 MB",
    camera: "OV5647 Day Mode",
    aiTag: "Person",
    confidence: "98.1%",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
    thumbnail: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=800&q=80",
    detections: ["person (98.1%)", "motorcycle (85.2%)"]
  }
];

export const INITIAL_IMAGES = [
  {
    id: "img-301",
    title: "Night Entryway Silhouette",
    timestamp: "2026-09-30 12:31:04",
    resolution: "1920×1080",
    iso: "ISO 1600 (Night IR)",
    shutter: "1/40s",
    url: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1600&q=85",
    thumbnail: "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=600&q=80",
    aiTag: "Person",
    confidence: 0.942,
    eventId: "evt-109",
    claheApplied: true,
    boundingBoxes: [
      { label: "Person", confidence: 0.942, x1: 22, y1: 15, x2: 68, y2: 85 }
    ]
  },
  {
    id: "img-302",
    title: "Courier Bicycle Ingress",
    timestamp: "2026-09-30 08:02:11",
    resolution: "1920×1080",
    iso: "ISO 400",
    shutter: "1/120s",
    url: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1600&q=85",
    thumbnail: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80",
    aiTag: "Bicycle",
    confidence: 0.915,
    eventId: "evt-106",
    claheApplied: true,
    boundingBoxes: [
      { label: "Bicycle", confidence: 0.915, x1: 30, y1: 25, x2: 75, y2: 82 }
    ]
  },
  {
    id: "img-303",
    title: "Low-Light Ambiguous Perimeter Object",
    timestamp: "2026-09-30 10:15:42",
    resolution: "1920×1080",
    iso: "ISO 3200",
    shutter: "1/25s",
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=85",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
    aiTag: "Animal",
    confidence: 0.512,
    eventId: "evt-107",
    claheApplied: true,
    boundingBoxes: [
      { label: "Animal (Low Conf)", confidence: 0.512, x1: 38, y1: 42, x2: 64, y2: 70 }
    ]
  },
  {
    id: "img-304",
    title: "Rear Alleyway Low Angle",
    timestamp: "2026-09-29 21:05:18",
    resolution: "1920×1080",
    iso: "ISO 2400 (IR Active)",
    shutter: "1/30s",
    url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1600&q=85",
    thumbnail: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=600&q=80",
    aiTag: "Person",
    confidence: 0.965,
    eventId: "evt-105",
    claheApplied: true,
    boundingBoxes: [
      { label: "Person", confidence: 0.965, x1: 40, y1: 18, x2: 68, y2: 88 }
    ]
  },
  {
    id: "img-305",
    title: "Suburban Road Vehicle Snapshot",
    timestamp: "2026-09-29 18:22:45",
    resolution: "1920×1080",
    iso: "ISO 800",
    shutter: "1/60s",
    url: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1600&q=85",
    thumbnail: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80",
    aiTag: "Vehicle",
    confidence: 0.884,
    eventId: "evt-108",
    claheApplied: true,
    boundingBoxes: [
      { label: "Car", confidence: 0.884, x1: 15, y1: 30, x2: 85, y2: 80 }
    ]
  },
  {
    id: "img-306",
    title: "Late Night Front Driveway View",
    timestamp: "2026-09-29 02:40:11",
    resolution: "1920×1080",
    iso: "ISO 3200",
    shutter: "1/20s",
    url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1600&q=85",
    thumbnail: "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=600&q=80",
    aiTag: "Clear",
    confidence: 0.991,
    eventId: null,
    claheApplied: true,
    boundingBoxes: []
  }
];

export const INITIAL_AI_SUMMARY = {
  totalAnalyzedToday: 73,
  processingStatus: "COMPLETE", // QUEUED, PROCESSING, COMPLETE, FAILED
  queueLength: 0,
  latencyMs: 38,
  modelName: "YOLOv8n-LowLight (NCNN INT8)",
  claheClipLimit: "1.8 - 2.5 adaptive",
  classesTracked: [
    { label: "Person", countToday: 18, avgConfidence: 94.2, status: "High Priority" },
    { label: "Vehicle / Car", countToday: 9, avgConfidence: 88.2, status: "Standard" },
    { label: "Bicycle / Bike", countToday: 3, avgConfidence: 91.5, status: "Standard" },
    { label: "Animal / Unknown", countToday: 1, avgConfidence: 51.2, status: "Review" }
  ],
  pipelineStages: [
    { step: "PIR Trigger (AM312)", timeUs: "120µs", status: "Nominal" },
    { step: "OV5647 Frame Capture", timeUs: "41.6ms", status: "Nominal" },
    { step: "Adaptive CLAHE Normalization", timeUs: "7.2ms", status: "Active" },
    { step: "NCNN Edge Inference", timeUs: "38.1ms", status: "Nominal" },
    { step: "EvidenceWorker Async DB Write", timeUs: "3.4ms (async)", status: "Idle" }
  ]
};
