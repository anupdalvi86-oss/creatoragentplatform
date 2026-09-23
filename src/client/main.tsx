import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import './style.css';

createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/admin') ? <AdminApp /> : <App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js?v=3').catch(() => undefined);
