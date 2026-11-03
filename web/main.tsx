import { createRoot } from 'react-dom/client';
import { App } from './App';
import { HttpTransport } from './api';
import { PortalStore } from './store';
import { StoreContext } from './ui';
import './style.css';
const transport =
  import.meta.env.MODE === 'demo'
    ? new (await import('./demo')).DemoTransport()
    : new HttpTransport();
const store = new PortalStore(transport);
createRoot(document.querySelector('#app')!).render(
  <StoreContext.Provider value={store}>
    <App />
  </StoreContext.Provider>,
);
void store.bootstrap();
