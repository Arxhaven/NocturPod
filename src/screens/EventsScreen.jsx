import React, { useState } from 'react';
import EventTimeline from '../components/EventTimeline';
import { 
  Search, 
  Activity
} from 'lucide-react';
import './EventsScreen.css';

export default function EventsScreen({ events = [], onSelectEvent }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = events.filter((evt) => {
    if (filterType !== 'ALL' && evt.type !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const eventId = (evt.event_id || evt.id || '').toLowerCase();
      const notes = (evt.notes || '').toLowerCase();
      return eventId.includes(q) || notes.includes(q);
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
            className={`filter-chip mono ${filterType === 'MANUAL_CAPTURE' ? 'active' : ''}`}
            onClick={() => setFilterType('MANUAL_CAPTURE')}
          >
            CAPTURES
          </button>
          <button 
            className={`filter-chip mono ${filterType === 'VIDEO_RECORDING' ? 'active' : ''}`}
            onClick={() => setFilterType('VIDEO_RECORDING')}
          >
            RECORDINGS
          </button>
        </div>

        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            className="search-input mono"
            placeholder="Search events by ID or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Timeline Stream */}
      <div className="events-timeline-card glass-panel">
        <div className="card-top-head">
          <span className="card-title">REAL HARDWARE EVENT LOG</span>
          <span className="card-count mono">{filteredEvents.length} RECORDED</span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="empty-state-panel">
            <Activity size={36} className="empty-icon" />
            <h3 className="empty-title">NO EVENTS RECORDED</h3>
            <p className="empty-sub mono">Operational events created by genuine captures and recordings will appear here.</p>
          </div>
        ) : (
          <div className="timeline-wrap">
            <EventTimeline 
              events={filteredEvents} 
              onSelectEvent={onSelectEvent} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
