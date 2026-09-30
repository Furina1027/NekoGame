import { createRoot } from 'react-dom/client';
import DataSyncApp from './DataSyncApp';
import '@/styles/globals.css';

document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<DataSyncApp />);
