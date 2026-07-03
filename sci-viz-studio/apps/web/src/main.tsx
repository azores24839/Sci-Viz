import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import { AuthRoot } from './auth/AuthRoot';

createRoot(document.getElementById('root')!).render(<StrictMode><AuthRoot><App /></AuthRoot></StrictMode>);
