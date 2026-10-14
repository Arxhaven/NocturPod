import React, { useState } from 'react';
import { 
  Search, 
  Camera, 
  Sparkles, 
  Crosshair,
  Maximize2,
  RefreshCw,
  ImageOff
} from 'lucide-react';
import './ImagesScreen.css';

export default function ImagesScreen({ 
  images = [], 
  onSelectImage, 
  onRefreshImages, 
  isRefreshing = false 
}) {
  const [filterTag, setFilterTag] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [brokenImages, setBrokenImages] = useState(new Set());

  const handleImageError = (id) => {
    setBrokenImages((prev) => new Set(prev).add(id));
  };

  const filtered = images.filter((img) => {
    if (filterTag !== 'ALL' && img.aiTag !== filterTag) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = (img.title || '').toLowerCase().includes(q);
      const timeMatch = (img.timestamp || '').toLowerCase().includes(q);
      const eventMatch = (img.eventId || img.id || '').toLowerCase().includes(q);
      const tagMatch = (img.aiTag || '').toLowerCase().includes(q);
      return titleMatch || timeMatch || eventMatch || tagMatch;
    }
    return true;
  });

  return (
    <div className="images-screen-container">
      {/* Top Filter and Search Bar */}
      <div className="images-filter-bar glass-panel">
        <div className="img-chips">
          <button 
            type="button"
            className={`img-chip mono ${filterTag === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterTag('ALL')}
          >
            ALL CAPTURES ({images.length})
          </button>
          <button 
            type="button"
            className={`img-chip mono ${filterTag === 'Person' ? 'active' : ''}`}
            onClick={() => setFilterTag('Person')}
          >
            PERSON
          </button>
          <button 
            type="button"
            className={`img-chip mono ${filterTag === 'Vehicle' ? 'active' : ''}`}
            onClick={() => setFilterTag('Vehicle')}
          >
            VEHICLE
          </button>
          <button 
            type="button"
            className={`img-chip mono ${filterTag === 'Manual' ? 'active' : ''}`}
            onClick={() => setFilterTag('Manual')}
          >
            MANUAL SNAPSHOTS
          </button>
          <button 
            type="button"
            className={`img-chip mono ${filterTag === 'Animal' ? 'active' : ''}`}
            onClick={() => setFilterTag('Animal')}
          >
            ANIMAL / LOW-CONF
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onRefreshImages && (
            <button 
              type="button"
              className="img-chip mono"
              onClick={onRefreshImages}
              disabled={isRefreshing}
              title="Refresh captured images from backend storage"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <RefreshCw size={12} className={isRefreshing ? 'spin-icon' : ''} />
              <span>{isRefreshing ? 'REFRESHING...' : 'REFRESH'}</span>
            </button>
          )}

          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              className="search-input mono"
              placeholder="Search captures by ID, time, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Grid of captures */}
      {filtered.length === 0 ? (
        <div 
          className="glass-panel mono" 
          style={{ 
            padding: '60px 20px', 
            textAlign: 'center', 
            color: 'var(--color-muted-sage)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <Camera size={40} style={{ opacity: 0.5 }} />
          <span style={{ fontSize: '13px', letterSpacing: '0.05em', color: 'var(--color-light-green)' }}>
            NO CAPTURES RECORDED
          </span>
          <p style={{ fontSize: '11px', maxWidth: '420px', margin: 0, opacity: 0.8 }}>
            No images found matching criteria. Trigger a snapshot using the header button or check back when motion occurs.
          </p>
          {onRefreshImages && (
            <button
              type="button"
              onClick={onRefreshImages}
              className="img-chip mono active"
              style={{ marginTop: '8px', cursor: 'pointer' }}
            >
              RE-SYNC STORAGE
            </button>
          )}
        </div>
      ) : (
        <div className="images-masonry-grid">
          {filtered.map((item) => {
            const isBroken = brokenImages.has(item.id);
            const displayUrl = item.thumbnail || item.url || item.originalUrl;

            return (
              <div 
                key={item.id} 
                className="image-card glass-panel"
                onClick={() => onSelectImage && onSelectImage(item)}
                role="button"
                tabIndex={0}
              >
                <div className="img-preview-box">
                  {displayUrl && !isBroken ? (
                    <img 
                      src={displayUrl} 
                      alt={item.title || 'Camera snapshot'} 
                      loading="lazy" 
                      onError={() => handleImageError(item.id)}
                    />
                  ) : (
                    <div 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        background: '#041718',
                        color: 'var(--color-muted-sage)',
                        gap: '6px'
                      }}
                    >
                      <ImageOff size={24} style={{ opacity: 0.6 }} />
                      <span className="mono" style={{ fontSize: '9px', opacity: 0.7 }}>
                        {isBroken ? 'MEDIA ACCESS EXPIRED' : 'IMAGE PENDING'}
                      </span>
                    </div>
                  )}

                  <div className="img-hover-actions">
                    <span className="expand-pill mono">
                      <Maximize2 size={13} />
                      <span>INSPECT FULL RES</span>
                    </span>
                  </div>

                  {item.enhancedUrl && (
                    <span className="clahe-applied-badge mono" title="AI Enhanced CLAHE image ready">
                      ENHANCED
                    </span>
                  )}

                  {item.aiStatus === 'PROCESSING' && (
                    <span 
                      className="clahe-applied-badge mono" 
                      style={{ background: 'rgba(250, 173, 20, 0.85)', color: '#000', borderColor: '#faad14' }}
                      title="AI inference in progress"
                    >
                      AI PENDING
                    </span>
                  )}

                  {item.boundingBoxes && item.boundingBoxes.length > 0 && (
                    <span className="bbox-detected-badge mono">
                      {item.boundingBoxes.length} TARGET
                    </span>
                  )}
                </div>

                <div className="img-card-details">
                  <div className="img-card-top-row">
                    <span className="img-card-title">{item.title}</span>
                    <span className="img-card-tag mono">{item.aiTag}</span>
                  </div>

                  <div className="img-card-meta-row mono">
                    <span>{item.timestamp}</span>
                    <span>
                      {item.confidence != null ? (item.confidence <= 1 ? (item.confidence * 100).toFixed(1) + '%' : `${item.confidence}%`) : 'OPTICAL'}
                    </span>
                  </div>

                  <div className="img-card-exp-row mono">
                    <span>{item.resolution || '1280×720 (OV5647)'}</span>
                    <span>{item.eventId ? item.eventId.slice(-12) : 'EDGE-NODE'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
