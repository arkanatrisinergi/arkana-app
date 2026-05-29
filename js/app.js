// ═══════════════════════════════════════════════════
// Arkana App — App Core
// Shared: API layer, session, cache, activity log,
// and the USERS registry.
// Load order: 4th (after utils.js)
// ═══════════════════════════════════════════════════

// ─────────────────────────────────────────
// USERS REGISTRY
// Single source of truth for user definitions.
// avatar = initials string (fallback when no photo uploaded).
// color  = gradient string for avatar backgrounds.
// ─────────────────────────────────────────
const USERS = {
  arie: {
    id:     'arie',
    name:   'Arie',
    avatar: 'AR',
    color:  'linear-gradient(135deg,#1D4ED8,#3B82F6)'
  },
  ajin: {
    id:     'ajin',
    name:   'Ajin',
    avatar: 'AJ',
    color:  'linear-gradient(135deg,#065F46,#10B981)'
  }
};

// ─────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY.SESSION)) || {};
  } catch {
    return {};
  }
}

function setSession(userObj) {
  localStorage.setItem(STORAGE_KEY.SESSION, JSON.stringify(userObj));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY.SESSION);
}

// ─────────────────────────────────────────
// API
// Single implementation — used by all pages.
// Action passed as URL query param; payload as POST body.
// ─────────────────────────────────────────

async function api(action, payload = {}) {
  const url = ARKANA_SCRIPT_URL;
  if (!url) throw new Error('Apps Script URL not configured');
  const endpoint = url + '?action=' + encodeURIComponent(action);
  const res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ ...payload, user: getUser().id })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API error');
  return data;
}

// ─────────────────────────────────────────
// CACHE
// TTL-based. Each cache key stores { data, savedAt }.
// Default TTL: 5 minutes — balances freshness vs speed.
// stale-while-revalidate: UI shows cached data instantly,
// background fetch updates cache silently.
// ─────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function saveToCache(db, key) {
  const cacheKey = key
    ? STORAGE_KEY.CACHE + '_' + key
    : STORAGE_KEY.CACHE;
  localStorage.setItem(cacheKey, JSON.stringify({
    data:    db,
    savedAt: Date.now()
  }));
}

function loadFromCache(key) {
  const cacheKey = key
    ? STORAGE_KEY.CACHE + '_' + key
    : STORAGE_KEY.CACHE;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    const age = Date.now() - savedAt;
    // Return data regardless of age — caller decides what to do.
    // isFresh flag lets caller decide whether to refetch.
    return { data, isFresh: age < CACHE_TTL_MS, age };
  } catch {
    return null;
  }
}

function clearCache(key) {
  if (key) {
    localStorage.removeItem(STORAGE_KEY.CACHE + '_' + key);
  } else {
    localStorage.removeItem(STORAGE_KEY.CACHE);
  }
}

// Stale-while-revalidate loader.
// - Shows cached data instantly via onData(data, isStale).
// - If stale or no cache, fetches in background and calls onData again with fresh data.
// - onError called only if no cache AND fetch fails.
async function loadWithCache(action, payload = {}, cacheKey, onData, onError) {
  const cached = loadFromCache(cacheKey);

  if (cached) {
    onData(cached.data, !cached.isFresh);
    if (cached.isFresh) return; // Fresh — no need to refetch
  }

  // No cache or stale — fetch from API
  try {
    const result = await api(action, payload);
    saveToCache(result, cacheKey);
    onData(result, false);
  } catch (err) {
    if (!cached) onError(err); // Only surface error if nothing to show
  }
}

// ─────────────────────────────────────────
// ACTIVITY LOG
// Unified signature: (action, detail)
// Gets userId from session internally.
// ─────────────────────────────────────────

function logActivity(action, detail) {
  try {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY.LOG) || '[]');
    logs.unshift({
      userId: getUser().id,
      action,
      detail,
      time: new Date().toISOString()
    });
    if (logs.length > 200) logs.pop();
    localStorage.setItem(STORAGE_KEY.LOG, JSON.stringify(logs));
  } catch (e) {
    console.warn('[logActivity] localStorage error:', e);
  }
  // Best-effort sync to sheet — never blocks UI
  if (ARKANA_SCRIPT_URL) {
    api('addLog', { action, detail }).catch(() => {});
  }
}

function getActivityLog() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY.LOG) || '[]');
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────
// PULL TO REFRESH
// Simple overlay spinner — no DOM insertion tricks, no flex manipulation.
// A fixed spinner appears below the frost bar when user pulls down past
// the threshold. Disappears when refresh completes.
//
// scrollEl: DOM element OR function returning the current scroll element.
// onRefresh: async function — spinner stays visible until it resolves.
// ─────────────────────────────────────────

// Shared overlay — created once, reused across all PTR instances.
let _ptrOverlay = null;

function _getPtrOverlay() {
  if (_ptrOverlay) return _ptrOverlay;
  _ptrOverlay = document.createElement('div');
  _ptrOverlay.className = 'ptr-overlay';
  _ptrOverlay.innerHTML = '<div class="ptr-overlay-spinner"></div>';
  document.getElementById('app').appendChild(_ptrOverlay);
  return _ptrOverlay;
}

function initPullToRefresh(scrollEl, onRefresh) {
  const THRESHOLD = 80;

  let startY     = 0;
  let pulling    = false;
  let refreshing = false;

  function _resolveEl() {
    return typeof scrollEl === 'function' ? scrollEl() : scrollEl;
  }

  const overlay = _getPtrOverlay();

  function _show() { overlay.classList.add('active'); }
  function _hide() { overlay.classList.remove('active'); }

  // Guard — returns true if any overlay/sheet is currently open
  function _isOverlayOpen() {
    return !![
      ...document.querySelectorAll('.overlay.active'),
      ...document.querySelectorAll('.confirm-overlay.active')
    ].length;
  }

  document.addEventListener('touchstart', e => {
    if (refreshing || _isOverlayOpen()) return;

    const el    = _resolveEl();
    const rect  = el.getBoundingClientRect();
    const touch = e.touches[0];

    const outOfBounds =
      touch.clientX < rect.left   ||
      touch.clientX > rect.right  ||
      touch.clientY < rect.top    ||
      touch.clientY > rect.bottom;

    if (outOfBounds) { pulling = false; return; }
    if (el.scrollTop > 0) { pulling = false; return; }

    startY  = touch.clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!pulling || refreshing) return;
    const dist = e.touches[0].clientY - startY;
    if (dist <= 0) { pulling = false; return; }
    if (dist > THRESHOLD / 2) _show();
  }, { passive: true });

  document.addEventListener('touchend', async e => {
    if (!pulling || refreshing) return;
    const dist = e.changedTouches[0].clientY - startY;
    pulling = false;

    if (dist < THRESHOLD) { _hide(); return; }

    refreshing = true;
    _show();
    try {
      await onRefresh();
    } finally {
      refreshing = false;
      _hide();
    }
  }, { passive: true });
}

// ─────────────────────────────────────────
// SHEET DRAG TO CLOSE
// Attaches drag-down-to-dismiss behavior to a bottom sheet.
// Dragging the sheet down past 30% of its height closes it.
// Below threshold — snaps back with spring animation.
//
// overlayId: the .overlay element id
// sheetId:   the .sheet element id
// onClose:   optional callback after close (default: removes .active)
// ─────────────────────────────────────────
function initSheetDrag(overlayId, sheetId, onClose) {
  const overlayEl = document.getElementById(overlayId);
  // sheetId can be an element ID or a CSS selector (containing space or '.')
  // For "overlayId > .sheet" pattern, prefix the overlayId with # automatically
  let sheetEl;
  if (sheetId.includes('>')) {
    // Pattern: "overlayId > .sheet" — convert first part to #id selector
    const parts = sheetId.split('>').map(s => s.trim());
    sheetEl = document.querySelector('#' + parts[0] + ' > ' + parts[1]);
  } else if (sheetId.startsWith('.') || sheetId.startsWith('#')) {
    sheetEl = document.querySelector(sheetId);
  } else {
    sheetEl = document.getElementById(sheetId);
  }
  if (!overlayEl || !sheetEl) return;

  let startY    = 0;
  let currentY  = 0;
  let dragging  = false;

  const CLOSE_THRESHOLD = 0.3; // 30% of sheet height

  function _close() {
    // Animate sheet down before removing active
    sheetEl.style.transition = `transform var(--duration-sheet) var(--ease-sheet)`;
    sheetEl.style.transform  = 'translateX(-50%) translateY(100%)';
    setTimeout(() => {
      sheetEl.style.transition = '';
      sheetEl.style.transform  = '';
      overlayEl.classList.remove('active');
      if (onClose) onClose();
    }, 350);
  }

  function _snapBack() {
    sheetEl.style.transition = `transform var(--duration-sheet) var(--ease-sheet)`;
    sheetEl.style.transform  = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      sheetEl.style.transition = '';
      sheetEl.style.transform  = '';
    }, 400);
  }

  sheetEl.addEventListener('touchstart', e => {
    const touch     = e.touches[0];
    const sheetRect = sheetEl.getBoundingClientRect();
    // Allow drag from top 64px of sheet (handle + title zone)
    if (touch.clientY - sheetRect.top > 64) return;

    startY   = touch.clientY;
    currentY = 0;
    dragging = true;
    // Override CSS transition immediately so drag feels instant
    sheetEl.style.transition = 'none';
  }, { passive: true });

  sheetEl.addEventListener('touchmove', e => {
    if (!dragging) return;
    currentY = e.touches[0].clientY - startY;
    if (currentY < 0) { currentY = 0; return; }
    sheetEl.style.transform = `translateX(-50%) translateY(${currentY}px)`;
  }, { passive: true });

  sheetEl.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const sheetHeight = sheetEl.offsetHeight;
    const shouldClose = currentY > sheetHeight * CLOSE_THRESHOLD;
    if (shouldClose) _close(); else _snapBack();
  });
}
