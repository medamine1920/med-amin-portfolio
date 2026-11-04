import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import Site from './site/Site.jsx';

// The editor (and its styles) is a separate chunk, so public visitors never download it.
const Admin = lazy(() => import('./admin.jsx'));
const isAdmin = location.pathname.startsWith('/admin');

function App() {
  const [site, setSite] = useState(null), [error, setError] = useState('');
  useEffect(() => { if (!isAdmin) api('/api/site').then(r => setSite(r.content)).catch(e => setError(e.message)); }, []);
  if (isAdmin) return <Suspense fallback={<div className="screen-message">Loading editor…</div>}><Admin /></Suspense>;
  if (error) return <div className="screen-message">Portfolio unavailable. Please try again later.</div>;
  return site ? <Site data={site} /> : <div className="screen-message" aria-busy="true"><span className="loader" aria-hidden="true" /><span className="sr-only">Loading portfolio…</span></div>;
}

createRoot(document.getElementById('root')).render(<App />);
