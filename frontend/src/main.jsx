import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SessionProvider } from './session.jsx';
import { ToastViewport } from './toast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ToastViewport />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
