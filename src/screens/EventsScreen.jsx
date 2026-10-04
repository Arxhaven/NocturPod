import React, { useState } from 'react';
import EventTimeline from '../components/EventTimeline';
import { 
  Filter, 
  Search, 
  Calendar, 
  Activity, 
  ShieldAlert, 
  Camera, 
  Film,
  Download
} from 'lucide-react';
import './EventsScreen.css';

export default function EventsScreen({ events, onSelectEvent }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = events.filter((evt) => {
    if (filterType !== 'ALL' && evt.type !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        evt.label.toLowerCase().includes(q) ||
        evt.type.toLowerCase().includes(q) ||
        evt.timestamp.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="events-screen-container">
      {/* Filter and Search Bar */}
      <div className="events-filter-bar glass-panel">
        <div className="filter-chips">
          <button 
            className={`filter-chip mono ${filterType === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterType('ALL')}
          >
            ALL EVENTS ({events.length})
          </button>
          <button 
            className={`filter-chip mono ${filterType === 'MOTION_TRIGGERED' ? 'active' : ''}`}
            onClick={() => setFilterType('MOTION_TRIGGERED')}
          >
            PIR MOTION
          </button>
          <button 
            className={`filter-chip mono ${filterType === 'FOOTAGE_RECORDED' ? 'active' : ''}`}
            onClick={() => setFilterType('FOOTAGE_RECORDED')}
          >
            RECORDINGS
          </button>
          <button 
            className={`filter-chip mono ${filterType === 'UNIDENTIFIED_TARGET' ? 'active' : ''}`}
            onClick={() => setFilterType('UNIDENTIFIED_TARGET')}
          >
            LOW CONFIDENCE / AMBIGUOUS
          </button>
        </div>

        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input 
            type="text"
            className="search-input mono"
            placeholder="Search event label, timestamp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Timeline Stream */}
      <div className="events-timeline-card glass-panel">
        <div className="card-top-head">
          <span className="card-title">CHRONOLOGICAL SENSOR AUDIT TIMELINE</span>
          <span className="card-count mono">{filteredEvents.length} MATCHING EVENTS</span>
        </div>

        <div className="timeline-wrap">
          <EventTimeline 
            events={filteredEvents} 
            onSelectEvent={onSelectEvent} 
          />
        </div>
      </div>
    </div>
  );
}
