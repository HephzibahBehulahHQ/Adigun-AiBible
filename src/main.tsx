import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './AppErrorBoundary';
import './styles.css';
import './source-typography.css';
import { mountProductAccount } from './product-account.js';
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
if (import.meta.env.VITE_PRODUCT_ACCOUNTS === 'true') mountProductAccount();
