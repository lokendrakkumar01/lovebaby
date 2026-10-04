const $ = (selector) => document.querySelector(selector);
const authPanel = $('#auth-panel');
const dashboard = $('#dashboard');
const sharedView = $('#shared-view');
const authForm = $('#auth-form');
const adminPath = /^\/admin(?:\/login)?\/?$/i.test(location.pathname);
let authMode = 'login';
let items = [];
let viewerItems = [];
let viewerIndex = 0;
let previousFocus = null;
const shareToken = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{30,})\/?$/)?.[1] || null;
const contributorToken = location.pathname.match(/^\/add\/([A-Za-z0-9_-]{30,})\/?$/)?.[1] || null;

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function setNotice(element, message = '') {
  element.textContent = message;
}

function setBusy(element, busy) {
  element.classList.toggle('busy', busy);
  element.setAttribute('aria-busy', String(busy));
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  $('#auth-title').textContent = isRegister ? 'A little space of your own' : 'Welcome back';
  $('#auth-copy').textContent = isRegister ? 'Create an account to start collecting your memories.' : 'Sign in to open your memories.';
  $('#name-field').classList.toggle('hidden', !isRegister);
  $('#shared-consent').classList.toggle('hidden', !isRegister);
  authForm.elements.sharedConsent.required = isRegister;
  authForm.elements.name.required = isRegister;
  authForm.elements.password.autocomplete = isRegister ? 'new-password' : 'current-password';
  $('#auth-submit').innerHTML = isRegister ? 'Create my space <span>↗</span>' : 'Sign in <span>↗</span>';
  $('#switch-auth').firstChild.textContent = isRegister ? 'Already have an account? ' : 'New here? ';
  $('#toggle-auth').textContent = isRegister ? 'Sign in instead' : 'Create an account';
  setNotice($('#auth-error'));
}

function showDashboard(user) {
  $('#intro').classList.add('hidden');
  authPanel.classList.add('hidden');
  sharedView.classList.add('hidden');
  dashboard.classList.remove('hidden');
  $('#user-name').textContent = user.name;
  $('#share-button').textContent = user.hasShareLink ? 'Copy album link' : 'Create share link';
  $('#revoke-share').classList.toggle('hidden', !user.hasShareLink);
  $('#share-status').textContent = user.hasShareLink
    ? 'Anyone with your album link can view these memories.'
    : 'All signed-in members can see these memories.';
  $('#contributor-button').textContent = user.hasContributorLink ? 'Copy upload link' : 'Create upload link';
  $('#revoke-contributor').classList.toggle('hidden', !user.hasContributorLink);
  $('#contributor-status').textContent = user.hasContributorLink
    ? 'Anyone with this link can view photos and videos, and add more.'
    : 'Create a private upload link for your girlfriend.';
  loadItems();
}

function addMemoryDate(container, date) {
  const time = document.createElement('time');
  time.className = 'memory-date';
  time.dateTime = date;
  const parsed = new Date(date);
  time.textContent = Number.isNaN(parsed.valueOf()) ? '' : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  container.append(time);
}

function makeButton(label, className, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function createCard(item, index, ownerView = false, sourceItems = items) {
  const card = document.createElement('article');
  card.className = item.kind === 'note' ? 'memory-card note-card' : 'memory-card';

  if (item.kind === 'note') {
    const mark = document.createElement('span');
    mark.className = 'note-mark';
    mark.textContent = '“';
    card.append(mark);
    const message = document.createElement('p');
    message.className = 'memory-title';
    message.textContent = item.text;
    card.append(message);
    if (item.ownerName) {
      const owner = document.createElement('small');
      owner.className = 'memory-owner';
      owner.textContent = `Added by ${item.ownerName}`;
      card.append(owner);
    }
  } else {
    const mediaFrame = document.createElement('div');
    mediaFrame.className = `media-frame ${item.kind === 'video' ? 'video-frame' : ''}`;
    mediaFrame.tabIndex = 0;
    mediaFrame.setAttribute('role', 'button');
    mediaFrame.setAttribute('aria-label', `Open ${item.kind === 'video' ? 'video' : 'photo'} memory${item.caption ? `: ${item.caption}` : ''}`);
    const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
    media.className = 'media-preview';
    media.src = item.mediaUrl;
    media.alt = item.caption || 'Saved memory';
    if (item.kind === 'video') {
      media.preload = 'metadata';
      media.playsInline = true;
      media.muted = true;
      const playMark = document.createElement('span');
      playMark.className = 'video-play-mark';
      playMark.setAttribute('aria-hidden', 'true');
      playMark.textContent = '▶';
      mediaFrame.append(playMark);
    } else {
      media.loading = 'lazy';
      media.decoding = 'async';
    }
    media.addEventListener('error', () => {
      media.remove();
      const fallback = document.createElement('div');
      fallback.className = 'media-error';
      fallback.textContent = 'This memory is unavailable right now';
      mediaFrame.prepend(fallback);
    }, { once: true });
    mediaFrame.append(media);
    const openCard = () => {
      const mediaItems = sourceItems.filter((candidate) => candidate.kind !== 'note');
      openViewer(mediaItems, mediaItems.findIndex((candidate) => candidate.id === item.id));
    };
    mediaFrame.addEventListener('click', openCard);
    mediaFrame.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCard(); }
    });
    card.append(mediaFrame);
    const body = document.createElement('div');
    body.className = 'memory-card-body';
    const caption = document.createElement('p');
    caption.className = 'memory-title';
    caption.textContent = item.caption || (item.kind === 'video' ? 'A little video memory' : 'A little photo memory');
    body.append(caption);
    if (item.ownerName) {
      const owner = document.createElement('small');
      owner.className = 'memory-owner';
      owner.textContent = `Added by ${item.ownerName}`;
      body.append(owner);
    }
    addMemoryDate(body, item.createdAt);
    if (ownerView && item.canDelete) {
      const actions = document.createElement('div');
      actions.className = 'memory-actions';
      actions.append(makeButton('Delete', 'delete', () => deleteItem(item.id)));
      body.append(actions);
    }
    card.append(body);
    card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;
    return card;
  }

  const details = document.createElement('div');
  if (item.kind === 'note') details.className = 'memory-card-body';
  addMemoryDate(details, item.createdAt);
  if (item.ownerName) {
    const owner = document.createElement('small');
    owner.className = 'memory-owner';
    owner.textContent = `Added by ${item.ownerName}`;
    details.prepend(owner);
  }
  if (ownerView && item.canDelete) {
    const actions = document.createElement('div');
    actions.className = 'memory-actions';
    const remove = makeButton('Delete', 'delete', () => deleteItem(item.id));
    remove.setAttribute('aria-label', 'Delete this memory');
    actions.append(remove);
    details.append(actions);
  }
  card.append(details);
  card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;
  return card;
}

function renderItems(target, list, ownerView = false) {
  target.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = ownerView
      ? 'No member memories yet. Add the first photo, video or note.'
      : 'There are no memories in this album yet.';
    target.append(empty);
    return;
  }
  list.forEach((item, index) => target.append(createCard(item, index, ownerView, list)));
}

async function loadItems() {
  try {
    const data = await api('/api/items');
    items = data.items;
    $('#memory-count').textContent = `${items.length} ${items.length === 1 ? 'memory' : 'memories'}`;
    renderItems($('#memories-grid'), items, true);
    setNotice($('#dashboard-error'));
  } catch (error) {
    if (error.status === 401) {
      dashboard.classList.add('hidden');
      authPanel.classList.remove('hidden');
      setNotice($('#auth-error'), 'Your session expired. Please sign in again.');
    } else setNotice($('#dashboard-error'), error.message);
  }
}

async function deleteItem(id) {
  if (!window.confirm('Remove this memory from your album?')) return;
  try {
    await api(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadItems();
  } catch (error) {
    setNotice($('#dashboard-error'), error.message);
  }
}

function openViewer(list, index) {
  if (!list.length || index < 0) return;
  viewerItems = list;
  viewerIndex = index;
  previousFocus = document.activeElement;
  renderViewer();
  $('#lightbox').classList.remove('hidden');
  $('#lb-close').focus();
  document.body.style.overflow = 'hidden';
}

function renderViewer() {
  const item = viewerItems[viewerIndex];
  const content = $('#lb-content');
  content.replaceChildren();
  const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
  media.src = item.mediaUrl;
  media.alt = item.caption || 'Memory';
  if (item.kind === 'video') {
    media.controls = true;
    media.autoplay = true;
    media.playsInline = true;
    media.preload = 'metadata';
  }
  content.append(media);
  if (item.caption) {
    const caption = document.createElement('div');
    caption.className = 'lb-caption';
    caption.textContent = item.caption;
    content.append(caption);
  }
  $('#lb-count').textContent = `${String(viewerIndex + 1).padStart(2, '0')}   /   ${String(viewerItems.length).padStart(2, '0')}`;
}

function closeViewer() {
  $('#lb-content').replaceChildren();
  $('#lightbox').classList.add('hidden');
  document.body.style.overflow = '';
  previousFocus?.focus?.();
}

function moveViewer(delta) {
  if (!viewerItems.length) return;
  viewerIndex = (viewerIndex + delta + viewerItems.length) % viewerItems.length;
  renderViewer();
}

async function loadSharedAlbum() {
  $('#intro').classList.add('hidden');
  authPanel.classList.add('hidden');
  dashboard.classList.add('hidden');
  sharedView.classList.remove('hidden');
  try {
    const data = await api(`/api/shared/${encodeURIComponent(shareToken)}`);
    $('#shared-owner').textContent = `${data.ownerName}’s memories`;
    renderItems($('#shared-grid'), data.items, false);
  } catch (error) {
    setNotice($('#shared-error'), error.message);
  }
}

async function loadContributorAlbum() {
  $('#intro').classList.add('hidden');
  authPanel.classList.add('hidden');
  dashboard.classList.add('hidden');
  sharedView.classList.remove('hidden');
  $('#shared-kicker').textContent = 'a little space for our memories';
  $('#shared-copy').textContent = 'Add a photo or video from your phone. It will appear in the album right away.';
  $('#contributor-form').classList.remove('hidden');
  try {
    const data = await api(`/api/contribute/${encodeURIComponent(contributorToken)}`);
    $('#shared-owner').textContent = `${data.ownerName}’s memories`;
    renderItems($('#shared-grid'), data.items, false);
    setNotice($('#shared-error'));
  } catch (error) {
    $('#contributor-form').classList.add('hidden');
    setNotice($('#shared-error'), error.message);
  }
}

$('#toggle-auth').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setNotice($('#auth-error'));
  const data = Object.fromEntries(new FormData(authForm));
  data.sharedConsent = authMode === 'register' && authForm.elements.sharedConsent.checked;
  setBusy(authForm, true);
  try {
    const result = await api(`/api/auth/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    authForm.reset();
    showDashboard(result.user);
  } catch (error) {
    setNotice($('#auth-error'), error.message);
  } finally {
    setBusy(authForm, false);
  }
});

$('#sign-out').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  dashboard.classList.add('hidden');
  authPanel.classList.remove('hidden');
  setAuthMode('login');
  setNotice($('#auth-error'), 'You are signed out. Sign in to see member memories.');
});

$('#message-text').addEventListener('input', (event) => {
  $('#char-count').textContent = `${event.currentTarget.value.length} / 3000`;
});
$('#message-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  setBusy(form, true);
  button.textContent = 'Saving…';
  try {
    await api('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: form.elements.text.value }) });
    form.reset();
    $('#char-count').textContent = '0 / 3000';
    await loadItems();
  } catch (error) {
    setNotice($('#dashboard-error'), error.message);
  } finally {
    setBusy(form, false);
    button.innerHTML = 'Save note <b>↗</b>';
  }
});

const fileInput = $('#media-file');
const dropzone = $('.dropzone');
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  $('#file-label').textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Choose a photo or video';
});

$('#contributor-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Making link…';
  try {
    const { url } = await api('/api/contributor-link', { method: 'POST' });
    const field = $('#contributor-url');
    field.value = url;
    field.classList.remove('hidden');
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { /* Leave link visible to copy manually. */ }
    $('#contributor-status').textContent = copied
      ? 'Upload link copied. Anyone with it can view and add photos/videos.'
      : 'Copy this link and send it to your girlfri…12496 tokens truncated…er-radius:10px;background:#fff}.admin-media{width:100%;aspect-ratio:4/3;display:block;object-fit:cover;background:#e9e0d8}.admin-memory-body{padding:12px}.admin-memory-owner{font-size:.59rem;color:var(--rose);letter-spacing:.04em}.admin-memory-caption{font:400 .94rem/1.5 var(--serif);margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}.admin-memory-date{display:block;margin:8px 0;color:var(--muted);font-size:.57rem}.delete-memory{min-height:32px;padding:0 10px;background:#fbefed;color:#a0444c}.delete-memory:hover{background:#f4d9d5}.admin-empty{grid-column:1/-1;padding:30px;text-align:center;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:.74rem}footer{padding:20px;text-align:center;color:var(--muted);font-size:.57rem;letter-spacing:.17em}@keyframes appear{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(max-width:700px){.admin-shell{margin-top:35px}.member-controls{grid-template-columns:1fr 1fr}.save-access{grid-column:1/-1}.admin-memory-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:470px){.admin-summary{gap:7px}.admin-summary>div{padding:12px}.admin-summary b{font-size:1.15rem}.admin-summary span{font-size:.52rem}.memory-tools{display:grid}.memory-tools input{max-width:none}.admin-memory-grid{grid-template-columns:1fr 1fr;gap:9px}.admin-memory-body{padding:9px}.member-controls{grid-template-columns:1fr}.save-access{grid-column:auto}.login-card{padding:26px}.admin-top{height:60px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
.admin-media-error{aspect-ratio:4/3;display:grid;place-items:center;padding:16px;color:var(--muted);font-size:.75rem;background:#eee4dd}
.admin-tools-card{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:24px 0 30px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(135deg,#fffdfa,#fbf1ee);box-shadow:0 14px 44px #45382c0b}.admin-upload,.admin-story-share{display:grid;align-content:start;gap:13px;padding:22px}.admin-story-share{border-left:1px solid var(--line);background:#fff9f5;border-radius:0 14px 14px 0}.admin-tool-copy h2{font:400 1.55rem var(--serif);margin:8px 0 5px}.admin-tool-copy p{font-size:.69rem;line-height:1.6;color:var(--muted);margin:0}.admin-file-pick{position:relative;display:flex;align-items:center;gap:10px;min-height:46px;padding:10px 13px;border:1px dashed #caa9a7;border-radius:8px;background:#fffdfa;color:var(--rose-dark);font-size:.72rem;font-weight:650;cursor:pointer;overflow:hidden}.admin-file-pick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.admin-caption{display:grid;gap:6px;color:var(--muted);font-size:.62rem}.admin-caption input,.story-link-url{height:40px;width:100%;padding:0 11px;border:1px solid var(--line);border-radius:7px;background:white;color:var(--ink);font:400 .72rem var(--sans)}.admin-tool-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.admin-tool-actions>span{color:var(--muted);font-size:.59rem}.admin-share-note{color:var(--muted);font-size:.58rem;line-height:1.6}.story-link-url{color:var(--rose-dark)}@media(max-width:700px){.admin-tools-card{grid-template-columns:1fr}.admin-story-share{border-left:0;border-top:1px solid var(--line);border-radius:0 0 14px 14px}.admin-upload,.admin-story-share{padding:18px}}
