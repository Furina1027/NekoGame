import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';

// Electron 加载的是自定义协议页面，HashRouter 避免刷新/跳转时找不到资源
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
