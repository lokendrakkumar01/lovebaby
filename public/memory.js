const token = location.pathname.match(/^\/memory\/([A-Za-z0-9_-]{30,})\/?$/)?.[1];
const card = document.getElementById('shared-memory');
const errorBox = document.getElementById('memory-error');

function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function shareCurrentMemory() {
  const url = location.href;
  if (navigator.share) navigator.share({ title: 'A memory for you', text: 'A little thing worth keeping', url }).catch((error) => { if (error.name !== 'AbortError') errorBox.textContent = 'The share menu could not be opened. Copy the page link from your browser.'; });
  else navigator.clipboard.writeText(url).then(() => { errorBox.textContent = 'Memory link copied.'; }).catch(() => { errorBox.textContent = 'Copy the memory link from your browser address bar.'; });
}

async function loadMemory() {
  if (!token) { errorBox.textContent = 'This memory link is incomplete.'; card.replaceChildren(); return; }
  try {
    const response = await fetch(`/api/memory/${encodeURIComponent(token)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'This memory is unavailable.');
    const item = data.item;
    card.replaceChildren();
    if (item.kind === 'image' || item.kind === 'video') {
      const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
      media.src = item.mediaUrl;
      media.alt = item.caption || 'A shared memory';
      if (item.kind === 'video') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
      else { media.decoding = 'async'; }
      media.addEventListener('error', () => { errorBox.textContent = 'This photo or video could not be loaded.'; }, { once: true });
      card.append(media);
    }
    const copy = document.createElement('div');
    copy.className = 'shared-memory-copy';
    copy.append(node('p', 'shared-memory-caption', item.kind === 'note' ? item.text : (item.caption || 'A little memory to keep.')));
    if (item.ownerName) copy.append(node('small', 'shared-memory-byline', `Shared by ${item.ownerName}`));
    if (item.createdAt) {
      const date = new Date(item.createdAt);
      if (!Number.isNaN(date.valueOf())) {
        const time = node('time', 'shared-memory-date', date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
        time.dateTime = item.createdAt;
        copy.append(time);
      }
    }
    const actions = document.createElement('div');
    actions.className = 'memory-actions';
    if (item.mediaUrl) {
      const download = node('a', 'memory-action', '↓ Download');
      download.href = `${item.mediaUrl}?download=1`;
      download.download = `memory-${item.id}`;
      actions.append(download);
    } else if (item.kind === 'note') {
      const download = node('a', 'memory-action', '↓ Download note');
      download.href = URL.createObjectURL(new Blob([item.text], { type: 'text/plain;charset=utf-8' }));
      download.download = `memory-${item.id}.txt`;
      actions.append(download);
    }
    const share = node('button', 'memory-action primary', '↗ Share memory');
    share.type = 'button';
    share.addEventListener('click', shareCurrentMemory);
    actions.append(share);
    copy.append(actions);
    card.append(copy);
  } catch (error) { card.replaceChildren(); errorBox.textContent = error.message; }
}

loadMemory();
