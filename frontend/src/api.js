import { API_URLS } from './config';

// One helper for every call to the APIs (Lab 5 apiRequest, React version).
// service is 'routes' (Yehia), 'schedule' (Ahmed, also login) or 'favorites' (Ali).
export async function apiRequest(service, path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URLS[service]}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ? data.error.message : 'Request failed');
  return data;
}
