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

function renderSpotifyResults(target, tracks, onSelect) {
  target.replaceChildren();
  tracks.forEach((track) => {
    const option = document.createElement('button'); option.type = 'button'; option.className = 'spotify-result';
    if (track.image) { const image = document.createElement('img'); image.src = track.image; image.alt = ''; image.loading = 'lazy'; option.append(image); }
    const copy = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = track.title;
    const info = document.createElement('small'); info.textContent = [track.artist, track.album].filter(Boolean).join(' · ');
    copy.append(title, info); option.append(copy); option.addEventListener('click', () => onSelect(track)); target.append(option);
  });
}

async function searchSpotifySongs(query, target, status, onSelect) {
  const term = query.trim();
  if (term.length < 2) { setNotice(status, 'Type at least 2 letters to search.'); target.replaceChildren(); return; }
  setNotice(status, 'Searching Spotify…'); target.replaceChildren();
  try {
    const results = await api(`/api/spotify/search?q=${encodeURIComponent(term)}`);
    renderSpotifyResults(target, results.tracks || [], onSelect);
    setNotice(status, results.tracks?.length ? `${results.tracks.length} songs found. Select one to add it.` : 'No songs found. Try another search.');
  } catch (error) { setNotice(status, error.message); }
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
  document.body.dataset.signedIn = 'true';
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
  loadMemoryBackground();
  loadSpotifyStatus();
}

async function loadSpotifyStatus() {
  const status = $('#spotify-status');
  try {
    const data = await api('/api/spotify/status');
    $('#spotify-connect').classList.toggle('hidden', !data.configured || data.connected);
    $('#spotify-profile').classList.toggle('hidden', !data.connected);
    $('#spotify-disconnect').classList.toggle('hidden', !data.connected);
    status.textContent = data.connected
      ? `Connected to Spotify${data.displayName ? ` as ${data.displayName}` : ''}.`
      : (data.configured ? 'Connect your Spotify account to this private space.' : 'Spotify connection is not configured on the server yet.');
  } catch (error) { status.textContent = error.message || 'Spotify status could not be loaded.'; }

  const params = new URLSearchParams(location.search);
  const result = params.get('spotify');
  if (result) {
    const messages = {
      connected: 'Spotify connected successfully.',
      denied: 'Spotify connection was cancelled.',
      invalid: 'Spotify sign-in expired or could not be verified. Please try again.',
      error: 'Spotify could not connect. Please try again.'
    };
    if (messages[result]) status.textContent = messages[result];
    params.delete('spotify');
    const suffix = params.size ? `?${params.toString()}` : '';
    history.replaceState(null, '', `${location.pathname}${suffix}${location.hash}`);
  }
}

$('#spotify-profile').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  $('#spotify-status').textContent = 'Checking your Spotify connection…';
  try {
    const profile = await api('/api/spotify/profile');
    $('#spotify-status').textContent = `Spotify connected${profile.displayName ? ` as ${profile.displayName}` : ''}${profile.product ? ` · ${profile.product} account` : ''}.`;
  } catch (error) { $('#spotify-status').textContent = error.message; }
  finally { button.disabled = false; }
});

$('#spotify-disconnect').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/spotify/connection', { method: 'DELETE' });
    await loadSpotifyStatus();
    $('#spotify-status').textContent = 'Spotify disconnected.';
  } catch (error) { $('#spotify-status').textContent = error.message; }
  finally { button.disabled = false; }
});

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

function addMemoryTools(container, item) {
  const actions = document.createElement('div');
  actions.className = 'memory-actions memory-tools-row';
  if ((item.kind === 'image' || item.kind === 'video') && item.spotifyTrack) {
    const listen = document.createElement('a');
    listen.className = 'memory-tool-button'; listen.href = item.spotifyTrack.url;
    listen.target = '_blank'; listen.rel = 'noopener noreferrer';
    listen.textContent = `♫ Open Spotify · ${item.spotifyTrack.title}`;
    actions.append(listen);
    const playerDetails = document.createElement('details');
    playerDetails.className = 'memory-spotify-player';
    const playerSummary = document.createElement('summary');
    playerSummary.textContent = 'Play here';
    playerDetails.append(playerSummary);
    playerDetails.addEventListener('toggle', () => {
      if (!playerDetails.open || playerDetails.querySelector('iframe')) return;
      const frame = document.createElement('iframe');
      frame.src = `https://open.spotify.com/embed/track/${encodeURIComponent(item.spotifyTrack.id)}?utm_source=generator`;
      frame.title = `Spotify track: ${item.spotifyTrack.title || 'Memory song'}`;
      frame.loading = 'lazy'; frame.allowFullscreen = true;
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      playerDetails.append(frame);
    });
    actions.append(playerDetails);
  }
  if ((item.kind === 'image' || item.kind === 'video') && item.canDelete && document.body.dataset.signedIn === 'true') {
    const songForm = document.createElement('form');
    songForm.className = 'memory-song-form member-memory-song-form';
    const songInput = document.createElement('input');
    songInput.type = 'url'; songInput.maxLength = 500; songInput.required = true;
    songInput.placeholder = item.spotifyTrack ? 'Change Spotify song link' : 'Add Spotify song link';
    songInput.setAttribute('aria-label', 'Spotify song link for this memory');
    const saveSong = document.createElement('button');
    saveSong.type = 'submit'; saveSong.textContent = item.spotifyTrack ? 'Change song' : 'Add song';
    songForm.append(songInput, saveSong);
    songForm.addEventListener('submit', async (event) => {
      event.preventDefault(); saveSong.disabled = true;
      try {
        await api(`/api/items/${encodeURIComponent(item.id)}/spotify-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: songInput.value.trim() }) });
        await loadItems(); setNotice($('#dashboard-error'), 'Spotify song saved with this memory.');
      } catch (error) { setNotice($('#dashboard-error'), error.message); saveSong.disabled = false; }
    });
    actions.append(songForm);
    const picker = document.createElement('div'); picker.className = 'spotify-picker member-spotify-picker';
    const searchInput = document.createElement('input'); searchInput.type = 'search'; searchInput.maxLength = 100; searchInput.placeholder = 'Search Spotify songs or artists'; searchInput.setAttribute('aria-label', 'Search Spotify songs');
    const searchButton = document.createElement('button'); searchButton.type = 'button'; searchButton.className = 'memory-tool-button'; searchButton.textContent = 'Search songs';
    const searchStatus = document.createElement('small'); searchStatus.setAttribute('role', 'status');
    const results = document.createElement('div'); results.className = 'spotify-search-results';
    searchButton.addEventListener('click', () => searchSpotifySongs(searchInput.value, results, searchStatus, async (track) => {
      searchButton.disabled = true;
      try {
        await api(`/api/items/${encodeURIComponent(item.id)}/spotify-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: track.id, title: `${track.title} · ${track.artist}` }) });
        await loadItems(); setNotice($('#dashboard-error'), `“${track.title}” added to this memory.`);
      } catch (error) { setNotice(searchStatus, error.message); searchButton.disabled = false; }
    }));
    searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchButton.click(); } });
    picker.append(searchInput, searchButton, searchStatus, results); actions.append(picker);
    if (item.spotifyTrack) {
      actions.append(makeButton('Remove song', 'memory-tool-button', async () => {
        try { await api(`/api/items/${encodeURIComponent(item.id)}/spotify-track`, { method: 'DELETE' }); await loadItems(); setNotice($('#dashboard-error'), 'Song removed from this memory.'); }
        catch (error) { setNotice($('#dashboard-error'), error.message); }
      }));
    }
  }
  if (item.mediaUrl) {
    const download = document.createElement('a');
    download.className = 'memory-tool-button';
    download.href = `${item.mediaUrl}${item.mediaUrl.includes('?') ? '&' : '?'}download=1`;
    download.download = `memory-${item.id}`;
    download.textContent = '↓ Download';
    actions.append(download);
  } else if (item.kind === 'note') {
    actions.append(makeButton('↓ Download note', 'memory-tool-button', () => {
      const url = URL.createObjectURL(new Blob([item.text], { type: 'text/plain;charset=utf-8' }));
      const download = document.createElement('a');
      download.href = url;
      download.download = `memory-${item.id}.txt`;
      download.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
  }
  if (document.body.dataset.signedIn === 'true' || contributorToken) {
    actions.append(makeButton('↗ Share', 'memory-tool-button memory-share-button', () => shareMemory(item)));
  }
  if (document.body.dataset.signedIn === 'true') {
    actions.append(makeButton(item.userHidden ? '↶ Restore' : 'Hide', 'memory-tool-button memory-hide-button', () => setMemoryHidden(item, !item.userHidden)));
  }
  return actions;
}

async function setMemoryHidden(item, hidden) {
  try {
    await api(`/api/items/${encodeURIComponent(item.id)}/hide`, { method: hidden ? 'POST' : 'DELETE' });
    await loadItems();
    if (!$('#hidden-items-section').classList.contains('hidden')) await loadHiddenItems();
    setNotice($('#dashboard-error'), hidden ? 'Memory hidden from your album. You can restore it any time.' : 'Memory restored to your album.');
  } catch (error) { setNotice($('#dashboard-error'), error.message || 'Could not update this memory.'); }
}

async function shareMemory(item) {
  const button = document.activeElement;
  if (button instanceof HTMLButtonElement) { button.disabled = true; button.textContent = 'Making link…'; }
  try {
    const sharePath = contributorToken
      ? `/api/contribute/${encodeURIComponent(contributorToken)}/items/${encodeURIComponent(item.id)}/share`
      : `/api/items/${encodeURIComponent(item.id)}/share`;
    const { url } = await api(sharePath, { method: 'POST' });
    const feedback = contributorToken ? $('#shared-error') : $('#dashboard-error');
    if (navigator.share) {
      try { await navigator.share({ title: item.caption || 'A memory', text: 'A memory to keep', url }); }
      catch (error) {
        if (error.name === 'AbortError') return;
        await navigator.clipboard.writeText(url);
        setNotice(feedback, 'Private link to this memory copied.');
      }
    } else {
      await navigator.clipboard.writeText(url);
      setNotice(feedback, 'Private link to this memory copied.');
    }
  } catch (error) {
    setNotice(contributorToken ? $('#shared-error') : $('#dashboard-error'), error.message || 'Could not copy the link.');
  } finally {
    if (button instanceof HTMLButtonElement) { button.disabled = false; button.textContent = '↗ Share'; }
  }
}

async function loadMemoryBackground() {
  const backdrop = $('#memory-backdrop');
  backdrop.replaceChildren();
  backdrop.classList.remove('active');
  try {
    const { background } = await api('/api/background');
    if (!background) return;
    const media = document.createElement(background.kind === 'video' ? 'video' : 'img');
    media.src = background.mediaUrl;
    media.alt = '';
    if (background.kind === 'video') { media.autoplay = true; media.loop = true; media.muted = true; media.playsInline = true; media.preload = 'metadata'; }
    media.addEventListener('error', () => { backdrop.replaceChildren(); backdrop.classList.remove('active'); }, { once: true });
    backdrop.append(media);
    backdrop.classList.add('active');
  } catch { /* The gallery remains readable if no background is selected. */ }
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
    const tools = addMemoryTools(body, item);
    if (ownerView && item.canDelete) {
      tools.append(makeButton('Delete', 'delete', () => deleteItem(item.id)));
    }
    if (tools.hasChildNodes()) body.append(tools);
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
    const remove = makeButton('Delete', 'delete', () => deleteItem(item.id));
    remove.setAttribute('aria-label', 'Delete this memory');
    const tools = addMemoryTools(details, item);
    tools.append(remove);
    details.append(tools);
  } else {
    const tools = addMemoryTools(details, item);
    if (tools.hasChildNodes()) details.append(tools);
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
    const hiddenCount = Number(data.hiddenCount) || 0;
    $('#hidden-memory-count').textContent = String(hiddenCount);
    $('#hidden-items-toggle').classList.toggle('hidden', hiddenCount === 0 && $('#hidden-items-section').classList.contains('hidden'));
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

async function loadHiddenItems() {
  const grid = $('#hidden-memories-grid');
  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Loading hidden memories…';
  grid.replaceChildren(loading);
  try {
    const data = await api('/api/hidden-items');
    renderItems(grid, data.items, true);
    if (!data.items.length) {
      $('#hidden-items-toggle').classList.add('hidden');
      $('#hidden-items-section').classList.add('hidden');
      $('#hidden-items-toggle').setAttribute('aria-expanded', 'false');
    }
  } catch (error) {
    grid.replaceChildren();
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.textContent = error.message || 'Could not load hidden memories.';
    grid.append(message);
  }
}

$('#hidden-items-toggle').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const section = $('#hidden-items-section');
  const opening = section.classList.contains('hidden');
  section.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', String(opening));
  button.classList.toggle('hidden', !opening && Number($('#hidden-memory-count').textContent) === 0);
  if (opening) { await loadHiddenItems(); section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});
$('#hidden-items-close').addEventListener('click', () => {
  $('#hidden-items-section').classList.add('hidden');
  $('#hidden-items-toggle').setAttribute('aria-expanded', 'false');
  $('#hidden-items-toggle').focus();
});

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
  document.body.dataset.signedIn = 'false';
  $('#memory-backdrop').replaceChildren();
  $('#memory-backdrop').classList.remove('active');
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
  document.body.dataset.signedIn = 'false';
  $('#memory-backdrop').replaceChildren();
  $('#memory-backdrop').classList.remove('active');
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
      : 'Copy this link and send it to your girlfriend.';
    $('#revoke-contributor').classList.remove('hidden');
    button.textContent = 'Copy upload link';
    if (!copied) { field.focus(); field.select(); }
  } catch (error) {
    $('#contributor-status').textContent = error.message;
    button.textContent = 'Try again';
  } finally { button.disabled = false; }
});

$('#revoke-contributor').addEventListener('click', async (event) => {
  if (!window.confirm('Revoke this upload link? It will stop working for everyone.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/contributor-link', { method: 'DELETE' });
    $('#contributor-status').textContent = 'Upload link revoked.';
    $('#contributor-button').textContent = 'Create upload link';
    $('#contributor-url').value = '';
    $('#contributor-url').classList.add('hidden');
    button.classList.add('hidden');
  } catch (error) { $('#contributor-status').textContent = error.message; }
  finally { button.disabled = false; }
});

const contributorFile = $('#contributor-file');
contributorFile.addEventListener('change', () => {
  const files = Array.from(contributorFile.files);
  $('#contributor-file-label').textContent = files.length === 1
    ? `${files[0].name} · ${(files[0].size / 1024 / 1024).toFixed(1)} MB`
    : files.length ? `${files.length} photos or videos selected` : 'Choose photos or videos';
});
$('#contributor-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const files = Array.from(contributorFile.files);
  if (!files.length) return;
  if (files.some((file) => file.size > 100 * 1024 * 1024)) {
    setNotice($('#shared-error'), 'Each photo or video must be smaller than 100 MB.');
    return;
  }
  const button = $('#contributor-submit');
  button.disabled = true;
  const hint = form.querySelector('.contributor-hint');
  const defaultHint = 'This private link lets you add photos and videos to the album.';
  button.textContent = 'Adding memories…';
  setNotice($('#shared-error'));
  let uploadedCount = 0;
  try {
    for (let index = 0; index < files.length; index += 1) {
      hint.textContent = `Uploading ${index + 1} of ${files.length}…`;
      const payload = new FormData();
      payload.append('file', files[index]);
      payload.append('caption', form.elements.caption.value);
      await api(`/api/contribute/${encodeURIComponent(contributorToken)}/media`, { method: 'POST', body: payload });
      uploadedCount += 1;
    }
    form.reset();
    $('#contributor-file-label').textContent = 'Choose photos or videos';
    await loadContributorAlbum();
    $('#shared-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (uploadedCount) {
      form.reset();
      $('#contributor-file-label').textContent = 'Choose photos or videos';
      await loadContributorAlbum();
      setNotice($('#shared-error'), `${uploadedCount} ${uploadedCount === 1 ? 'file was' : 'files were'} added. Select any remaining files again. ${error.message}`);
    } else setNotice($('#shared-error'), error.message);
  }
  finally { hint.textContent = defaultHint; button.disabled = false; button.innerHTML = 'Add to our memories <span>♡</span>'; }
});
for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragover'); });
for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragover'); });
dropzone.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change'));
});

$('#upload-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = fileInput.files[0];
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) {
    setNotice($('#dashboard-error'), 'Choose a photo or video smaller than 100 MB.');
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  const payload = new FormData(form);
  setBusy(form, true);
  submit.textContent = 'Uploading…';
  $('#upload-progress').textContent = 'Saving to the shared gallery…';
  setNotice($('#dashboard-error'));
  try {
    await api('/api/media', { method: 'POST', body: payload });
    form.reset();
    $('#file-label').textContent = 'Choose a photo or video';
    $('#upload-progress').textContent = 'Shared with signed-in members';
    await loadItems();
  } catch (error) {
    setNotice($('#dashboard-error'), error.message);
    $('#upload-progress').textContent = 'Upload did not finish.';
  } finally {
    setBusy(form, false);
    submit.innerHTML = 'Upload memory <b>↗</b>';
  }
});

$('#share-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.textContent = 'Making link…';
  button.disabled = true;
  try {
    const data = await api('/api/share', { method: 'POST' });
    const linkField = $('#share-url');
    linkField.value = data.url;
    linkField.classList.remove('hidden');
    let copied = false;
    try {
      await navigator.clipboard.writeText(data.url);
      copied = true;
    } catch { /* The read-only link stays visible for manual copying. */ }
    $('#share-status').textContent = copied
      ? 'Album link copied. Anyone with it can view your memories.'
      : 'Copy this link to share your album with someone.';
    button.textContent = 'Copy album link';
    $('#revoke-share').classList.remove('hidden');
    if (!copied) {
      linkField.focus();
      linkField.select();
    }
  } catch (error) {
    $('#share-status').textContent = error.message;
    button.textContent = 'Try again';
  } finally {
    button.disabled = false;
  }
});

$('#revoke-share').addEventListener('click', async (event) => {
  if (!window.confirm('Turn off this album link? Anyone who has it will lose access to the album.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/share', { method: 'DELETE' });
    $('#share-status').textContent = 'Link revoked. Signed-in members can still see memories allowed for this album.';
    $('#share-button').textContent = 'Create share link';
    $('#share-url').value = '';
    $('#share-url').classList.add('hidden');
    button.classList.add('hidden');
  } catch (error) {
    $('#share-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#lb-close').addEventListener('click', closeViewer);
$('#lb-prev').addEventListener('click', () => moveViewer(-1));
$('#lb-next').addEventListener('click', () => moveViewer(1));
$('#lightbox').addEventListener('click', (event) => { if (event.target.id === 'lightbox') closeViewer(); });
document.addEventListener('keydown', (event) => {
  if ($('#lightbox').classList.contains('hidden')) return;
  if (event.key === 'Escape') closeViewer();
  if (event.key === 'ArrowLeft') moveViewer(-1);
  if (event.key === 'ArrowRight') moveViewer(1);
});
let touchStartX = 0;
$('#lightbox').addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
$('#lightbox').addEventListener('touchend', (event) => {
  const delta = event.changedTouches[0].screenX - touchStartX;
  if (Math.abs(delta) > 55) moveViewer(delta < 0 ? 1 : -1);
}, { passive: true });

document.querySelectorAll('.mobile-dock [data-scroll-to]').forEach((button) => button.addEventListener('click', () => {
  document.getElementById(button.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

let installPrompt = null;
const installButton = $('#install-app');
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.classList.remove('hidden');
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.classList.add('hidden');
});
window.addEventListener('appinstalled', () => installButton.classList.add('hidden'));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

addEventListener('scroll', () => {
  const scrollable = document.documentElement.scrollHeight - innerHeight;
  $('#progress').style.width = `${scrollable > 0 ? scrollY / scrollable * 100 : 0}%`;
}, { passive: true });

if (adminPath) {
  location.replace('/Admin/login');
} else if (contributorToken) {
  loadContributorAlbum();
} else if (shareToken) {
  loadSharedAlbum();
} else {
  api('/api/auth/me').then(({ user }) => showDashboard(user)).catch((error) => {
    if (error.status !== 401) setNotice($('#auth-error'), error.message);
  });
}
