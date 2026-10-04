import React, { useState } from 'react';
import { 
  Play, 
  Film, 
  Search, 
  Calendar, 
  Clock, 
  HardDrive, 
  Download,
  Filter,
  Eye
} from 'lucide-react';
import './FootageScreen.css';

export default function FootageScreen({ footageList, onSelectVideo }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');

  const filtered = footageList.filter((item) => {
    if (selectedTag !== 'ALL' && item.aiTag !== selectedTag) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.timestamp.toLowerCase().includes(q) ||
        item.camera.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="footage-screen-container">
      {/* Top Filter and Search Bar */}
      <div className="footage-filter-bar glass-panel">
        <div className="filter-chips">
          <button 
            className={`f-chip mono ${selectedTag === 'ALL' ? 'active' : ''}`}
            onClick={() => setSelectedTag('ALL')}
          >
            ALL CLIPS ({footageList.length})
          </button>
          <button 
            className={`f-chip mono ${selectedTag === 'Person' ? 'active' : ''}`}
            onClick={() => setSelectedTag('Person')}
          >
            PERSON
          </button>
          <button 
            className={`f-chip mono ${selectedTag === 'Vehicle' ? 'active' : ''}`}
            onClick={() => setSelectedTag('Vehicle')}
          >
            VEHICLE
          </button>
          <button 
            className={`f-chip mono ${selectedTag === 'Animal' ? 'active' : ''}`}
            onClick={() => setSelectedTag('Animal')}
          >
            ANIMAL / OTHER
          </button>
        </div>

        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            className="search-input mono"
            placeholder="Search clips by sector, time, tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of recorded clips */}
      <div className="footage-grid">
        {filtered.map((clip) => (
          <div 
            key={clip.id} 
            className="footage-card glass-panel"
            onClick={() => onSelectVideo(clip)}
            role="button"
            tabIndex={0}
          >
            <div className="footage-thumb-container">
              <img src={clip.thumbnail} alt={clip.title} loading="lazy" />
              <div className="play-overlay">
                <div className="play-circle">
                  <Play size={18} fill="currentColor" />
                </div>
              </div>
              <span className="duration-tag mono">{clip.duration}</span>
              <span className="res-tag mono">{clip.resolution.split(' ')[0]}</span>
            </div>

            <div className="footage-info">
              <div className="footage-title-row">
                <h3 className="footage-title">{clip.title}</h3>
                <span className="footage-ai-pill mono">{clip.aiTag} ({clip.confidence})</span>
              </div>

              <div className="footage-meta-row mono">
                <span>{clip.timestamp}</span>
                <span>{clip.fileSize}</span>
              </div>

              <div className="footage-hardware-row mono">
                <span>CAM: {clip.camera}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
