import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  ZoomIn, 
  Camera, 
  Sparkles, 
  Crosshair,
  SlidersHorizontal,
  Grid,
  Maximize2
} from 'lucide-react';
import './ImagesScreen.css';

export default function ImagesScreen({ images, onSelectImage }) {
  const [filterTag, setFilterTag] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = images.filter((img) => {
    if (filterTag !== 'ALL' && img.aiTag !== filterTag) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        img.title.toLowerCase().includes(q) ||
        img.timestamp.toLowerCase().includes(q) ||
        (img.eventId && img.eventId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="images-screen-container">
      {/* Top Filter and Search Bar */}
      <div className="images-filter-bar glass-panel">
        <div className="img-chips">
          <button 
            className={`img-chip mono ${filterTag === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterTag('ALL')}
          >
            ALL CAPTURES ({images.length})
          </button>
          <button 
            className={`img-chip mono ${filterTag === 'Person' ? 'active' : ''}`}
            onClick={() => setFilterTag('Person')}
          >
            PERSON
          </button>
          <button 
            className={`img-chip mono ${filterTag === 'Vehicle' ? 'active' : ''}`}
            onClick={() => setFilterTag('Vehicle')}
          >
            VEHICLE
          </button>
          <button 
            className={`img-chip mono ${filterTag === 'Bicycle' ? 'active' : ''}`}
            onClick={() => setFilterTag('Bicycle')}
          >
            BICYCLE
          </button>
          <button 
            className={`img-chip mono ${filterTag === 'Animal' ? 'active' : ''}`}
            onClick={() => setFilterTag('Animal')}
          >
            LOW-CONFIDENCE
          </button>
        </div>

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

      {/* Grid of captures */}
      <div className="images-masonry-grid">
        {filtered.map((item) => (
          <div 
            key={item.id} 
            className="image-card glass-panel"
            onClick={() => onSelectImage(item)}
            role="button"
            tabIndex={0}
          >
            <div className="img-preview-box">
              <img src={item.thumbnail} alt={item.title} loading="lazy" />

              <div className="img-hover-actions">
                <span className="expand-pill mono">
                  <Maximize2 size={13} />
                  <span>INSPECT FULL RES</span>
                </span>
              </div>

              {item.claheApplied && (
                <span className="clahe-applied-badge mono" title="CLAHE low-light enhancement active">
                  CLAHE
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
                <span>{item.confidence ? (item.confidence * 100).toFixed(1) + '%' : 'N/A'}</span>
              </div>

              <div className="img-card-exp-row mono">
                <span>{item.resolution}</span>
                <span>{item.iso}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
