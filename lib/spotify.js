const TRACK_ID = /^[A-Za-z0-9]{22}$/;

export function normalizeSpotifyTrack(value, title = '') {
  const input = String(value || '').trim().slice(0, 500);
  if (!input) return null;
  let id = input.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1]
    || (TRACK_ID.test(input) ? input : null);
  if (!id) {
    try {
      const url = new URL(input);
      if (url.protocol === 'https:' && ['open.spotify.com', 'www.open.spotify.com'].includes(url.hostname)) {
        id = url.pathname.match(/^\/(?:intl-[a-z]{2,3}(?:-[a-z]{2})?\/)?(?:track|embed\/track)\/([A-Za-z0-9]{22})\/?$/i)?.[1] || null;
      }
    } catch { /* Invalid links return the same validation message below. */ }
  }
  if (!id) {
    const error = new Error('Paste a Spotify track link, Spotify URI, or select a search result.');
    error.statusCode = 400;
    throw error;
  }
  return { id, title: String(title || 'Spotify track').trim().slice(0, 180), url: `https://open.spotify.com/track/${id}` };
}
