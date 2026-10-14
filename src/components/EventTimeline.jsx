import React from 'react';
import { resolveMediaUrl } from '../services/api';
import './EventTimeline.css';

function formatEventTime(timestamp) {
  if (!timestamp) return '--:--:--';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    return d.toTimeString().split(' ')[0];
  } catch {
    return String(timestamp);
  }
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 0 || diffSec < 15) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

function deriveEventLabel(event) {
  if (event.detections && event.detections.length > 0 && event.detections[0].label) {
    const lbl = event.detections[0].label;
    return lbl.charAt(0).toUpperCase() + lbl.slice(1);
  }
  if (event.label) return event.label;
  if (event.type === 'MANUAL_CAPTURE') return 'Manual Capture';
  if (event.type === 'VIDEO_RECORDING') return 'Video Recording';
  if (event.type) return event.type.replace(/_/g, ' ');
  return 'Capture';
}

function deriveEventConfidence(event) {
  if (event.detections && event.detections.length > 0 && event.detections[0].confidence != null) {
    return event.detections[0].confidence;
  }
  if (event.confidence != null) {
    return event.confidence;
  }
  return null;
}

export default function EventTimeline({ events, onSelectEvent, maxItems }) {
  const displayedEvents = maxItems ? events.slice(0, maxItems) : events;

  return (
    <div className="event-timeline-container">
      <div className="timeline-list">
        {displayedEvents.map((event, index) => {
          const isLatest = index === 0;
          const eventId = event.event_id || event.id;
          const rawThumb = event.enhanced_url || event.original_url || event.thumbnail;
          const thumbnail = resolveMediaUrl(rawThumb);
          const mediaType = event.media_type || event.mediaType || (event.type === 'VIDEO_RECORDING' ? 'VIDEO' : 'IMAGE');
          const label = deriveEventLabel(event);
          const confidence = deriveEventConfidence(event);
          const timeStr = formatEventTime(event.timestamp);
          const timeAgoStr = formatTimeAgo(event.timestamp);

          return (
            <div
              key={eventId || index}
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
                  <span className="entry-time mono">{timeStr}</span>
                  {timeAgoStr && <span className="entry-ago">{timeAgoStr}</span>}
                </div>

                <div className="entry-card glass-panel">
                  {thumbnail && (
                    <div className="entry-thumb-wrap">
                      <img src={thumbnail} alt={label} loading="lazy" />
                      {mediaType === 'VIDEO' && <span className="thumb-vid-tag mono">VIDEO</span>}
                    </div>
                  )}

                  <div className="entry-details">
                    <div className="entry-label-row">
                      <span className="entry-type-label">{label}</span>
                      {confidence != null && (
                        <span className="entry-conf mono">{(confidence * 100).toFixed(1)}%</span>
                      )}
                    </div>

                    <div className="entry-sub-row">
                      <span className="entry-category mono">{(event.type || 'EVENT').replace(/_/g, ' ')}</span>
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
