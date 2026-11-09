import { useEffect, useState } from 'react';
import { apiRequest } from '../api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const data = await apiRequest('/alerts');
        setAlerts(data.alerts);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, []);

  async function markAsRead(id) {
    try {
      const data = await apiRequest(`/alerts/${id}`, {
        method: 'PATCH',
        body: { isRead: true }
      });
      setAlerts((current) => current.map((alert) => (
        alert.id === id ? data.alert : alert
      )));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading alerts...</p>;

  return (
    <section>
      <h2>Alerts</h2>
      {error && <p role="alert">{error}</p>}
      {!error && alerts.length === 0 && <p>You have no alerts.</p>}
      <ul>
        {alerts.map((alert) => (
          <li key={alert.id}>
            <p>{alert.message}</p>
            <small>{alert.isRead ? 'Read' : 'Unread'}</small>
            {!alert.isRead && <button onClick={() => markAsRead(alert.id)}>Mark as read</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
