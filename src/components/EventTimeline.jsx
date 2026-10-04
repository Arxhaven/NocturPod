import React from 'react';
import './EventTimeline.css';

export default function EventTimeline({ events, onSelectEvent, maxItems }) {
  const displayedEvents = maxItems ? events.slice(0, maxItems) : events;

  return (
    <div className="event-timeline-container">
      <div className="timeline-list">
        {displayedEvents.map((event, index) => {
          const isLatest = index === 0;
          return (
            <div 
              key={event.id} 
              className={`timeline-entry ${isLatest ? 'latest' : ''}`}
              onClick={() => onSelectEvent && onSelectEvent(event)}
              role="button"
              tabIndex={0}
            >
              <div className="entry-rail">
                <div className="rail-node" />
                {index < displayedEvents.length - 1 && <div className="rail-line" />}
              </div>

              <div className="entry-content">
                <div className="entry-header">
                  <span className="entry-time mono">{event.timestamp.split(' ')[1] || event.timestamp}</span>
                  <span className="entry-ago">{event.timeAgo}</span>
                </div>

                <div className="entry-card glass-panel">
                  {event.thumbnail && (
                    <div className="entry-thumb-wrap">
                      <img src={event.thumbnail} alt={event.label} loading="lazy" />
                      {event.mediaType === 'VIDEO' && <span className="thumb-vid-tag mono">VIDEO</span>}
                    </div>
                  )}

                  <div className="entry-details">
                    <div className="entry-label-row">
                      <span className="entry-type-label">{event.label}</span>
                      {event.confidence && (
                        <span className="entry-conf mono">{(event.confidence * 100).toFixed(1)}%</span>
                      )}
                    </div>

                    <div className="entry-sub-row">
                      <span className="entry-category mono">{event.type.replace(/_/g, ' ')}</span>
                      {event.duration && <span className="entry-duration mono">LEN: {event.duration}</span>}
                    </div>

                    {event.notes && (
                      <p className="entry-notes">{event.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
