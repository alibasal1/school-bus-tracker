import { useEffect, useState } from 'react';
import { apiRequest } from '../api';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadFavorites() {
    try {
      const data = await apiRequest('/api/favorites');
      setFavorites(data.favorites);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFavorites();
  }, []);

  async function removeFavorite(id) {
    try {
      await apiRequest(`/api/favorites/${id}`, { method: 'DELETE' });
      setFavorites((current) => current.filter((favorite) => favorite.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading saved stops...</p>;

  return (
    <section>
      <h2>My stops</h2>
      {error && <p role="alert">{error}</p>}
      {!error && favorites.length === 0 && <p>You have no saved stops yet.</p>}
      <ul>
        {favorites.map((favorite) => (
          <li key={favorite.id}>
            <strong>{favorite.routeName}</strong>
            {favorite.stopName && <span> — {favorite.stopName}</span>}
            <p>
              {favorite.noBusToday
                ? 'No bus today'
                : favorite.arrivalFrom
                  ? `Next arrival: ${favorite.arrivalFrom.slice(0, 5)}–${favorite.arrivalTo.slice(0, 5)}`
                  : 'No upcoming bus time today.'}
            </p>
            <button onClick={() => removeFavorite(favorite.id)}>Remove</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
