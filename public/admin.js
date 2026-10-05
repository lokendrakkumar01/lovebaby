const $ = (selector) => document.querySelector(selector);
const loginCard = $('#login-card');
const adminApp = $('#admin-app');
const loginForm = $('#admin-login');
const adminUploadForm = $('#admin-upload');
let members = [];
let memories = [];
let backgroundId = null;
let storyMemoryIds = null;
let storySavedUrl = null;

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

function notice(element, message = '') { element.textContent = message; }

function renderSpotifyResults(target, tracks, onSelect) {
  target.replaceChildren();
  tracks.forEach((track) => {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'spotify-result';
    if (track.image) { const cover = document.createElement('img'); cover.src = track.image; cover.alt = ''; cover.loading = 'lazy'; option.append(cover); }
    const copy = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = track.title;
    const meta = document.createElement('small'); meta.textContent = [track.artist, track.album].filter(Boolean).join(' · ');
    copy.append(title, meta); option.append(copy);
    option.addEventListener('click', () => onSelect(track));
    target.append(option);
  });
}

async function searchSpotify(endpoint, query, target, status, onSelect) {
  const term = query.trim();
  if (term.length < 2) { notice(status, 'Type at least 2 letters to search.'); target.replaceChildren(); return; }
  notice(status, 'Searching Spotify…');
  target.replaceChildren();
  try {
    const data = await api(`${endpoint}?q=${encodeURIComponent(term)}`);
    renderSpotifyResults(target, data.tracks || [], onSelect);
    notice(status, data.tracks?.length ? `${data.tracks.length} songs found. Select one to use it.` : 'No songs found. Try another search.');
  } catch (error) { notice(status, error.message); }
}

function displayAdmin() {
  loginCard.classList.add('hidden');
  adminApp.classList.remove('hidden');
}

function addEmpty(target, message) {
  const empty = document.createElement('div');
  empty.className = 'admin-empty';
  empty.textContent = message;
  target.append(empty);
}

function renderMembers() {
  const target = $('#users-view');
  target.replaceChildren();
  $('#user-total').textContent = String(members.length);
  if (!members.length) return addEmpty(target, 'No accounts have signed up yet.');
  const list = document.createElement('div');
  list.className = 'member-list';
  members.forEach((member, index) => {
    const card = document.createElement('article');
    card.className = 'member-card';
    card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;

    const header = document.createElement('div');
    header.className = 'member-heading';
    const identity = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = member.name || 'Member';
    const email = document.createElement('p');
    email.textContent = member.email;
    identity.append(name, email);
    const badge = document.createElement('span');
    badge.className = `member-badge${member.suspended ? ' suspended' : ''}`;
    badge.textContent = member.suspended ? 'Disabled' : 'Active';
    header.append(identity, badge);
    card.append(header);

    const controls = document.createElement('div');
    controls.className = 'member-controls';
    const visibilityLabel = document.createElement('label');
    visibilityLabel.textContent = 'Who can view this album';
    const visibility = document.createElement('select');
    for (const [value, text] of [['all', 'All signed-in members'], ['selected', 'Selected members'], ['private', 'Owner only']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      visibility.append(option);
    }
    visibility.value = member.visibility;
    visibilityLabel.append(visibility);

    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Account status';
    const status = document.createElement('select');
    for (const [value, text] of [['active', 'Active'], ['disabled', 'Disabled']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      status.append(option);
    }
    status.value = member.suspended ? 'disabled' : 'active';
    statusLabel.append(status);

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'save-access';
    save.textContent = 'Save access';
    controls.append(visibilityLabel, statusLabel, save);
    card.append(controls);

    const recipients = document.createElement('details');
    recipients.className = 'recipient-list';
    recipients.open = member.visibility === 'selected';
    const summary = document.createElement('summary');
    summary.textContent = 'Choose which members can see this album';
    const options = document.createElement('div');
    options.className = 'recipient-options';
    const eligible = members.filter((candidate) => candidate.id !== member.id && !candidate.suspended);
    eligible.forEach((candidate) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = candidate.id;
      checkbox.checked = member.visibleTo.includes(candidate.id);
      label.append(checkbox, document.createTextNode(`${candidate.name} · ${candidate.email}`));
      options.append(label);
    });
    if (!eligible.length) {
      const help = document.createElement('small');
      help.className = 'member-footnote';
      help.textContent = 'There are no other active members yet.';
      options.append(help);
    }
    recipients.append(summary, options);
    card.append(recipients);

    const footnote = document.createElement('div');
    footnote.className = 'member-footnote';
    footnote.textContent = 'Members can add to the shared gallery. Disabling an account signs it out and hides its album. Restricted albums lose their public view and contributor links.';
    card.append(footnote);

    visibility.addEventListener('change', () => { recipients.classList.toggle('hidden', visibility.value !== 'selected'); });
    save.addEventListener('click', async () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      const visibleTo = Array.from(options.querySelectorAll('input:checked')).map((input) => input.value);
      try {
        await api(`/api/admin/users/${encodeURIComponent(member.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: visibility.value, visibleTo, suspended: status.value === 'disabled' })
        });
        notice($('#admin-notice'), `Access updated for ${member.name}.`);
        await loadMembers();
      } catch (error) { notice($('#admin-notice'), error.message); }
      finally { save.disabled = false; save.textContent = 'Save access'; }
    });
    list.append(card);
  });
  target.append(list);
}

function renderMemories() {
  const target = $('#admin-memory-grid');
  target.replaceChildren();
  $('#memory-total').textContent = String(memories.length);
  const query = $('#memory-search').value.trim().toLowerCase();
  const filtered = memories.filter((item) => `${item.ownerName} ${item.caption} ${item.text}`.toLowerCase().includes(query));
  if (!filtered.length) return addEmpty(target, query ? 'No memories match that search.' : 'No memories have been added yet.');
  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'admin-memory';
    if (item.kind === 'image' && item.mediaUrl) {
      const media = document.createElement('img');
      media.className = 'admin-media';
      media.src = item.mediaUrl;
      media.alt = item.caption || 'Member photo';
      media.loading = 'lazy';
      media.addEventListener('error', () => { media.replaceWith(Object.assign(document.createElement('div'), { className: 'admin-media-error', textContent: 'Media unavailable' })); }, { once: true });
      card.append(media);
    } else if (item.kind === 'video' && item.mediaUrl) {
      const media = document.createElement('video');
      media.className = 'admin-media';
      media.src = item.mediaUrl;
      media.controls = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.addEventListener('error', () => { media.replaceWith(Object.assign(document.createElement('div'), { className: 'admin-media-error', textContent: 'Media unavailable' })); }, { once: true });
      card.append(media);
    }
    const body = document.createElement('div');
    body.className = 'admin-memory-body';
    const owner = document.createElement('div');
    owner.className = 'admin-memory-owner';
    owner.textContent = `Added by ${item.ownerName}`;
    body.append(owner);
    const caption = document.createElement('p');
    caption.className = 'admin-memory-caption';
    caption.textContent = item.kind === 'note' ? item.text : (item.caption || (item.kind === 'video' ? 'Video memory' : 'Photo memory'));
    body.append(caption);
    if (item.kind === 'image' || item.kind === 'video') {
      const songPanel = document.createElement('div');
      songPanel.className = 'memory-song-panel';
      if (item.spotifyTrack) {
        const current = document.createElement('a');
        current.href = item.spotifyTrack.url;
        current.target = '_blank';
        current.rel = 'noopener noreferrer';
        current.textContent = `♫ ${item.spotifyTrack.title} · Open on Spotify`;
        songPanel.append(current);
      }
      if (!item.adminHidden) {
        const form = document.createElement('form');
        form.className = 'memory-song-form';
        const input = document.createElement('input');
        input.type = 'url'; input.maxLength = 500; input.required = true;
        input.placeholder = 'Spotify track link'; input.setAttribute('aria-label', 'Spotify track link');
        const saveSong = document.createElement('button');
        saveSong.type = 'submit'; saveSong.textContent = item.spotifyTrack ? 'Change song' : 'Add song';
        form.append(input, saveSong);
        form.addEventListener('submit', async (event) => {
          event.preventDefault(); saveSong.disabled = true;
          try {
            const result = await api(`/api/admin/items/${encodeURIComponent(item.id)}/spotify-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: input.value.trim() }) });
            item.spotifyTrack = result.spotifyTrack; renderMemories(); notice($('#admin-notice'), 'Spotify song added to this memory.');
          } catch (error) { notice($('#admin-notice'), error.message); saveSong.disabled = false; }
        });
        songPanel.append(form);
        const searchBox = document.createElement('div'); searchBox.className = 'spotify-picker memory-spotify-picker';
        const searchInput = document.createElement('input'); searchInput.type = 'search'; searchInput.maxLength = 100; searchInput.placeholder = 'Search songs or artists'; searchInput.setAttribute('aria-label', 'Search Spotify songs');
        const searchButton = document.createElement('button'); searchButton.type = 'button'; searchButton.className = 'quiet'; searchButton.textContent = 'Search';
        const searchStatus = document.createElement('small'); searchStatus.setAttribute('role', 'status');
        const results = document.createElement('div'); results.className = 'spotify-search-results';
        searchButton.addEventListener('click', () => searchSpotify('/api/admin/spotify/search', searchInput.value, results, searchStatus, async (track) => {
          searchButton.disabled = true;
          try {
            const updated = await api(`/api/admin/items/${encodeURIComponent(item.id)}/spotify-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: track.id, title: `${track.title} · ${track.artist}` }) });
            item.spotifyTrack = updated.spotifyTrack; renderMemories(); notice($('#admin-notice'), `“${track.title}” added to this memory.`);
          } catch (error) { notice(searchStatus, error.message); searchButton.disabled = false; }
        }));
        searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchButton.click(); } });
        searchBox.append(searchInput, searchButton, searchStatus, results); songPanel.append(searchBox);
      }
      if (item.spotifyTrack) {
        const clearSong = document.createElement('button');
        clearSong.type = 'button'; clearSong.className = 'quiet'; clearSong.textContent = 'Remove song';
        clearSong.addEventListener('click', async () => {
          clearSong.disabled = true;
          try { await api(`/api/admin/items/${encodeURIComponent(item.id)}/spotify-track`, { method: 'DELETE' }); item.spotifyTrack = null; renderMemories(); notice($('#admin-notice'), 'Song removed from memory.'); }
          catch (error) { notice($('#admin-notice'), error.message); clearSong.disabled = false; }
        });
        songPanel.append(clearSong);
      }
      body.append(songPanel);
    }
    if (item.adminHidden) {
      const hiddenNotice = document.createElement('div');
      hiddenNotice.className = 'admin-hidden-badge';
      hiddenNotice.textContent = item.adminHiddenReason ? `Hidden from members · ${item.adminHiddenReason}` : 'Hidden from members';
      body.append(hiddenNotice);
    }
    const storyChoice = document.createElement('label');
    storyChoice.className = 'story-memory-choice';
    const storyCheckbox = document.createElement('input');
    storyCheckbox.type = 'checkbox';
    storyCheckbox.checked = !item.adminHidden && item.storyEligible && (storyMemoryIds === null || storyMemoryIds.includes(item.id));
    storyCheckbox.disabled = item.adminHidden || !item.storyEligible;
    storyCheckbox.setAttribute('aria-label', `Include ${item.caption || item.text || 'memory'} in the love story`);
    storyCheckbox.addEventListener('change', () => {
      if (storyMemoryIds === null) storyMemoryIds = memories.filter((memory) => memory.storyEligible).map((memory) => memory.id);
      storyMemoryIds = storyCheckbox.checked
        ? [...new Set([...storyMemoryIds, item.id])]
        : storyMemoryIds.filter((id) => id !== item.id);
      notice($('#story-link-status'), 'Memory selection changed. Save the story to apply it to the link.');
    });
    storyChoice.append(storyCheckbox, document.createTextNode(item.adminHidden ? ' Hidden from public story' : (item.storyEligible ? ' Include in story' : ' Not available in public story')));
    body.append(storyChoice);
    if (item.createdAt) {
      const date = document.createElement('time');
      date.className = 'admin-memory-date';
      date.dateTime = item.createdAt;
      const parsed = new Date(item.createdAt);
      date.textContent = Number.isNaN(parsed.valueOf()) ? '' : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      body.append(date);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-memory';
    remove.textContent = 'Delete memory';
    remove.addEventListener('click', async () => {
      if (!window.confirm('Delete this memory from Cloudinary and the shared gallery?')) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        memories = memories.filter((candidate) => candidate.id !== item.id);
        if (Array.isArray(storyMemoryIds)) storyMemoryIds = storyMemoryIds.filter((id) => id !== item.id);
        if (backgroundId === item.id) { backgroundId = null; $('#clear-background').classList.add('hidden'); }
        renderMemories();
        notice($('#admin-notice'), 'Memory deleted.');
      } catch (error) { notice($('#admin-notice'), error.message); remove.disabled = false; }
    });
    const actions = document.createElement('div');
    actions.className = 'admin-memory-actions';
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'set-background admin-visibility';
    visibility.textContent = item.adminHidden ? '↗ Restore for members' : 'Hide from members';
    visibility.addEventListener('click', async () => {
      const reason = item.adminHidden ? '' : window.prompt('Optional note for admins about why this memory is hidden:', '');
      if (reason === null) return;
      visibility.disabled = true;
      try {
        const updated = await api(`/api/admin/items/${encodeURIComponent(item.id)}/hide`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hidden: !item.adminHidden, reason })
        });
        item.adminHidden = updated.hidden;
        item.adminHiddenReason = updated.hidden ? reason.trim().slice(0, 300) : '';
        renderMemories();
        notice($('#admin-notice'), updated.hidden ? 'Memory hidden from members and public links.' : 'Memory restored for members.');
      } catch (error) { notice($('#admin-notice'), error.message); visibility.disabled = false; }
    });
    actions.append(visibility);
    if (item.mediaUrl) {
      const download = document.createElement('a');
      download.className = 'set-background';
      download.href = `${item.mediaUrl}?download=1`;
      download.download = `memory-${item.id}`;
      download.textContent = '↓ Download memory';
      actions.append(download);
    }
    if (item.kind === 'image' || item.kind === 'video') {
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'set-background';
      choose.textContent = backgroundId === item.id ? '✓ App background' : 'Use as app background';
      choose.disabled = backgroundId === item.id;
      choose.addEventListener('click', async () => {
        choose.disabled = true;
        try {
          const result = await api('/api/admin/background', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memoryId: item.id }) });
          backgroundId = result.memoryId;
          renderMemories();
          notice($('#admin-notice'), 'The app background is updated. Members will see it after refreshing their gallery.');
        } catch (error) { notice($('#admin-notice'), error.message); choose.disabled = false; }
      });
      actions.append(choose);
    }
    actions.append(remove);
    body.append(actions);
    card.append(body);
    target.append(card);
  });
}

async function loadMembers() {
  const data = await api('/api/admin/users');
  members = data.users;
  renderMembers();
}

async function loadMemories() {
  const data = await api('/api/admin/memories');
  memories = data.items;
  renderMemories();
}

async function loadBackground() {
  const data = await api('/api/admin/background');
  backgroundId = data.memoryId;
  $('#clear-background').classList.toggle('hidden', !backgroundId);
  if (memories.length) renderMemories();
}

function showStoryLink(url) {
  storySavedUrl = url || null;
  const field = $('#story-link-url');
  const actions = $('#story-link-actions');
  field.value = url || '';
  field.classList.toggle('hidden', !url);
  actions.classList.toggle('hidden', !url);
  $('#revoke-story-link').classList.toggle('hidden', !url);
  $('#open-story-link').href = url || '#';
}

function storyPayload() {
  return {
    title: $('#story-title').value.trim(),
    subtitle: $('#story-subtitle').value.trim(),
    message: $('#story-message').value.trim(),
    spotifyTrackUrl: $('#story-song-url').value.trim(),
    spotifyTrackId: $('#story-song-id').value,
    spotifyTrackTitle: $('#story-song-title').value,
    memoryIds: storyMemoryIds
  };
}

async function saveStory() {
  const data = await api('/api/admin/story', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storyPayload())
  });
  storyMemoryIds = data.story.memoryIds;
  renderMemories();
  return data;
}

async function loadStory() {
  const data = await api('/api/admin/story');
  const story = data.story || {};
  $('#story-title').value = story.title || 'Love My Jaan';
  $('#story-subtitle').value = story.subtitle || '';
  $('#story-message').value = story.message || '';
  $('#story-song-url').value = story.spotifyTrack?.url || '';
  $('#story-song-id').value = story.spotifyTrack?.id || '';
  $('#story-song-title').value = story.spotifyTrack?.title || '';
  storyMemoryIds = Array.isArray(story.memoryIds) ? story.memoryIds : null;
  showStoryLink(data.url);
  renderMemories();
}

$('#story-song-search-button').addEventListener('click', () => searchSpotify('/api/admin/spotify/search', $('#story-song-search').value, $('#story-song-search-results'), $('#story-song-search-status'), (track) => {
  $('#story-song-url').value = track.url;
  $('#story-song-id').value = track.id;
  $('#story-song-title').value = `${track.title} · ${track.artist}`;
  notice($('#story-song-search-status'), `Selected “${track.title}”. Save the story to apply it.`);
}));
$('#story-song-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('#story-song-search-button').click(); } });
$('#story-song-url').addEventListener('input', () => { $('#story-song-id').value = ''; $('#story-song-title').value = ''; });

async function openStudio() {
  displayAdmin();
  notice($('#admin-notice'), 'Loading members and memories…');
  try {
    await Promise.all([loadMembers(), loadMemories(), loadBackground(), loadStory()]);
    notice($('#admin-notice'));
  } catch (error) {
    if (error.status === 401) { loginCard.classList.remove('hidden'); adminApp.classList.add('hidden'); }
    notice($('#login-notice'), error.message);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Signing in…';
  notice($('#login-notice'));
  try {
    const fields = Object.fromEntries(new FormData(loginForm));
    await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
    loginForm.reset();
    await openStudio();
  } catch (error) { notice($('#login-notice'), error.message); }
  finally { button.disabled = false; button.innerHTML = 'Sign in <span>↗</span>'; }
});

$('#admin-logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  adminApp.classList.add('hidden');
  loginCard.classList.remove('hidden');
  notice($('#login-notice'), 'You are signed out.');
});

document.querySelectorAll('.admin-tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.admin-tabs button').forEach((tab) => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.admin-view').forEach((view) => view.classList.toggle('hidden', view.id !== button.dataset.view));
}));
$('#memory-search').addEventListener('input', renderMemories);
$('#story-select-all').addEventListener('click', () => {
  storyMemoryIds = null;
  renderMemories();
  notice($('#story-link-status'), 'All eligible photos, videos and notes are selected. Save the story to apply this selection.');
});

$('#clear-background').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/admin/background', { method: 'DELETE' });
    backgroundId = null;
    button.classList.add('hidden');
    renderMemories();
    notice($('#admin-notice'), 'The app background has been cleared.');
  } catch (error) { notice($('#admin-notice'), error.message); }
  finally { button.disabled = false; }
});

$('#admin-files').addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);
  $('#admin-file-name').textContent = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose photos or videos';
});

adminUploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = Array.from($('#admin-files').files || []);
  if (!files.length) return;
  const button = adminUploadForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const caption = String(new FormData(adminUploadForm).get('caption') || '');
  let uploaded = 0;
  try {
    for (const file of files) {
      $('#admin-upload-status').textContent = `Uploading ${uploaded + 1} of ${files.length}…`;
      const form = new FormData();
      form.append('file', file);
      form.append('caption', caption);
      await api('/api/admin/media', { method: 'POST', body: form });
      uploaded += 1;
    }
    adminUploadForm.reset();
    $('#admin-file-name').textContent = 'Choose photos or videos';
    $('#admin-upload-status').textContent = `${uploaded} memory${uploaded === 1 ? '' : 'ies'} added to the shared gallery.`;
    await loadMemories();
  } catch (error) {
    $('#admin-upload-status').textContent = uploaded ? `${uploaded} uploaded; the next file failed: ${error.message}` : error.message;
    await loadMemories().catch(() => {});
  } finally { button.disabled = false; }
});

$('#create-story-link').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  notice($('#story-link-status'), 'Saving story and preparing the share link…');
  try {
    await saveStory();
    const { url } = await api('/api/admin/story-link', { method: 'POST' });
    showStoryLink(url);
    try {
      await navigator.clipboard.writeText(url);
      notice($('#story-link-status'), 'Story saved. Link created and copied.');
    } catch {
      notice($('#story-link-status'), 'Story saved. Link is ready below; tap Copy link to share it.');
    }
  } catch (error) { notice($('#story-link-status'), error.message); }
  finally { button.disabled = false; }
});

$('#save-story').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  notice($('#story-link-status'), 'Saving story…');
  try {
    await saveStory();
    notice($('#story-link-status'), storySavedUrl ? 'Story updated. Your existing link now shows these changes.' : 'Story saved. Create a link when you are ready to share it.');
  } catch (error) { notice($('#story-link-status'), error.message); }
  finally { button.disabled = false; }
});

$('#copy-story-link').addEventListener('click', async () => {
  if (!storySavedUrl) return;
  try {
    await navigator.clipboard.writeText(storySavedUrl);
    notice($('#story-link-status'), 'Story link copied.');
  } catch {
    const field = $('#story-link-url');
    field.focus(); field.select();
    notice($('#story-link-status'), 'Select and copy the story link shown above.');
  }
});

$('#revoke-story-link').addEventListener('click', async (event) => {
  if (!window.confirm('Revoke this public story link? Anyone using it will lose access.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/admin/story-link', { method: 'DELETE' });
    showStoryLink(null);
    notice($('#story-link-status'), 'The story link has been revoked. Create a new link to share the story again.');
  } catch (error) { notice($('#story-link-status'), error.message); }
  finally { button.disabled = false; }
});

api('/api/admin/session').then(openStudio).catch(() => {});
