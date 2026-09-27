/* ---------------------------------------------------------------
   Crate — a personal, ad-free music player backed by your own
   Google Drive. Read the README before this will do anything:
   you need to drop in your own OAuth Client ID below.
   ------------------------------------------------------------- */

const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const AUDIO_QUERY =
  "trashed = false and (mimeType contains 'audio/' or " +
  "mimeType = 'application/x-flac' or mimeType = 'application/ogg')";

// ---- state ----
let accessToken = null;
let tokenClient = null;
let library = [];       // full track list from Drive
let queue = [];         // currently active (filtered/sorted) order
let queueIndex = -1;
let shuffle = false;
let repeatMode = 'off'; // off | all | one
let currentBlobUrl = null;

// ---- element refs ----
const $ = (id) => document.getElementById(id);
const gate = $('gate'), app = $('app');
const signinBtn = $('signin-btn'), signoutBtn = $('signout-btn'), gateStatus = $('gate-status');
const libraryEl = $('library'), searchInput = $('search-input'), sortSelect = $('sort-select');
const emptyState = $('empty-state'), loadingState = $('loading-state');
const miniPlayer = $('mini-player'), miniArt = $('mini-art'), miniTitle = $('mini-title'),
      miniArtist = $('mini-artist'), miniPlayPause = $('mini-playpause');
const nowPlaying = $('now-playing'), collapseBtn = $('collapse-btn'), npArt = $('np-art'),
      npTitle = $('np-title'), npArtist = $('np-artist'), npStatus = $('np-status');
const seek = $('seek'), timeCurrent = $('time-current'), timeTotal = $('time-total');
const shuffleBtn = $('shuffle-btn'), prevBtn = $('prev-btn'), playPauseBtn = $('playpause-btn'),
      nextBtn = $('next-btn'), repeatBtn = $('repeat-btn'), volume = $('volume');
const audioEl = $('audio-el');

// ---------------- Auth ----------------

function initAuth() {
  if (typeof google === 'undefined') {
    gateStatus.textContent = 'Could not reach Google — check your connection.';
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        gateStatus.textContent = 'Sign-in failed: ' + resp.error;
        return;
      }
      accessToken = resp.access_token;
      try { sessionStorage.setItem('crate_token', accessToken); } catch (e) {}
      enterApp();
    },
  });
}

signinBtn.addEventListener('click', () => {
  if (CLIENT_ID.startsWith('YOUR_GOOGLE_CLIENT_ID')) {
    gateStatus.textContent = 'Add your OAuth Client ID in app.js first — see README.';
    return;
  }
  gateStatus.textContent = 'Opening Google sign-in…';
  tokenClient.requestAccessToken({ prompt: '' });
});

signoutBtn.addEventListener('click', () => {
  if (accessToken) {
    try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
  }
  accessToken = null;
  try { sessionStorage.removeItem('crate_token'); } catch (e) {}
  audioEl.pause();
  app.classList.add('hidden');
  gate.classList.remove('hidden');
  miniPlayer.classList.add('hidden');
  nowPlaying.classList.add('hidden');
});

function enterApp() {
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  loadLibrary();
}

// Try to resume a session already in this tab
window.addEventListener('load', () => {
  initAuth();
  try {
    const saved = sessionStorage.getItem('crate_token');
    if (saved) { accessToken = saved; enterApp(); }
  } catch (e) {}
  registerServiceWorker();
});

// ---------------- Drive library ----------------

async function driveFetch(url) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (res.status === 401) {
    // token expired — send back to the gate to re-auth
    accessToken = null;
    try { sessionStorage.removeItem('crate_token'); } catch (e) {}
    gate.classList.remove('hidden');
    app.classList.add('hidden');
    gateStatus.textContent = 'Your session expired — sign in again.';
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error('Drive request failed: ' + res.status);
  return res;
}

async function loadLibrary() {
  library = [];
  let pageToken = '';
  try {
    do {
      const url = 'https://www.googleapis.com/drive/v3/files?' +
        new URLSearchParams({
          q: AUDIO_QUERY,
          fields: 'nextPageToken, files(id,name,mimeType,size,createdTime,thumbnailLink)',
          pageSize: '200',
          pageToken: pageToken || '',
        });
      const res = await driveFetch(url);
      const data = await res.json();
      library.push(...(data.files || []).map(parseTrack));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  } catch (e) {
    if (e.message !== 'unauthorized') {
      loadingState.textContent = 'Something went wrong reading your Drive. Pull to refresh and try again.';
      return;
    }
    return;
  }
  loadingState.classList.add('hidden');
  renderLibrary();
}

function parseTrack(file) {
  const stem = file.name.replace(/\.[^/.]+$/, '');
  let title = stem, artist = '';
  if (stem.includes(' - ')) {
    const parts = stem.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }
  return {
    id: file.id,
    title: title || file.name,
    artist,
    createdTime: file.createdTime,
    swatch: swatchFor(file.id),
  };
}

// Deterministic little color identity per track, so the library
// has personality without needing real album art.
function swatchFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hueA = h % 360;
  const hueB = (hueA + 42) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 55% 42%), hsl(${hueB} 60% 28%))`;
}

function currentSort() { return sortSelect.value; }

function visibleTracks() {
  const q = searchInput.value.trim().toLowerCase();
  let list = library.filter(t =>
    !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  if (currentSort() === 'recent') {
    list = list.slice().sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
  } else {
    list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
  }
  return list;
}

function renderLibrary() {
  const list = visibleTracks();
  emptyState.classList.toggle('hidden', list.length > 0);
  libraryEl.innerHTML = '';
  list.forEach((track) => {
    const row = document.createElement('button');
    row.className = 'track-row';
    row.setAttribute('role', 'listitem');
    if (queue[queueIndex] && queue[queueIndex].id === track.id) row.classList.add('playing');
    row.innerHTML = `
      <span class="track-swatch" style="background:${track.swatch}"></span>
      <span class="track-info">
        <span class="track-name">${escapeHtml(track.title)}</span>
        <span class="track-sub">${escapeHtml(track.artist || 'Unknown artist')}</span>
      </span>`;
    row.addEventListener('click', () => playFromLibrary(list, track));
    libraryEl.appendChild(row);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

searchInput.addEventListener('input', renderLibrary);
sortSelect.addEventListener('change', renderLibrary);

// ---------------- Playback ----------------

function playFromLibrary(list, track) {
  queue = list;
  queueIndex = list.findIndex(t => t.id === track.id);
  playCurrent();
}

async function playCurrent() {
  const track = queue[queueIndex];
  if (!track) return;
  updateNowPlayingMeta(track);
  npStatus.textContent = 'Loading…';
  audioEl.pause();
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }

  try {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${track.id}?alt=media`);
    const blob = await res.blob();
    currentBlobUrl = URL.createObjectURL(blob);
    audioEl.src = currentBlobUrl;
    await audioEl.play();
    npStatus.textContent = '';
  } catch (e) {
    if (e.message !== 'unauthorized') npStatus.textContent = 'Could not load this track.';
    return;
  }
  renderLibrary();
  setPlayingUI(true);
  miniPlayer.classList.remove('hidden');
}

function updateNowPlayingMeta(track) {
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist || 'Unknown artist';
  npArt.style.background = track.swatch;
  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist || 'Unknown artist';
  miniArt.style.background = track.swatch;
}

function setPlayingUI(isPlaying) {
  playPauseBtn.classList.toggle('is-playing', isPlaying);
  playPauseBtn.textContent = isPlaying ? '' : '▶';
  miniPlayPause.classList.toggle('is-playing', isPlaying);
  npArt.classList.toggle('is-playing', isPlaying);
}

function togglePlayPause() {
  if (!queue[queueIndex]) return;
  if (audioEl.paused) { audioEl.play(); setPlayingUI(true); }
  else { audioEl.pause(); setPlayingUI(false); }
}

function playAdjacent(delta) {
  if (!queue.length) return;
  if (shuffle) {
    queueIndex = Math.floor(Math.random() * queue.length);
  } else {
    queueIndex = (queueIndex + delta + queue.length) % queue.length;
  }
  playCurrent();
}

audioEl.addEventListener('ended', () => {
  if (repeatMode === 'one') { audioEl.currentTime = 0; audioEl.play(); return; }
  if (queueIndex === queue.length - 1 && repeatMode === 'off' && !shuffle) {
    setPlayingUI(false);
    return;
  }
  playAdjacent(1);
});

audioEl.addEventListener('timeupdate', () => {
  if (!isFinite(audioEl.duration)) return;
  seek.value = String(Math.floor((audioEl.currentTime / audioEl.duration) * 1000));
  timeCurrent.textContent = formatTime(audioEl.currentTime);
  timeTotal.textContent = formatTime(audioEl.duration);
});

seek.addEventListener('input', () => {
  if (!isFinite(audioEl.duration)) return;
  audioEl.currentTime = (Number(seek.value) / 1000) * audioEl.duration;
});

function formatTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

volume.addEventListener('input', () => { audioEl.volume = Number(volume.value); });

shuffleBtn.addEventListener('click', () => {
  shuffle = !shuffle;
  shuffleBtn.classList.toggle('active', shuffle);
});

repeatBtn.addEventListener('click', () => {
  repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
  repeatBtn.classList.toggle('active', repeatMode !== 'off');
  repeatBtn.textContent = repeatMode === 'one' ? '⟲¹' : '⟲';
});

playPauseBtn.addEventListener('click', togglePlayPause);
miniPlayPause.addEventListener('click', togglePlayPause);
prevBtn.addEventListener('click', () => playAdjacent(-1));
nextBtn.addEventListener('click', () => playAdjacent(1));

miniPlayer.addEventListener('click', () => nowPlaying.classList.remove('hidden'));
collapseBtn.addEventListener('click', () => nowPlaying.classList.add('hidden'));

// ---------------- PWA install plumbing ----------------

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
