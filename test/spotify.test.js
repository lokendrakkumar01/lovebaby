import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpotifyTrack } from '../lib/spotify.js';

const id = '4uLU6hMCjMI75M1A2tKUQC';

test('normalizes regular and locale-prefixed Spotify song links', () => {
  assert.equal(normalizeSpotifyTrack(`https://open.spotify.com/track/${id}?si=abc`).id, id);
  assert.equal(normalizeSpotifyTrack(`https://open.spotify.com/intl-en/track/${id}?si=abc`).url, `https://open.spotify.com/track/${id}`);
  assert.equal(normalizeSpotifyTrack(`https://open.spotify.com/intl-de/track/${id}`).id, id);
});

test('normalizes Spotify URIs and direct search-result IDs, retaining safe titles', () => {
  assert.equal(normalizeSpotifyTrack(`spotify:track:${id}`, '<Song>').title, '<Song>');
  assert.equal(normalizeSpotifyTrack(id, 'Song · Artist').title, 'Song · Artist');
});

test('rejects non-Spotify hosts, non-HTTPS links, albums, and malformed IDs', () => {
  for (const value of [
    `https://evil.example/track/${id}`,
    `http://open.spotify.com/track/${id}`,
    `https://open.spotify.com/album/${id}`,
    'not a Spotify link'
  ]) assert.throws(() => normalizeSpotifyTrack(value), { statusCode: 400 });
});
