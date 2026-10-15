import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import { DialogProvider } from './components/Dialogs.jsx';
import { hasApi } from './services/api.js';

function NoElectron() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-stone-700">
      <div>
        <h1 className="mb-2 text-xl font-semibold">Open this app with Electron</h1>
        <p>
          The preload bridge (<code>window.api</code>) is missing. Start the app with{' '}
          <code>npm run dev</code> instead of opening the Vite URL in a browser.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {hasApi() ? (
      <ToastProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ToastProvider>
    ) : (
      <NoElectron />
    )}
  </React.StrictMode>,
);
