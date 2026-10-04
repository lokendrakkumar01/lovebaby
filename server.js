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
await users.createIndex({ email: 1 }, { unique: true });
await users.createIndex({ shareToken: 1 }, { unique: true, sparse: true });
await users.createIndex({ contributorToken: 1 }, { unique: true, sparse: true });
await entries.createIndex({ ownerId: 1, createdAt: -1 });
await entries.createIndex({ shareToken: 1, createdAt: -1 });

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'https://res.cloudinary.com', 'data:'],
    mediaSrc: ["'self'", 'https://res.cloudinary.com'],
    connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"],
    baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
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
  maxAge: 7 * 24 * 60 * 60 * 1000
};
const sessionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Upload limit reached. Please try again later.' } });

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

function cloudinaryUrl(entry) {
  return cloudinary.url(entry.publicId, {
    secure: true,
    sign_url: true,
    resource_type: entry.resourceType,
    type: 'authenticated',
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
    createdAt: entry.createdAt.toISOString()
  };
}

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/register', sessionLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim().slice(0, 60);
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Use a password between 10 and 128 characters.' });
  if (!name) return res.status(400).json({ error: 'Add your name to create an account.' });
  if (await users.findOne({ email }, { projection: { _id: 1 } })) return res.status(409).json({ error: 'An account with this email already exists.' });
  const user = { name, email, passwordHash: await bcrypt.hash(password, 12), sessionVersion: 0, createdAt: new Date() };
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

app.get('/api/items', requireUser, async (req, res) => {
  const docs = await entries.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).limit(300).toArray();
  res.json({ items: docs.map(cleanEntry) });
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
  const contributorToken = req.user.contributorToken || crypto.randomBytes(32).toString('base64url');
  await users.updateOne({ _id: req.user._id }, { $set: { contributorToken } });
  res.json({ url: `${req.protocol}://${req.get('host')}/add/${contributorToken}` });
});

app.delete('/api/contributor-link', requireUser, async (req, res) => {
  await users.updateOne({ _id: req.user._id }, { $unset: { contributorToken: '' } });
  res.json({ ok: true });
});

app.get('/api/contribute/:token', async (req, res) => {
  const owner = await users.findOne({ contributorToken: req.params.token }, { projection: { name: 1, _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'This upload link is no longer available.' });
  const docs = await entries.find({ ownerId: owner._id, kind: { $in: ['image', 'video'] } }).sort({ createdAt: -1 }).limit(300).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ ownerName: owner.name, items: docs.map((entry) => cleanEntry(entry, req.params.token)) });
});

async function requireContributor(req, res, next) {
  const owner = await users.findOne({ contributorToken: req.params.token }, { projection: { _id: 1 } });
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
  if (entry.publicId) await cloudinary.uploader.destroy(entry.publicId, { resource_type: entry.resourceType, type: 'authenticated' });
  await entries.deleteOne({ _id: entry._id, ownerId: req.user._id });
  res.json({ ok: true });
});

async function streamMedia(req, res, entry) {
  if (!entry?.publicId) return res.status(404).json({ error: 'That memory was not found.' });
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const cloudResponse = await fetch(cloudinaryUrl(entry), { headers });
  if (!cloudResponse.ok && cloudResponse.status !== 206) return res.status(502).json({ error: 'The media could not be loaded right now.' });
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = cloudResponse.headers.get(name);
    if (value) res.set(name, value);
  }
  res.set('Cache-Control', 'private, no-store');
  res.status(cloudResponse.status);
  if (!cloudResponse.body) return res.end();
  Readable.fromWeb(cloudResponse.body).pipe(res);
}

app.get('/api/media/:id', requireUser, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), ownerId: req.user._id, kind: { $in: ['image', 'video'] } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry);
});

app.get('/api/shared/:token/media/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ $or: [{ shareToken: req.params.token }, { contributorToken: req.params.token }] }, { projection: { _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'This album link is no longer available.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), ownerId: owner._id, kind: { $in: ['image', 'video'] } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry);
});

app.post('/api/share', requireUser, async (req, res) => {
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
  const docs = await entries.find({ ownerId: owner._id }).sort({ createdAt: -1 }).limit(300).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ ownerName: owner.name, items: docs.map((entry) => cleanEntry(entry, req.params.token)) });
});

app.use('/assets', (_req, res) => res.sendStatus(404));
app.use(express.static('public', { index: 'index.html', maxAge: isProduction ? '1h' : 0, etag: true }));
app.get(['/s/:token', '/add/:token', '/'], (_req, res) => res.sendFile(fileURLToPath(new URL('./public/index.html', import.meta.url))));

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

