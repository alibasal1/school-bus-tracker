import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import RoutesPage from './pages/RoutesPage';
import SchedulePage from './pages/SchedulePage';
import FavoritesPage from './pages/FavoritesPage';
import AlertsPage from './pages/AlertsPage';

// Simple tabs instead of a router, so there is nothing extra to learn.
const pages = {
  login: { label: 'Login', Page: LoginPage },
  routes: { label: 'Routes', Page: RoutesPage },
  schedule: { label: 'Bus times', Page: SchedulePage },
  favorites: { label: 'My stops', Page: FavoritesPage },
  alerts: { label: 'Alerts', Page: AlertsPage },
};

export default function App() {
  const [current, setCurrent] = useState('routes');
  const { Page } = pages[current];
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1>School Bus Route Tracker</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Object.entries(pages).map(([key, { label }]) => (
          <button key={key} onClick={() => setCurrent(key)} disabled={key === current}>
            {label}
          </button>
        ))}
      </nav>
      <Page />
    </div>
  );
}
