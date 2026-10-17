import React, { useEffect, useState } from 'react';
import './StartupIntro.css';

/**
 * A short, silent boot sequence. The app is already mounted behind this overlay,
 * so startup animation playback never blocks API polling or device communication.
 */
export default function StartupIntro({ onComplete }) {
  const [closing, setClosing] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => setClosing(true), 2700);
    const finishTimer = window.setTimeout(() => onComplete?.(), 3100);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`startup-intro ${closing ? 'is-closing' : ''}`}
      role="status"
      aria-label="Starting NocturPod"
    >
      {!videoFailed && (
        <video
          className="startup-intro-video"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setClosing(true)}
          onError={() => setVideoFailed(true)}
        >
          <source src="/nocturpod-intro.mp4" type="video/mp4" />
        </video>
      )}
      {videoFailed && (
        <div className="startup-intro-fallback" aria-hidden="true">
          <h1>NocturPod</h1>
        </div>
      )}
    </div>
  );
}
