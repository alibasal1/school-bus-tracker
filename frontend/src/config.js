// One address per backend service. Each one is a separate repo and a separate Vercel project.
export const API_URLS = {
  routes: import.meta.env.VITE_ROUTE_API_URL || 'http://localhost:3001',
  schedule: import.meta.env.VITE_SCHEDULE_API_URL || 'http://localhost:3002',
  favorites: import.meta.env.VITE_FAVORITES_API_URL || 'http://localhost:3003',
};
