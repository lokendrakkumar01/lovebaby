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
const adminCookie = { ...sessionCookie, maxAge: 4 * 60 * 60 * 1000 };
const sessionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' } });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many admin sign-in attempts. Please try again in 15 minutes.' } });
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
  const docs = await entries.find({ ownerId: { $in: owners.map((owner) => owner._id) } }).sort({ createdAt: -1 }).limit(300).toArray();
  res.json({ items: docs.map((entry) => ({ ...cleanEntry(entry), ownerName: ownerNames.get(entry.ownerId.toString()), canDelete: entry.ownerId.equals(req.user._id) })) });
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
  const docs = await entries.find({ ownerId: owner._id, kind: { $in: ['image', 'video'] } }).sort({ createdAt: -1 }).limit(300).toArray();
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
  await entries.deleteOne({ _id: entry._id, ownerId: req.user._id });
  res.json({ ok: true });
});

async function streamMedia(req, res, entry) {
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
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), kind: { $in: ['image', 'video'] } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  const owner = await users.findOne({ _id: entry.ownerId, suspended: { $ne: true } }, { projection: { _id: 1, visibility: 1, visibleTo: 1 } });
  if (!owner || !albumVisibleTo(owner, req.user)) return res.status(404).json({ error: 'That memory was not found.' });
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
  const docs = await entries.find({ ownerId: owner._id }).sort({ createdAt: -1 }).limit(300).toArray();
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
  const list = await users.find({}, { projection: { name: 1, email: 1, createdAt: 1, visibility: 1, visibleTo: 1, suspended: 1 } }).sort({ createdAt: 1 }).toArray();
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
  const target = await users.findOne({ _id: userId }, { projection: { _id: 1 } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
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
  res.json({ ok: true });
});

app.get('/api/admin/memories', requireAdmin, async (_req, res) => {
  const owners = await users.find({}, { projection: { name: 1 } }).toArray();
  const names = new Map(owners.map((owner) => [owner._id.toString(), owner.name]));
  const docs = await entries.find({}).sort({ createdAt: -1 }).limit(1000).toArray();
  res.json({ items: docs.map((entry) => ({
    ...cleanEntry(entry),
    mediaUrl: entry.publicId ? `/api/admin/media/${entry._id}` : null,
    ownerName: names.get(entry.ownerId.toString()) || 'Deleted account'
  })) });
});

app.get('/api/admin/media/:id', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id), kind: { $in: ['image', 'video'] } });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  await streamMedia(req, res, entry);
});

app.delete('/api/admin/items/:id', requireAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'That memory was not found.' });
  const entry = await entries.findOne({ _id: new ObjectId(req.params.id) });
  if (!entry) return res.status(404).json({ error: 'That memory was not found.' });
  if (entry.publicId) await destroyCloudMedia(entry);
  await entries.deleteOne({ _id: entry._id });
  res.json({ ok: true });
});

app.use('/assets', (_req, res) => res.sendStatus(404));
app.use(express.static('public', { index: 'index.html', maxAge: isProduction ? '1h' : 0, etag: true }));
app.get(['/s/:token', '/add/:token', '/'], (_req, res) => res.sendFile(fileURLToPath(new URL('./public/index.html', import.meta.url))));
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
