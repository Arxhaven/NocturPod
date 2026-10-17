import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import StartupIntro from './components/StartupIntro.jsx';
import './index.css';

function NocturPodRoot() {
  const [showIntro, setShowIntro] = useState(true);
  const finishIntro = useCallback(() => setShowIntro(false), []);

  return (
    <>
      <App />
      {showIntro && <StartupIntro onComplete={finishIntro} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NocturPodRoot />
  </React.StrictMode>
);
