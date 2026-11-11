import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import { App } from './App';
import { applyTheme, settingsStore } from './state/settings';

applyTheme(settingsStore.get().theme);
settingsStore.subscribe(() => applyTheme(settingsStore.get().theme));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settingsStore.get().theme === 'system') applyTheme('system');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
