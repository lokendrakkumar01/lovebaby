import 'dotenv/config';
import crypto from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { fileTypeFromFile } from 'file-type';
import helmet from 'helmet';
import { MongoClient, ObjectId } from 'mongodb';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { normalizeSpotifyTrack, spotifySearchError } from './lib/spotify.js';

const required = ['MONGODB_URI', 'SESSION_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const app = express();
const port = Number(process.env.PORT || 10000);
const isProduction = process.env.NODE_ENV === 'production';
const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'little_moments');
const users = db.collection('users');
const entries = db.collection('entries');
const userHiddenMemories = db.collection('user_hidden_memories');
const spotifyOAuthStates = db.collection('spotify_oauth_states');
const systemGalleryId = new ObjectId('000000000000000000000001');
await users.createIndex({ email: 1 }, { unique: true });
await users.createIndex({ shareToken: 1 }, { unique: true, sparse: true });
await users.createIndex({ contributorToken: 1 }, { unique: true, sparse: true });
await entries.createIndex({ memoryShareToken: 1 }, { unique: true, sparse: true });
await entries.createIndex({ ownerId: 1, createdAt: -1 });
await entries.createIndex({ shareToken: 1, createdAt: -1 });
await userHiddenMemories.createIndex({ userId: 1, memoryId: 1 }, { unique: true });
await userHiddenMemories.createIndex({ userId: 1, hiddenAt: -1 });
await spotifyOAuthStates.createIndex({ stateHash: 1 }, { unique: true });
await spotifyOAuthStates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await users.updateOne({ _id: systemGalleryId }, { $setOnInsert: {
  name: 'Admin', email: '__little-moments-gallery@internal.invalid', isSystemGallery: true,
  visibility: 'all', visibleTo: [], createdAt: new Date()
} }, { upsert: true });

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'https://res.cloudinary.com', 'https://i.scdn.co', 'data:'],
    mediaSrc: ["'self'", 'https://res.cloudinary.com'],
    connectSrc: ["'self'"], frameSrc: ["'self'", 'https://open.spotify.com'], fontSrc: ["'self'"], objectSrc: ["'none'"],
    baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}` && req.path !== '/auth/spotify/callback') {
    return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  }
  next();
});
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const sessionCookie = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000
};
const adminCookie = { ...sessionCookie, maxAge: 4 * 60 * 60 * 1000 };
const sessionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' } });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many admin sign-in attempts. Please try again in 15 minutes.' } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Upload limit reached. Please try again later.' } });
const spotifyAuthLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many Spotify connection attempts. Please try again later.' } });
const spotifySearchLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Song search is busy. Please wait a minute and try again.' } });

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [part, ''];
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    try { return [key, decodeURIComponent(value)]; } catch { return [key, '']; }
  }));
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({ sub: user._id.toString(), ver: user.sessionVersion || 0, exp: Date.now() + sessionCookie.maxAge })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function signAdminSession() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + adminCookie.maxAge })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySignedToken(token, expectedRole) {
  if (!token) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.role === expectedRole && session.exp > Date.now();
  } catch { return false; }
}

function secureTextEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left)).digest();
  const b = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

const spotifyRedirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://lovebaby.onrender.com/auth/spotify/callback';
function spotifyEncryptionKey() {
  return crypto.createHash('sha256').update(`${process.env.SESSION_SECRET}:spotify-oauth-tokens`).digest();
}

function encryptSpotifyTokens(tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', spotifyEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}

function decryptSpotifyTokens(encrypted) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', spotifyEncryptionKey(), Buffer.from(encrypted.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

function redirectSpotifyResult(res, result) {
  return res.redirect(303, `/?spotify=${encodeURIComponent(result)}`);
}

function requireAdmin(req, res, next) {
  if (!verifySignedToken(parseCookies(req.get('cookie')).lm_admin_session, 'admin')) {
    return res.status(401).json({ error: 'Admin sign-in required.' });
  }
  next();
}

async function requireUser(req, res, next) {
  const token = parseCookies(req.get('cookie')).lm_session;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return res.status(401).json({ error: 'Please sign in again.' });
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return res.status(401).json({ error: 'Please sign in again.' });
  let session;
  try { session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return res.status(401).json({ error: 'Please sign in again.' }); }
  if (!ObjectId.isValid(session.sub) || session.exp < Date.now()) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  const user = await users.findOne({ _id: new ObjectId(session.sub) });
  if (!user || (user.sessionVersion || 0) !== session.ver) return res.status(401).json({ error: 'Please sign in again.' });
  if (user.suspended) return res.status(403).json({ error: 'This account has been disabled. Contact the site administrator.' });
  if (session.exp - Date.now() < 7 * 24 * 60 * 60 * 1000) res.cookie('lm_session', signSession(user), sessionCookie);
  req.user = user;
  next();
}

function cleanUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, hasShareLink: Boolean(user.shareToken), hasContributorLink: Boolean(user.contributorToken) };
}

function mediaUrl(entry, token = null) {
  if (!entry.publicId) return null;
  const id = entry._id.toString();
  return token
    ? `/api/shared/${encodeURIComponent(token)}/media/${id}`
    : `/api/media/${id}`;
}

function cloudinaryUrl(entry, deliveryType = entry.deliveryType || 'authenticated') {
  return cloudinary.url(entry.publicId, {
    secure: true,
    sign_url: deliveryType !== 'upload',
    resource_type: entry.resourceType,
    type: deliveryType,
    version: entry.version,
    format: entry.format
  });
}

function cleanEntry(entry, shareLinkToken = null) {
  return {
    id: entry._id.toString(),
    kind: entry.kind,
    text: entry.text || '',
    caption: entry.caption || '',
    mediaUrl: mediaUrl(entry, shareLinkToken),
    resourceType: entry.resourceType || null,
    createdAt: entry.createdAt.toISOString(),
    spotifyTrack: entry.spotifyTrack || null
  };
}

async function resolveSpotifyTrack(value, title = '') {
  return normalizeSpotifyTrack(value, title);
}

let spotifyCatalogToken = null;
async function getSpotifyCatalogToken() {
  if (spotifyCatalogToken && spotifyCatalogToken.expiresAt > Date.now() + 60_000) return spotifyCatalogToken.value;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error('Spotify song search is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the Render service environment.');
    error.statusCode = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    const error = new Error('Spotify search could not be reached. Try again shortly.'); error.statusCode = 502; throw error;
  }
  if (!response.ok) {
    spotifyCatalogToken = null;
    const error = new Error('Spotify rejected the server credentials. Check the Client ID and rotated Client Secret in Render.'); error.statusCode = 502; throw error;
  }
  const data = await response.json();
  if (!data.access_token || !Number.isFinite(data.expires_in)) {
    const error = new Error('Spotify returned an invalid search token.'); error.statusCode = 502; throw error;
  }
  spotifyCatalogToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return spotifyCatalogToken.value;
}

async function searchSpotifyTracks(query) {
  const token = await getSpotifyCatalogToken();
  const params = new URLSearchParams({ q: query, type: 'track', limit: '8', market: 'IN' });
  let response;
  try {
    response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    const error = new Error('Spotify song search failed. Try again shortly.'); error.statusCode = 502; throw error;
  }
  if (response.status === 401) {
    spotifyCatalogToken = null;
    const error = new Error('Spotify search session expired. Please search again.'); error.statusCode = 502; throw error;
  }
  if (!response.ok) {
    const error = new Error(spotifySearchError(response.status));
    error.statusCode = response.status === 429 ? 429 : 502; throw error;
  }
  const data = await response.json();
  return (data.tracks?.items || []).map((track) => ({
    id: track.id,
    title: track.name,
    artist: (track.artists || []).map((artist) => artist.name).join(', '),
    album: track.album?.name || '',
    image: track.album?.images?.at(-1)?.url || null,
    url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`
  }));
}

function spotifySearchHandler(req, res) {
  const query = String(req.query.q || '').trim().slice(0, 100);
  if (query.length < 2) return res.status(400).json({ error: 'Type at least 2 letters to search Spotify.' });
  searchSpotifyTracks(query).then((tracks) => res.json({ tracks })).catch((error) => res.status(error.statusCode || 502).json({ error: error.message || 'Spotify search failed.' }));
}

app.get('/api/spotify/search', requireUser, spotifySearchLimiter, spotifySearchHandler);
app.get('/api/admin/spotify/search', requireAdmin, spotifySearchLimiter, spotifySearchHandler);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/auth/spotify', requireUser, spotifyAuthLimiter, async (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return res.status(503).send('Spotify is not configured on this service yet.');
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  await spotifyOAuthStates.insertOne({
    stateHash: crypto.createHash('sha256').update(state).digest('hex'),
    userId: req.user._id,
    verifier: encryptSpotifyTokens({ verifier }),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });
  const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: 'user-read-private'
  }).toString();
  res.set('Cache-Control', 'no-store');
  res.redirect(303, authorizeUrl.href);
});

app.get('/auth/spotify/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!state || state.length > 200) return redirectSpotifyResult(res, 'invalid');
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  const stateRecord = await spotifyOAuthStates.findOneAndDelete({ stateHash, expiresAt: { $gt: new Date() } });
  if (!stateRecord) return redirectSpotifyResult(res, 'invalid');
  if (req.query.error) return redirectSpotifyResult(res, 'denied');
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!code || !clientId || !ObjectId.isValid(stateRecord.userId)) return redirectSpotifyResult(res, 'error');

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: spotifyRedirectUri,
        client_id: clientId,
        code_verifier: decryptSpotifyTokens(stateRecord.verifier).verifier
      })
    });
    if (!tokenResponse.ok) return redirectSpotifyResult(res, 'error');
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token || !Number.isFinite(tokenData.expires_in)) return redirectSpotifyResult(res, 'error');

    let spotifyProfile = null;
    try {
      const profileResponse = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(10_000) });
      if (profileResponse.ok) spotifyProfile = await profileResponse.json();
    } catch { /* The token can still be safely saved if the optional profile lookup fails. */ }
    const currentUser = await users.findOne({ _id: stateRecord.userId }, { projection: { suspended: 1 } });
    if (!currentUser || currentUser.suspended) return redirectSpotifyResult(res, 'error');
    const storedTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope || ''
    };
    await users.updateOne({ _id: stateRecord.userId }, { $set: {
      spotifyConnection: {
        encryptedTokens: encryptSpotifyTokens(storedTokens),
        spotifyUserId: spotifyProfile?.id || null,
        displayName: spotifyProfile?.display_name || null,
        connectedAt: new Date()
      }
    } });
    return redirectSpotifyResult(res, 'connected');
  } catch {
    return redirectSpotifyResult(res, 'error');
  }
});

app.get('/api/spotify/status', requireUser, (req, res) => {
  const connection = req.user.spotifyConnection;
  res.json({
    configured: Boolean(process.env.SPOTIFY_CLIENT_ID),
    connected: Boolean(connection?.encryptedTokens),
    displayName: connection?.displayName || null
  });
});

app.get('/api/spotify/profile', requireUser, async (req, res) => {
  const connection = req.user.spotifyConnection;
  if (!connection?.encryptedTokens) return res.status(404).json({ error: 'Connect Spotify first.' });
  let tokens;
  try { tokens = decryptSpotifyTokens(connection.encryptedTokens); }
  catch { return res.status(401).json({ error: 'Reconnect Spotify to continue.' }); }

  if (tokens.expiresAt <= Date.now() + 60_000) {
    if (!tokens.refreshToken) return res.status(401).json({ error: 'Reconnect Spotify to continue.' });
    let refreshed;
    try {
      refreshed = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: process.env.SPOTIFY_CLIENT_ID || '' }),
        signal: AbortSignal.timeout(10_000)
      });
    } catch { return res.status(502).json({ error: 'Spotify could not be reached. Try again shortly.' }); }
    if (!refreshed.ok) return res.status(401).json({ error: 'Reconnect Spotify to continue.' });
    const refreshedData = await refreshed.json();
    if (!refreshedData.access_token || !Number.isFinite(refreshedData.expires_in)) return res.status(502).json({ error: 'Spotify returned an invalid token response. Please reconnect.' });
    tokens = {
      ...tokens,
      accessToken: refreshedData.access_token,
      refreshToken: refreshedData.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + refreshedData.expires_in * 1000
    };
    await users.updateOne({ _id: req.user._id }, { $set: { 'spotifyConnection.encryptedTokens': encryptSpotifyTokens(tokens) } });
  }

  let profileResponse;
  try {
    profileResponse = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: AbortSignal.timeout(10_000) });
  } catch { return res.status(502).json({ error: 'Spotify could not be reached. Try again shortly.' }); }
  if (!profileResponse.ok) return res.status(502).json({ error: 'Spotify profile could not be loaded. Try reconnecting.' });
  const profile = await profileResponse.json();
  res.json({ id: profile.id, displayName: profile.display_name || null, product: profile.product || null });
});

app.delete('/api/spotify/connection', requireUser, async (req, res) => {
  await users.updateOne({ _id: req.user._id }, { $unset: { spotifyConnection: '' } });
  res.json({ ok: true });
});

app.post('/api/auth/register', sessionLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim().slice(0, 60);
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Use a password between 10 and 128 characters.' });
  if (!name) return res.status(400).json({ error: 'Add your name to create an account.' });
  if (req.body?.sharedConsent !== true) return res.status(400).json({ error: 'Please confirm that signed-in members can view memories you add.' });
  if (await users.findOne({ email }, { projection: { _id: 1 } })) return res.status(409).json({ error: 'An account with this email already exists.' });
  const user = { name, email, passwordHash: await bcrypt.hash(password, 12), sessionVersion: 0, visibility: 'all', sharedAlbumConsentAt: new Date(), createdAt: new Date() };
  try { await users.insertOne(user); } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
    throw error;
  }
  res.cookie('lm_session', signSession(user), sessionCookie);
  res.status(201).json({ user: cleanUser(user) });
});

app.post('/api/auth/login', sessionLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = await users.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email or password did not match.' });
  if (user.suspended) return res.status(403).json({ error: 'This account has been disabled. Contact the site administrator.' });
  res.cookie('lm_session', signSession(user), sessionCookie);
  res.json({ user: cleanUser(user) });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = parseCookies(req.get('cookie')).lm_session;
  if (token) {
    const [payload, signature] = token.split('.');
    if (payload && signature) {
      const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
      const supplied = Buffer.from(signature);
      const calculated = Buffer.from(expected);
      if (supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated)) {
        try {
          const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
          if (ObjectId.isValid(session.sub)) await users.updateOne({ _id: new ObjectId(session.sub) }, { $inc: { sessionVersion: 1 } });
        } catch { /* Expired or malformed cookies are cleared below. */ }
      }
    }
  }
  res.clearCookie('lm_session', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: cleanUser(req.user) }));

function albumVisibleTo(owner, viewer) {
  if (owner._id.equals(viewer._id)) return true;
  if (owner.visibility === 'private') return false;
  if (owner.visibility === 'selected') return (owner.visibleTo || []).some((id) => id.equals(viewer._id));
  return true;
}

async function visibleAlbumOwners(viewer) {
  const owners = await users.find({ suspended: { $ne: true } }, { projection: { _id: 1, name: 1, visibility: 1, visibleTo: 1 } }).toArray();
  return owners.filter((owner) => albumVisibleTo(owner, viewer));
}

app.get('/api/items', requireUser, async (req, res) => {
  const owners = await visibleAlbumOwners(req.user);
  const ownerNames = new Map(owners.map((owner) => [owner._id.toString(), owner.name]));
  const hiddenDocs = await userHiddenMemories.find({ userId: req.user._id }, { projection: { memoryId: 1 } }).toArray();
  const hiddenIds = hiddenDocs.map((record) => record.memoryId);
  const docs = await entries.find({ ownerId: { $in: owners.map((owner) => owner._id) }, adminHidden: { $ne: true }, ...(hiddenIds.length ? { _id: { $nin: hiddenIds } } : {}) }).sort({ createdAt: -1 }).toArray();
  const hiddenCount = hiddenIds.length ? await entries.countDocuments({ _id: { $in: hiddenIds }, ownerId: { $in: owners.map((owner) => owner._id) }, adminHidden: { $ne: true } }) : 0;
  res.json({
    items: docs.map((entry) => ({ ...cleanEntry(entry), ownerName: ownerNames.get(entry.ownerId.toString()), canDelete: entry.ownerId.equals(req.user._id) })),
    hiddenCount
  });
});

app.get('/api/hidden-items', requireUser, async (req, res) => {
  const owners = await visibleAlbumOwners(req.user);
  const ownerNames = new Map(owners.map((owner) => [owner._id.toString(), owner.name]));
  const hiddenDocs = await userHiddenMemories.find({ userId: req.user._id }).sort({ hiddenAt: -1 }).toArray();
  const ids = hiddenDocs.map((record) => record.memoryId);
  const docs = ids.length ? await entries.find({ _id: { $in: ids }, ownerId: { $in: owners.map((owner) => owner._id) }, adminHidden: { $ne: true } }).toArray() : [];
  const hiddenAt = new Map(hiddenDocs.map((record) => [record.memoryId.toString(), record.hiddenAt]));
  docs.sort((a, b) => new Date(hiddenAt.get(b._id.toString())) - new Date(hiddenAt.get(a._id.toString())));
  res.json({ items: docs.map((entry) => ({ ...cleanEntry(entry), ownerName: ownerNames.get(entry.ownerId.toString()), canDelete: entry.ownerId.equals(req.user._id), userHidden: true })) });
});

app.post('/api/items/:id/hide', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, visibility: 1, visibleTo: 1 } });
  if (!owner || !albumVisibleTo(owner, req.user)) return res.status(404).json({ error: 'That memory was not found.' });
  try {
    await userHiddenMemories.updateOne({ userId: req.user._id, memoryId: entry._id }, { $setOnInsert: { userId: req.user._id, memoryId: entry._id, hiddenAt: new Date() } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  res.json({ ok: true });
});

app.delete('/api/items/:id/hide', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  await userHiddenMemories.deleteOne({ userId: req.user._id, memoryId: new ObjectId(req.params.id) });
  res.json({ ok: true });
});

app.post('/api/messages', requireUser, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a little note before saving.' });
  if (text.length > 3000) return res.status(400).json({ error: 'Notes can be up to 3,000 characters.' });
  const entry = { ownerId: req.user._id, kind: 'note', text, createdAt: new Date() };
  const result = await entries.insertOne(entry);
  entry._id = result.insertedId;
  res.status(201).json({ item: cleanEntry(entry) });
});

const memoryUpload = multer({
  storage: multer.diskStorage({ destination: tmpdir(), filename: (_req, _file, callback) => callback(null, `lm-${crypto.randomUUID()}`) }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 2, fieldSize: 400 }
});
const knownFileTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']);

async function saveMedia(ownerId, req) {
  if (!req.file) {
    const error = new Error('Choose a photo or video to upload.');
    error.statusCode = 400;
    throw error;
  }
  const detected = await fileTypeFromFile(req.file.path);
  if (!detected || !knownFileTypes.has(detected.mime)) {
    await rm(req.file.path, { force: true });
    const error = new Error('That file type is not supported. Choose a photo or video.');
    error.statusCode = 415;
    throw error;
  }
  const resourceType = detected.mime.startsWith('video/') ? 'video' : 'image';
  const caption = String(req.body?.caption || '').trim().slice(0, 180);
  let uploaded;
  try {
    uploaded = await cloudinary.uploader.upload(req.file.path, {
      resource_type: resourceType,
      type: 'authenticated',
      folder: 'little-moments',
      unique_filename: true,
      use_filename: false,
      overwrite: false,
      context: { alt: caption.slice(0, 100) }
    });
  } finally {
    await rm(req.file.path, { force: true });
  }
  const entry = {
    ownerId,
    kind: resourceType,
    caption,
    publicId: uploaded.public_id,
    deliveryType: 'authenticated',
    resourceType: uploaded.resource_type,
    version: uploaded.version,
    format: uploaded.format,
    bytes: uploaded.bytes,
    createdAt: new Date()
  };
  try {
    const result = await entries.insertOne(entry);
    entry._id = result.insertedId;
  } catch (error) {
    await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: resourceType, type: 'authenticated' }).catch(() => {});
    throw error;
  }
  return entry;
}

app.post('/api/media', requireUser, uploadLimiter, memoryUpload.single('file'), async (req, res) => {
  const entry = await saveMedia(req.user._id, req);
  res.status(201).json({ item: cleanEntry(entry) });
});

app.post('/api/contributor-link', requireUser, async (req, res) => {
  if (req.user.sharingDisabled || req.user.visibility === 'private' || req.user.visibility === 'selected') return res.status(403).json({ error: 'The administrator has restricted contributor links for this account.' });
  const contributorToken = req.user.contributorToken || crypto.randomBytes(32).toString('base64url');
  await users.updateOne({ _id: req.user._id }, { $set: { contributorToken } });
  res.json({ url: `${req.protocol}://${req.get('host')}/add/${contributorToken}` });
});

app.delete('/api/contributor-link', requireUser, async (req, res) => {
  await users.updateOne({ _id: req.user._id }, { $unset: { contributorToken: '' } });
  res.json({ ok: true });
});

app.get('/api/contribute/:token', async (req, res) => {
  const owner = await users.findOne({ contributorToken: req.params.token, suspended: { $ne: true } }, { projection: { name: 1, _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'This upload link is no longer available.' });
  const docs = await entries.find({ ownerId: { $in: [owner._id, systemGalleryId] }, kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } }).sort({ createdAt: -1 }).limit(300).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ ownerName: owner.name, items: docs.map((entry) => cleanEntry(entry, req.params.token)) });
});

async function requireContributor(req, res, next) {
  const owner = await users.findOne({ contributorToken: req.params.token, suspended: { $ne: true } }, { projection: { _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'This upload link is no longer available.' });
  req.contributorOwner = owner;
  next();
}

app.post('/api/contribute/:token/media', uploadLimiter, requireContributor, memoryUpload.single('file'), async (req, res) => {
  const entry = await saveMedia(req.contributorOwner._id, req);
  res.status(201).json({ item: cleanEntry(entry, req.params.token) });
});

app.delete('/api/items/:id', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), ownerId: req.user._id });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  if (entry.publicId) await destroyCloudMedia(entry);
  const settings = await users.findOne({ _id: systemGalleryId }, { projection: { backgroundMemoryId: 1 } });
  if (settings?.backgroundMemoryId === entry._id.toString()) await users.updateOne({ _id: systemGalleryId }, { $unset: { backgroundMemoryId: '' } });
  await entries.deleteOne({ _id: entry._id, ownerId: req.user._id });
  res.json({ ok: true });
});

app.post('/api/items/:id/spotify-track', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const id = new ObjectId(req.params.id);
  const entry = await entries.findOne({ _id: id, ownerId: req.user._id, kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } }, { projection: { _id: 1 } });
  if (!entry) return res.status(404).json({ error: 'Only your visible photo or video memories can be edited here.' });
  const spotifyTrack = await resolveSpotifyTrack(req.body?.trackId || req.body?.url, req.body?.title);
  if (!spotifyTrack) return res.status(400).json({ error: 'Add a Spotify song link first.' });
  await entries.updateOne({ _id: id }, { $set: { spotifyTrack, spotifyTrackUpdatedAt: new Date(), spotifyTrackUpdatedBy: req.user._id } });
  res.json({ spotifyTrack });
});

app.delete('/api/items/:id/spotify-track', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  await entries.updateOne({ _id: new ObjectId(req.params.id), ownerId: req.user._id }, { $unset: { spotifyTrack: '', spotifyTrackUpdatedAt: '', spotifyTrackUpdatedBy: '' } });
  res.json({ ok: true });
});

async function streamMedia(req, res, entry, { attachment = false } = {}) {
  if (!entry?.publicId) return res.status(404).json({ error: 'That memory was not found.' });
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  let cloudResponse = await fetch(cloudinaryUrl(entry), { headers });
  if (!cloudResponse.ok && !entry.deliveryType && [401, 403, 404].includes(cloudResponse.status)) {
    for (const legacyType of ['private', 'upload']) {
      const fallback = await fetch(cloudinaryUrl(entry, legacyType), { headers });
      if (fallback.ok || fallback.status === 206) { cloudResponse = fallback; break; }
      cloudResponse = fallback;
    }
  }
  if (!cloudResponse.ok && cloudResponse.status !== 206) {
    console.error('Cloudinary delivery failed:', { publicId: entry.publicId, resourceType: entry.resourceType, status: cloudResponse.status });
    return res.status(502).json({ error: 'This memory could not be loaded from Cloudinary. Check the Cloudinary asset type and credentials.' });
  }
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = cloudResponse.headers.get(name);
    if (value) res.set(name, value);
  }
  res.set('Cache-Control', 'private, no-store');
  if (attachment) {
    const extension = /^[a-z0-9]{1,8}$/i.test(entry.format || '') ? entry.format : (entry.kind === 'video' ? 'mp4' : 'jpg');
    res.set('Content-Disposition', `attachment; filename="memory-${entry._id}.${extension}"`);
  }
  res.status(cloudResponse.status);
  if (!cloudResponse.body) return res.end();
  Readable.fromWeb(cloudResponse.body).pipe(res);
}

async function destroyCloudMedia(entry) {
  const types = entry.deliveryType ? [entry.deliveryType] : ['authenticated', 'private', 'upload'];
  for (const type of types) {
    const result = await cloudinary.uploader.destroy(entry.publicId, { resource_type: entry.resourceType, type });
    if (result.result === 'ok') return;
  }
}

app.get('/api/media/:id', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, visibility: 1, visibleTo: 1 } });
  if (!owner || !albumVisibleTo(owner, req.user)) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry, { attachment: req.query.download === '1' });
});

app.post('/api/items/:id/share', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, visibility: 1, visibleTo: 1, sharingDisabled: 1 } });
  if (!owner || !albumVisibleTo(owner, req.user) || owner.sharingDisabled || (owner.visibility && owner.visibility !== 'all')) {
    return res.status(403).json({ error: 'This memory is not available for public sharing.' });
  }
  const memoryShareToken = entry.memoryShareToken || crypto.randomBytes(32).toString('base64url');
  await entries.updateOne({ _id: entry._id }, { $set: { memoryShareToken } });
  res.json({ url: `${req.protocol}://${req.get('host')}/memory/${memoryShareToken}` });
});

app.post('/api/contribute/:token/items/:id/share', requireContributor, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), ownerId: req.contributorOwner._id, kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  const memoryShareToken = entry.memoryShareToken || crypto.randomBytes(32).toString('base64url');
  await entries.updateOne({ _id: entry._id }, { $set: { memoryShareToken } });
  res.json({ url: new URL(`/memory/${memoryShareToken}`, `${req.protocol}://${req.get('host')}`).href });
});

app.get('/api/memory/:token', async (req, res) => {
  const entry = await entries.findOne({ memoryShareToken: req.params.token, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'This memory link is no longer available.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, name: 1, visibility: 1, isSystemGallery: 1 } });
  if (!owner || (!owner.isSystemGallery && owner.visibility && owner.visibility !== 'all')) return res.status(404).json({ error: 'This memory link is no longer available.' });
  res.set('Cache-Control', 'no-store');
  res.json({ item: { ...cleanEntry(entry), mediaUrl: entry.publicId ? `/api/memory/${encodeURIComponent(req.params.token)}/media` : null, ownerName: owner.name } });
});

app.get('/api/memory/:token/media', async (req, res) => {
  const entry = await entries.findOne({ memoryShareToken: req.params.token, kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'This memory link is no longer available.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { visibility: 1, isSystemGallery: 1 } });
  if (!owner || (!owner.isSystemGallery && owner.visibility && owner.visibility !== 'all')) return res.status(404).json({ error: 'This memory link is no longer available.' });
  await streamMedia(req, res, entry, { attachment: req.query.download === '1' });
});

app.get('/api/background', requireUser, async (req, res) => {
  const settings = await users.findOne({ _id: systemGalleryId }, { projection: { backgroundMemoryId: 1 } });
  if (!settings?.backgroundMemoryId || !ObjectId.isValid(settings.backgroundMemoryId)) return res.json({ background: null });
  const entry = await entries.findOne({ _id: new ObjectId(settings.backgroundMemoryId), kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } }, { projection: { _id: 1, kind: 1, ownerId: 1 } });
  if (!entry) return res.json({ background: null });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, visibility: 1, visibleTo: 1 } });
  if (!owner || !albumVisibleTo(owner, req.user)) return res.json({ background: null });
  res.json({ background: { kind: entry.kind, mediaUrl: `/api/background/media` } });
});

app.get('/api/background/media', requireUser, async (req, res) => {
  const settings = await users.findOne({ _id: systemGalleryId }, { projection: { backgroundMemoryId: 1 } });
  if (!settings?.backgroundMemoryId || !ObjectId.isValid(settings.backgroundMemoryId)) return res.status(404).end();
  const entry = await entries.findOne({ _id: new ObjectId(settings.backgroundMemoryId), kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).end();
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, visibility: 1, visibleTo: 1 } });
  if (!owner || !albumVisibleTo(owner, req.user)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=300');
  await streamMedia(req, res, entry, { attachment: req.query.download === '1' });
});

app.get('/api/shared/:token/media/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ $or: [{ shareToken: req.params.token }, { contributorToken: req.params.token }] }, { projection: { _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'This album link is no longer available.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), ownerId: { $in: [owner._id, systemGalleryId] }, kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry, { attachment: req.query.download === '1' });
});

app.post('/api/share', requireUser, async (req, res) => {
  if (req.user.sharingDisabled || req.user.visibility === 'private' || req.user.visibility === 'selected') return res.status(403).json({ error: 'The administrator has restricted public album links for this account.' });
  const shareToken = req.user.shareToken || crypto.randomBytes(32).toString('base64url');
  await users.updateOne({ _id: req.user._id }, { $set: { shareToken, shareCreatedAt: req.user.shareToken ? req.user.shareCreatedAt : new Date() } });
  res.json({ url: `${req.protocol}://${req.get('host')}/s/${shareToken}` });
});

app.delete('/api/share', requireUser, async (req, res) => {
  await users.updateOne({ _id: req.user._id }, { $unset: { shareToken: '', shareCreatedAt: '' } });
  res.json({ ok: true });
});

app.get('/api/shared/:token', async (req, res) => {
  const owner = await users.findOne({ shareToken: req.params.token }, { projection: { name: 1, _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'This album link is no longer available.' });
  const docs = await entries.find({ ownerId: { $in: [owner._id, systemGalleryId] }, adminHidden: { $ne: true } }).sort({ createdAt: -1 }).limit(300).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ ownerName: owner.name, items: docs.map((entry) => cleanEntry(entry, req.params.token)) });
});

app.post('/api/admin/login', adminLimiter, (req, res) => {
  const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  if (!configuredEmail || configuredPassword.length < 20) {
    return res.status(503).json({ error: 'Admin login is not configured. Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 20 characters in Render.' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!secureTextEqual(email, configuredEmail) || !secureTextEqual(password, configuredPassword)) {
    return res.status(401).json({ error: 'Email or password did not match.' });
  }
  res.cookie('lm_admin_session', signAdminSession(), adminCookie);
  res.json({ ok: true });
});

app.get('/api/admin/session', requireAdmin, (_req, res) => res.json({ ok: true }));

app.post('/api/admin/logout', requireAdmin, (_req, res) => {
  res.clearCookie('lm_admin_session', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const list = await users.find({ isSystemGallery: { $ne: true } }, { projection: { name: 1, email: 1, createdAt: 1, visibility: 1, visibleTo: 1, suspended: 1 } }).sort({ createdAt: 1 }).toArray();
  res.json({ users: list.map((user) => ({
    id: user._id.toString(), name: user.name, email: user.email,
    createdAt: user.createdAt?.toISOString?.() || null,
    visibility: user.visibility || 'all',
    visibleTo: (user.visibleTo || []).map((id) => id.toString()),
    suspended: Boolean(user.suspended)
  })) });
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  const userId = new ObjectId(req.params.id);
  const target = await users.findOne({ _id: userId }, { projection: { _id: 1, isSystemGallery: 1 } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.isSystemGallery) return res.status(400).json({ error: 'The shared Admin gallery is always visible to signed-in members.' });
  const visibility = req.body?.visibility;
  const suspended = req.body?.suspended;
  if (!['all', 'selected', 'private'].includes(visibility) || typeof suspended !== 'boolean') {
    return res.status(400).json({ error: 'Choose a valid visibility and account status.' });
  }
  let visibleTo = [];
  if (visibility === 'selected') {
    const selected = Array.isArray(req.body?.visibleTo) ? req.body.visibleTo : [];
    if (selected.length > 300 || selected.some((id) => !ObjectId.isValid(id))) return res.status(400).json({ error: 'The selected member list is invalid.' });
    visibleTo = [...new Set(selected)].map((id) => new ObjectId(id)).filter((id) => !id.equals(userId));
    const validCount = await users.countDocuments({ _id: { $in: visibleTo }, suspended: { $ne: true } });
    if (validCount !== visibleTo.length) return res.status(400).json({ error: 'One or more selected members are unavailable.' });
  }
  const update = { $set: { visibility, visibleTo, suspended, sharingDisabled: visibility !== 'all' || suspended } };
  if (suspended) update.$inc = { sessionVersion: 1 };
  if (visibility !== 'all' || suspended) update.$unset = { shareToken: '', contributorToken: '', shareCreatedAt: '' };
  await users.updateOne({ _id: userId }, update);
  if (visibility !== 'all' || suspended) await entries.updateMany({ ownerId: userId }, { $unset: { memoryShareToken: '' } });
  res.json({ ok: true });
});

app.get('/api/admin/background', requireAdmin, async (_req, res) => {
  const settings = await users.findOne({ _id: systemGalleryId }, { projection: { backgroundMemoryId: 1 } });
  res.json({ memoryId: settings?.backgroundMemoryId || null });
});

app.get('/api/admin/story', requireAdmin, async (req, res) => {
  const settings = await users.findOne({ _id: systemGalleryId }, { projection: { storyConfig: 1, storyToken: 1 } });
  const url = settings?.storyToken ? `${req.protocol}://${req.get('host')}/story/${settings.storyToken}` : null;
  res.json({ story: settings?.storyConfig || { title: 'Love My Jaan', subtitle: 'Every photo, video and message, together.', message: '', memoryIds: null }, url });
});

app.put('/api/admin/story', requireAdmin, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const subtitle = String(req.body?.subtitle || '').trim();
  const message = String(req.body?.message || '').trim();
  const memoryIds = req.body?.memoryIds;
  if (!title || title.length > 100 || subtitle.length > 180 || message.length > 1000) {
    return res.status(400).json({ error: 'Add a title and keep the title, subtitle and message within their character limits.' });
  }
  if (memoryIds !== null && (!Array.isArray(memoryIds) || memoryIds.length > 500 || memoryIds.some((id) => !ObjectId.isValid(id)))) {
    return res.status(400).json({ error: 'Choose a valid set of story memories.' });
  }
  let spotifyTrack;
  try { spotifyTrack = await resolveSpotifyTrack(req.body?.spotifyTrackId || req.body?.spotifyTrackUrl, req.body?.spotifyTrackTitle); }
  catch (error) { return res.status(error.statusCode || 400).json({ error: error.message }); }
  const ids = memoryIds === null ? null : [...new Set(memoryIds)];
  if (ids?.length) {
    const selected = await entries.find({ _id: { $in: ids.map((id) => new ObjectId(id)) }, adminHidden: { $ne: true } }, { projection: { _id: 1, ownerId: 1 } }).toArray();
    const owners = await users.find({ _id: { $in: selected.map((entry) => entry.ownerId) }, suspended: { $ne: true }, $or: [{ isSystemGallery: true }, { visibility: 'all' }, { visibility: { $exists: false } }] }, { projection: { _id: 1 } }).toArray();
    const eligibleOwners = new Set(owners.map((owner) => owner._id.toString()));
    const eligibleIds = new Set(selected.filter((entry) => eligibleOwners.has(entry.ownerId.toString())).map((entry) => entry._id.toString()));
    if (eligibleIds.size !== ids.length) return res.status(400).json({ error: 'Some selected memories are unavailable for public stories. Refresh the memories and try again.' });
  }
  const storyConfig = { title, subtitle, message, memoryIds: ids, spotifyTrack, updatedAt: new Date() };
  await users.updateOne({ _id: systemGalleryId }, { $set: { storyConfig } });
  res.json({ ok: true, story: storyConfig });
});

app.put('/api/admin/background', requireAdmin, async (req, res) => {
  const memoryId = String(req.body?.memoryId || '');
  if (!ObjectId.isValid(memoryId)) return res.status(400).json({ error: 'Choose a photo or video memory.' });
  const entry = await entries.findOne({ _id: new ObjectId(memoryId), kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That photo or video was not found.' });
  await users.updateOne({ _id: systemGalleryId }, { $set: { backgroundMemoryId: entry._id.toString() } });
  res.json({ ok: true, memoryId: entry._id.toString() });
});

app.delete('/api/admin/background', requireAdmin, async (_req, res) => {
  await users.updateOne({ _id: systemGalleryId }, { $unset: { backgroundMemoryId: '' } });
  res.json({ ok: true });
});

app.get('/api/admin/memories', requireAdmin, async (_req, res) => {
  const owners = await users.find({}, { projection: { name: 1, visibility: 1, suspended: 1, isSystemGallery: 1 } }).toArray();
  const names = new Map(owners.map((owner) => [owner._id.toString(), owner.name]));
  const eligible = new Set(owners.filter((owner) => !owner.suspended && (owner.isSystemGallery || !owner.visibility || owner.visibility === 'all')).map((owner) => owner._id.toString()));
  const docs = await entries.find({}).sort({ createdAt: -1 }).toArray();
  res.json({ items: docs.map((entry) => ({
    ...cleanEntry(entry),
    mediaUrl: entry.publicId ? `/api/admin/media/${entry._id}` : null,
    ownerName: names.get(entry.ownerId.toString()) || 'Deleted account',
    storyEligible: eligible.has(entry.ownerId.toString()),
    adminHidden: Boolean(entry.adminHidden),
    adminHiddenReason: entry.adminHiddenReason || ''
  })) });
});

app.patch('/api/admin/items/:id/hide', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  if (typeof req.body?.hidden !== 'boolean') return res.status(400).json({ error: 'Choose whether this memory should be hidden.' });
  const id = new ObjectId(req.params.id);
  const entry = await entries.findOne({ _id: id }, { projection: { _id: 1 } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  if (req.body.hidden) {
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    await entries.updateOne({ _id: id }, { $set: { adminHidden: true, adminHiddenAt: new Date(), adminHiddenBy: 'admin', adminHiddenReason: reason }, $unset: { memoryShareToken: '' } });
  } else {
    await entries.updateOne({ _id: id }, { $unset: { adminHidden: '', adminHiddenAt: '', adminHiddenBy: '', adminHiddenReason: '' } });
  }
  res.json({ ok: true, hidden: req.body.hidden });
});

app.post('/api/admin/items/:id/spotify-track', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const id = new ObjectId(req.params.id);
  const entry = await entries.findOne({ _id: id, kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } }, { projection: { _id: 1 } });
  if (!entry) return res.status(404).json({ error: 'That visible photo or video was not found.' });
  const spotifyTrack = await resolveSpotifyTrack(req.body?.trackId || req.body?.url, req.body?.title);
  if (!spotifyTrack) return res.status(400).json({ error: 'Add a Spotify song link first.' });
  await entries.updateOne({ _id: id }, { $set: { spotifyTrack, spotifyTrackUpdatedAt: new Date(), spotifyTrackUpdatedBy: 'admin' } });
  res.json({ spotifyTrack });
});

app.delete('/api/admin/items/:id/spotify-track', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  await entries.updateOne({ _id: new ObjectId(req.params.id) }, { $unset: { spotifyTrack: '', spotifyTrackUpdatedAt: '', spotifyTrackUpdatedBy: '' } });
  res.json({ ok: true });
});

app.post('/api/admin/media', requireAdmin, uploadLimiter, memoryUpload.single('file'), async (req, res) => {
  const entry = await saveMedia(systemGalleryId, req);
  res.status(201).json({ item: cleanEntry(entry) });
});

app.post('/api/admin/story-link', requireAdmin, async (req, res) => {
  let { storyToken } = await users.findOne({ _id: systemGalleryId }, { projection: { storyToken: 1 } });
  if (!storyToken) {
    const candidate = crypto.randomBytes(32).toString('base64url');
    const claim = await users.updateOne({ _id: systemGalleryId, storyToken: { $exists: false } }, { $set: { storyToken: candidate } });
    storyToken = claim.modifiedCount ? candidate : (await users.findOne({ _id: systemGalleryId }, { projection: { storyToken: 1 } }))?.storyToken;
  }
  if (!storyToken) return res.status(503).json({ error: 'The story link could not be prepared. Please try again.' });
  res.json({ url: new URL(`/story/${storyToken}`, `${req.protocol}://${req.get('host')}`).href });
});

app.delete('/api/admin/story-link', requireAdmin, async (_req, res) => {
  await users.updateOne({ _id: systemGalleryId }, { $unset: { storyToken: '' } });
  res.json({ ok: true });
});

app.get('/api/story/:token', async (req, res) => {
  const gallery = await users.findOne({ _id: systemGalleryId, storyToken: req.params.token }, { projection: { _id: 1, storyConfig: 1 } });
  if (!gallery) return res.status(404).json({ error: 'This story link is no longer available.' });
  const owners = await users.find({ suspended: { $ne: true }, $or: [{ isSystemGallery: true }, { visibility: 'all' }, { visibility: { $exists: false } }] }, { projection: { _id: 1, name: 1 } }).toArray();
  const ownerNames = new Map(owners.map((owner) => [owner._id.toString(), owner.name]));
  const storyConfig = gallery.storyConfig || { title: 'Love My Jaan', subtitle: 'Every photo, video and message, together.', message: '', memoryIds: null };
  const query = { ownerId: { $in: owners.map((owner) => owner._id) }, adminHidden: { $ne: true } };
  if (Array.isArray(storyConfig.memoryIds)) {
    const selectedIds = storyConfig.memoryIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    query._id = { $in: selectedIds };
  }
  const docs = await entries.find(query).sort({ createdAt: -1 }).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ story: { title: storyConfig.title, subtitle: storyConfig.subtitle, message: storyConfig.message, spotifyTrack: storyConfig.spotifyTrack || null }, items: docs.map((entry) => ({
    ...cleanEntry(entry),
    mediaUrl: entry.publicId ? `/api/story/${encodeURIComponent(req.params.token)}/media/${entry._id}` : null,
    ownerName: ownerNames.get(entry.ownerId.toString()) || 'Admin'
  })) });
});

app.get('/api/story/:token/media/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const gallery = await users.findOne({ _id: systemGalleryId, storyToken: req.params.token }, { projection: { _id: 1, storyConfig: 1 } });
  if (!gallery) return res.status(404).json({ error: 'This story link is no longer available.' });
  if (Array.isArray(gallery.storyConfig?.memoryIds) && !gallery.storyConfig.memoryIds.includes(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), kind: { $in: ['image', 'video'] }, adminHidden: { $ne: true } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true }, $or: [{ isSystemGallery: true }, { visibility: 'all' }, { visibility: { $exists: false } }] }, { projection: { _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry, { attachment: req.query.download === '1' });
});

app.get('/api/admin/media/:id', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), kind: { $in: ['image', 'video'] } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry, { attachment: req.query.download === '1' });
});

app.delete('/api/admin/items/:id', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id) });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  if (entry.publicId) await destroyCloudMedia(entry);
  if (entry._id.toString() === String((await users.findOne({ _id: systemGalleryId }, { projection: { backgroundMemoryId: 1 } }))?.backgroundMemoryId)) {
    await users.updateOne({ _id: systemGalleryId }, { $unset: { backgroundMemoryId: '' } });
  }
  await entries.updateOne({ _id: entry._id }, { $unset: { memoryShareToken: '' } });
  await entries.deleteOne({ _id: entry._id });
  res.json({ ok: true });
});

app.use('/assets', (_req, res) => res.sendStatus(404));
app.use(express.static('public', { index: 'index.html', maxAge: isProduction ? '1h' : 0, etag: true }));
app.get(['/s/:token', '/add/:token', '/'], (_req, res) => res.sendFile(fileURLToPath(new URL('./public/index.html', import.meta.url))));
app.get('/story/:token', (_req, res) => res.sendFile(fileURLToPath(new URL('./public/story.html', import.meta.url))));
app.get('/memory/:token', (_req, res) => res.sendFile(fileURLToPath(new URL('./public/memory.html', import.meta.url))));
app.get(['/Admin/login', '/Admin', '/admin/login', '/admin'], (_req, res) => res.sendFile(fileURLToPath(new URL('./public/admin.html', import.meta.url))));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Photos and videos can be up to 100 MB.' : 'The upload form could not be processed.';
    return res.status(400).json({ error: message });
  }
  if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
  console.error('Request failed:', error?.message || 'unknown error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const server = app.listen(port, '0.0.0.0', () => console.log(`Little Moments is listening on port ${port}.`));
async function shutdown() {
  server.close(async () => {
    await client.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
