import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DesktopGuideApp } from './DesktopGuideApp';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.location.hash === '#desktop-guide' ? <DesktopGuideApp/> : <App/>}</React.StrictMode>,
);
