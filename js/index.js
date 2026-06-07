// ═══════════════════════════════════════════════════
// Arkana App — Index JS
// IndexApp IIFE: login, home, PIN modal, activity log.
// Consumes: constants.js, utils.js, app.js (shared).
// Load order: 5th (after app.js)
// ═══════════════════════════════════════════════════

const IndexApp = (() => {

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let selectedUser     = 'arie';
  let pinBuffer        = '';
  let currentScreen    = 'login';
  let modalStep        = 1;      // 1=verify old, 2=enter new, 3=confirm new
  let newPinTemp       = '';
  let modalPinBuffer   = '';
  let avatarUploadTarget = null;

  // Per-user localStorage key helpers (not in constants — index-specific)
  const AVATAR_KEY = (user) => `arkana_avatar_${user}`;
  const PIN_KEY    = (user) => `arkana_pin_${user}`;

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  async function init() {
    _initPINs();
    _loadAvatars();
    _setVersionStrings();
    _setHomeDate();
    _bindEvents();

    // Check existing session first — skip PIN sync wait if already logged in
    const session = getUser();
    if (session.id && USERS[session.id]) {
      loginSuccess(session.id, false); // false = session restore, don't log
      // Sync PINs in background after restoring session
      _syncPINsFromSheet();
      return;
    }

    // No session — sync PINs before showing login so latest PIN is available
    await _syncPINsFromSheet();
    showScreen('login');
  }

  // ─────────────────────────────────────────
  // INTERNAL SETUP HELPERS
  // ─────────────────────────────────────────
  function _initPINs() {
    if (!localStorage.getItem(PIN_KEY('arie'))) localStorage.setItem(PIN_KEY('arie'), '1234');
    if (!localStorage.getItem(PIN_KEY('ajin'))) localStorage.setItem(PIN_KEY('ajin'), '1234');
  }

  function _loadAvatars() {
    ['arie', 'ajin'].forEach(user => {
      const saved = localStorage.getItem(AVATAR_KEY(user));
      const el = document.getElementById('login-avatar-' + user);
      if (saved && el) {
        el.innerHTML = `<img src="${saved}" alt="${user}">`;
      }
    });
  }

  async function _syncPINsFromSheet() {
    try {
      const data = await api('getAll');
      const settings = data.db?.settings || {};
      // Only overwrite localStorage when it still holds the factory default.
      // A non-default local PIN means it was changed this session —
      // Sheet sync is fire-and-forget and may lag, so local wins.
      const DEFAULT = '1234';
      if (settings.pinArie && settings.pinArie.length === 4) {
        const local = localStorage.getItem(PIN_KEY('arie'));
        if (!local || local === DEFAULT)
          localStorage.setItem(PIN_KEY('arie'), settings.pinArie);
      }
      if (settings.pinAjin && settings.pinAjin.length === 4) {
        const local = localStorage.getItem(PIN_KEY('ajin'));
        if (!local || local === DEFAULT)
          localStorage.setItem(PIN_KEY('ajin'), settings.pinAjin);
      }
    } catch (e) {
      console.warn('[IndexApp] PIN sync failed, using local:', e.message);
    }
  }

  function _setVersionStrings() {
    const v = typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v1.x';
    ['login-version', 'home-version', 'setting-version'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    });
  }

  function _setHomeDate() {
    const now = new Date();
    const days   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                    'Agustus','September','Oktober','November','Desember'];
    const el = document.getElementById('home-date');
    if (el) el.textContent =
      `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  // ─────────────────────────────────────────
  // SCREEN
  // ─────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active', 'slide-out');
    });
    const target = document.getElementById('screen-' + id);
    if (target) {
      target.classList.add('active');
      currentScreen = id;
    }
  }

  function navTo(id) {
    if (id === currentScreen) return;
    if (id === 'aktivitas') {
      showScreen(id);
      renderActivityLog(); // show local cache immediately
      _syncActivityLog();  // then fetch from sheet
    } else {
      showScreen(id);
    }
    // Update nav indicators across all nav bars
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === id);
    });
  }

  // ─────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────
  function selectUser(user) {
    selectedUser = user;
    pinBuffer = '';
    _updateLoginDots();
    _updateLoginEnterBtn();

    document.querySelectorAll('.user-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('card-' + user).classList.add('selected');

    // Toggle checkmark visibility via CSS class instead of textContent
    // (preserves inline SVG in .user-check)
    document.querySelectorAll('.user-check').forEach(c => c.classList.remove('checked'));
    document.querySelector('#card-' + user + ' .user-check').classList.add('checked');

    document.getElementById('pin-label').textContent =
      `Masukkan PIN — ${USERS[user].name}`;
    document.getElementById('pin-section').classList.remove('error');
  }

  function pinPress(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    _updateLoginDots();
    _updateLoginEnterBtn();
    if (pinBuffer.length === 4) pinEnter();
  }

  function pinDel() {
    pinBuffer = pinBuffer.slice(0, -1);
    _updateLoginDots();
    _updateLoginEnterBtn();
  }

  async function pinEnter() {
    if (pinBuffer.length < 4) return;
    document.getElementById('pin-enter').classList.add('disabled');

    // localStorage is always the final gate.
    // This prevents a loose server-side validatePin (not filtering by user)
    // from accepting another user's PIN for the selected user.
    const stored = localStorage.getItem(PIN_KEY(selectedUser));
    const localValid = (pinBuffer === stored);

    try {
      const data = await api('validatePin', { user: selectedUser, pin: pinBuffer });
      if (data.valid && localValid) {
        // Both agree — clean login
        loginSuccess(selectedUser, true);
      } else if (!data.valid && localValid) {
        // Sheet lagging after a PIN change — trust localStorage
        loginSuccess(selectedUser, true);
      } else {
        // API valid but local disagrees (wrong user's PIN matched server),
        // or both invalid — reject
        pinError();
      }
    } catch (e) {
      // Network error — localStorage only
      if (localValid) {
        loginSuccess(selectedUser, true);
      } else {
        pinError();
      }
    } finally {
      document.getElementById('pin-enter').classList.remove('disabled');
    }
  }

  function pinError() {
    const section = document.getElementById('pin-section');
    section.classList.add('error');
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('dot-' + i);
      if (dot) dot.classList.add('error-dot');
    }
    setTimeout(() => {
      section.classList.remove('error');
      for (let i = 0; i < 4; i++) {
        const dot = document.getElementById('dot-' + i);
        if (dot) dot.classList.remove('error-dot');
      }
      pinBuffer = '';
      _updateLoginDots();
      _updateLoginEnterBtn();
    }, 900);
  }

  function loginSuccess(userId, fromPin = false) {
    const user = USERS[userId];
    setSession({ id: userId, name: user.name });

    document.getElementById('home-name').textContent = user.name;
    const photoUrl = localStorage.getItem(AVATAR_KEY(userId));
    updateStripAvatar(userId, photoUrl);
    document.getElementById('strip-name').textContent = user.name;

    if (fromPin) {
      logActivity('Login', `${user.name} masuk ke Arkana App`);
    }

    // Show persistent bottom nav
    document.getElementById('bottom-nav').classList.add('nav-visible');

    // Show chat FAB
    document.getElementById('chat-fab').classList.add('fab-visible');

    // Init ChatApp for this user
    ChatApp.init(user.name);

    showScreen('home');
    // Reset nav indicators to home
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === 'home');
    });

    pinBuffer = '';
    _updateLoginDots();
    _updateLoginEnterBtn();
  }

  function logout() {
    const session = getUser();
    if (session.id && USERS[session.id]) {
      logActivity('Logout', `${USERS[session.id].name} keluar dari Arkana App`);
    }
    clearSession();
    selectedUser = 'arie';
    selectUser('arie');
    // Hide bottom nav and chat FAB on logout
    document.getElementById('bottom-nav').classList.remove('nav-visible');
    document.getElementById('chat-fab').classList.remove('fab-visible');
    showScreen('login');
  }

  // ─────────────────────────────────────────
  // AVATAR
  // ─────────────────────────────────────────
  function triggerAvatarUpload(e, user) {
    e.stopPropagation(); // don't bubble to selectUser
    avatarUploadTarget = user;
    const input = document.getElementById('avatar-file-input');
    input.value = '';
    input.click();
  }

  function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file || !avatarUploadTarget) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      localStorage.setItem(AVATAR_KEY(avatarUploadTarget), dataUrl);
      // Update login card
      const el = document.getElementById('login-avatar-' + avatarUploadTarget);
      if (el) el.innerHTML = `<img src="${dataUrl}" alt="${avatarUploadTarget}">`;
      // Update strip if this is the active user
      const session = getUser();
      if (session.id === avatarUploadTarget) {
        updateStripAvatar(avatarUploadTarget, dataUrl);
      }
      showToast('Foto profil diperbarui ✓', 'success');
    };
    reader.readAsDataURL(file);
  }

  function updateStripAvatar(userId, photoUrl) {
    const sa = document.getElementById('strip-avatar');
    if (!sa) return;
    if (photoUrl) {
      sa.innerHTML = `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
      sa.style.background = 'none';
    } else {
      const user = USERS[userId];
      sa.textContent = user.avatar;
      sa.style.background = user.color;
    }
  }

  function openChangeAvatar() {
    const session = getUser();
    if (!session.id) return;
    avatarUploadTarget = session.id;
    const input = document.getElementById('avatar-file-input');
    input.value = '';
    input.click();
  }

  // ─────────────────────────────────────────
  // PIN MODAL
  // ─────────────────────────────────────────
  function openChangePIN() {
    modalPinBuffer = '';
    modalStep = 1;
    newPinTemp = '';
    document.getElementById('modal-title').textContent = 'Ganti PIN';
    document.getElementById('modal-sub').textContent = 'Masukkan PIN lama kamu';
    _updateModalDots();
    _updateModalEnterBtn();
    document.getElementById('modal-pin').classList.add('active');
  }

  function closeChangePIN() {
    document.getElementById('modal-pin').classList.remove('active');
    modalPinBuffer = '';
  }

  function modalPin(digit) {
    if (modalPinBuffer.length >= 4) return;
    modalPinBuffer += digit;
    _updateModalDots();
    _updateModalEnterBtn();
    if (modalPinBuffer.length === 4) modalEnter();
  }

  function modalDel() {
    modalPinBuffer = modalPinBuffer.slice(0, -1);
    _updateModalDots();
    _updateModalEnterBtn();
  }

  async function modalEnter() {
    if (modalPinBuffer.length < 4) return;
    const session = getUser();
    const userId = session.id;

    if (modalStep === 1) {
      // Verify old PIN — API first, localStorage fallback (same pattern as pinEnter)
      let valid = false;
      try {
        const data = await api('validatePin', { user: userId, pin: modalPinBuffer });
        if (data.valid) {
          valid = true;
        } else {
          // Sheet may lag after a PIN change — cross-check local
          valid = (modalPinBuffer === localStorage.getItem(PIN_KEY(userId)));
        }
      } catch (e) {
        valid = (modalPinBuffer === localStorage.getItem(PIN_KEY(userId)));
      }
      if (!valid) {
        showToast('PIN lama salah', 'error');
        _clearModalBuffer();
        return;
      }
      modalStep = 2;
      newPinTemp = '';
      modalPinBuffer = '';
      document.getElementById('modal-sub').textContent = 'Masukkan PIN baru (4 digit)';
      _updateModalDots();
      _updateModalEnterBtn();

    } else if (modalStep === 2) {
      newPinTemp = modalPinBuffer;
      modalStep = 3;
      modalPinBuffer = '';
      document.getElementById('modal-sub').textContent = 'Konfirmasi PIN baru';
      _updateModalDots();
      _updateModalEnterBtn();

    } else if (modalStep === 3) {
      if (modalPinBuffer !== newPinTemp) {
        showToast('PIN tidak cocok, ulangi', 'error');
        modalStep = 2;
        newPinTemp = '';
        modalPinBuffer = '';
        document.getElementById('modal-sub').textContent = 'Masukkan PIN baru (4 digit)';
        _updateModalDots();
        _updateModalEnterBtn();
        return;
      }
      // Save locally immediately
      localStorage.setItem(PIN_KEY(userId), newPinTemp);
      // Sync to Sheet (fire & forget)
      const pinField = userId === 'arie' ? 'pinArie' : 'pinAjin';
      api('updateSettings', { [pinField]: newPinTemp })
        .then(() => showToast('PIN berhasil diubah & disync ✓', 'success'))
        .catch(() => showToast('PIN diubah (offline, belum sync)', ''));
      logActivity('Ganti PIN', `${USERS[userId].name} mengubah PIN login`);
      closeChangePIN();
    }
  }

  // ─────────────────────────────────────────
  // ACTIVITY LOG
  // ─────────────────────────────────────────
  function renderActivityLog() {
    const logs = getActivityLog();
    const container = document.getElementById('aktivitas-content');
    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="opacity:.3;margin-bottom:8px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><polyline points="12 6 12 12 16 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="empty-text">Belum ada aktivitas.<br>Log akan muncul saat data mulai diubah.</div>
        </div>`;
      return;
    }

    const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

    // User dot colors — derived from USERS registry gradient start color
    const USER_DOT = {
      arie: { dot: '#3B82F6', badge: 'rgba(59,130,246,.15)', text: '#3B82F6' },
      ajin: { dot: '#10B981', badge: 'rgba(16,185,129,.15)',  text: '#10B981' }
    };

    const items = logs.map(log => {
      const user    = USERS[log.userId] || { name: log.userId };
      const palette = USER_DOT[log.userId] || { dot: '#3F3F46', badge: 'rgba(63,63,70,.2)', text: '#787880' };
      const t       = new Date(log.time);
      const timeStr = `${days[t.getDay()]} ${t.getDate()}/${t.getMonth()+1} · `
                    + `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
      return `
        <div class="log-item">
          <div class="log-dot" style="background:${palette.dot};min-width:8px;"></div>
          <div class="log-body">
            <div class="log-action">${log.action}</div>
            <div class="log-detail">${log.detail}</div>
            <div class="log-meta">
              <span class="log-user-badge" style="background:${palette.badge};color:${palette.text};">${user.name || log.userId}</span>
              <span class="log-time">${timeStr}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="log-list">${items}</div>`;
  }

  async function _syncActivityLog() {
    try {
      const data = await api('getLogs');
      if (data.logs) {
        const nameToId = {};
        Object.entries(USERS).forEach(([id, u]) => { nameToId[u.name] = id; });
        const sheetLogs = data.logs.map(l => ({
          userId: nameToId[l.user] || l.user,
          action: l.action,
          detail: l.detail,
          time:   l.timestamp
        }));
        localStorage.setItem(STORAGE_KEY.LOG, JSON.stringify(sheetLogs));
        renderActivityLog();
      }
    } catch (e) {
      // Offline — local cache already displayed
    }
  }

  // ─────────────────────────────────────────
  // INTERNAL DOT / BUTTON HELPERS
  // ─────────────────────────────────────────
  function _updateLoginDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('dot-' + i);
      if (!dot) continue;
      dot.classList.toggle('filled', i < pinBuffer.length);
      dot.classList.remove('error-dot');
    }
  }

  function _updateLoginEnterBtn() {
    const btn = document.getElementById('pin-enter');
    if (btn) btn.classList.toggle('disabled', pinBuffer.length < 4);
  }

  function _updateModalDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('mdot-' + i);
      if (dot) dot.classList.toggle('filled', i < modalPinBuffer.length);
    }
  }

  function _updateModalEnterBtn() {
    const btn = document.getElementById('modal-enter');
    if (btn) btn.classList.toggle('disabled', modalPinBuffer.length < 4);
  }

  function _clearModalBuffer() {
    modalPinBuffer = '';
    _updateModalDots();
    _updateModalEnterBtn();
  }

  // ─────────────────────────────────────────
  // EVENTS
  // All addEventListener bindings — zero inline onclick in HTML.
  // ─────────────────────────────────────────
  function _bindEvents() {
    // User selection cards
    document.getElementById('card-arie').addEventListener('click', () => selectUser('arie'));
    document.getElementById('card-ajin').addEventListener('click', () => selectUser('ajin'));

    // Avatar upload triggers on login cards
    document.getElementById('login-avatar-arie').addEventListener('click', (e) => triggerAvatarUpload(e, 'arie'));
    document.getElementById('login-avatar-ajin').addEventListener('click', (e) => triggerAvatarUpload(e, 'ajin'));
    document.getElementById('avatar-file-input').addEventListener('change', handleAvatarUpload);

    // PIN numpad (login)
    document.querySelectorAll('.pin-numpad .pin-key').forEach(key => {
      const text = key.textContent.trim();
      if (key.classList.contains('del')) {
        key.addEventListener('click', pinDel);
      } else if (key.classList.contains('enter')) {
        key.addEventListener('click', pinEnter);
      } else {
        key.addEventListener('click', () => pinPress(text));
      }
    });

    // Logout button
    document.querySelector('.logout-btn').addEventListener('click', logout);

    // Feature card navigation — generic, driven by data-nav-page attribute
    document.querySelectorAll('.feat-card[data-nav-page]').forEach(card => {
      card.addEventListener('click', () => {
        window.location.href = card.dataset.navPage;
      });
    });

    // Bottom nav (all nav bars — home, aktivitas, setting screens each have one)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navTo(item.dataset.nav));
    });

    // Setting items
    document.querySelector('[data-action="change-avatar"]')
      ?.addEventListener('click', openChangeAvatar);
    document.querySelector('[data-action="change-pin"]')
      ?.addEventListener('click', openChangePIN);

    // PIN modal numpad
    document.querySelectorAll('.modal-numpad .pin-key').forEach(key => {
      const text = key.textContent.trim();
      if (key.classList.contains('del')) {
        key.addEventListener('click', modalDel);
      } else if (key.classList.contains('enter')) {
        key.addEventListener('click', modalEnter);
      } else {
        key.addEventListener('click', () => modalPin(text));
      }
    });

    // Modal cancel button & backdrop click
    document.querySelector('.modal-btn.cancel')
      ?.addEventListener('click', closeChangePIN);
    document.getElementById('modal-pin').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-pin')) closeChangePIN();
    });

    // PIN sheet drag-to-close
    initSheetDrag('modal-pin', 'sheet-modal-pin', closeChangePIN);

    // Chat FAB
    document.getElementById('chat-fab').addEventListener('click', () => {
      ChatApp.open();
    });
  }

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────
  return { init };

})();

// Kick off
window.addEventListener('DOMContentLoaded', () => IndexApp.init());

// ═══════════════════════════════════════════════════
// ChatApp — Arkana AI Chat Module
// PRD-05-A: AI-powered supplier input via chat.
// Self-contained IIFE, exposed as window.ChatApp.
// Depends on: app.js (api, getUser), components.js (UI.chat.*),
//             constants.js (STORAGE_KEY), utils.js (showToast, showConfirm)
// ═══════════════════════════════════════════════════

const ChatApp = (() => {

  // ─────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────
  const MAX_HISTORY    = 50;   // max messages stored in localStorage
  const TYPING_DELAY   = 600;  // ms before showing typing indicator

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let _messages        = [];   // { role, text, time, isError, confirmData, confirmId, submitted }
  let _userName        = 'Pengguna';
  let _isLoading       = false;
  let _pendingConfirm  = null; // { msgId, data } — supplier data awaiting confirmation
  let _initialized     = false;

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  function init(userName) {
    _userName = userName || 'Pengguna';
    _loadHistory();
    _initialized = true;
  }

  function open() {
    // Switch to chat screen
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const chatScreen = document.getElementById('screen-chat');
    if (chatScreen) chatScreen.classList.add('active');

    // Hide chat FAB while chat is open
    document.getElementById('chat-fab').classList.remove('fab-visible');

    // Bind events (idempotent — checks flag)
    _bindEvents();

    // Render current state
    _render();

    // Auto-focus input
    setTimeout(() => {
      const ta = document.getElementById('chat-textarea');
      if (ta) ta.focus();
    }, 350);
  }

  function close() {
    // Return to home screen
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const homeScreen = document.getElementById('screen-home');
    if (homeScreen) homeScreen.classList.add('active');

    // Re-show chat FAB
    document.getElementById('chat-fab').classList.add('fab-visible');

    // Update nav indicators to home
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === 'home');
    });
  }

  // ─────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────
  function _loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY.CHAT_HISTORY);
      _messages = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _messages = [];
    }
  }

  function _saveHistory() {
    try {
      // Trim to MAX_HISTORY
      if (_messages.length > MAX_HISTORY) {
        _messages = _messages.slice(_messages.length - MAX_HISTORY);
      }
      localStorage.setItem(STORAGE_KEY.CHAT_HISTORY, JSON.stringify(_messages));
    } catch (e) {
      console.warn('[ChatApp] Failed to save chat history:', e);
    }
  }

  function clearHistory() {
    showConfirm(
      'Hapus Riwayat Chat',
      'Semua pesan akan dihapus. Lanjutkan?',
      () => {
        _messages = [];
        _pendingConfirm = null;
        localStorage.removeItem(STORAGE_KEY.CHAT_HISTORY);
        _render();
      }
    );
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  function _render() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (_messages.length === 0) {
      container.innerHTML = UI.chat.templateChips(_userName);
      _bindTemplateChips();
      return;
    }

    const html = _messages.map(msg => {
      if (msg.confirmData && !msg.submitted) {
        // Render confirm card inside AI bubble
        const cardHtml = UI.chat.confirmCard(msg.confirmData, msg.confirmId);
        return UI.chat.bubble({ role: 'ai', html: cardHtml, time: msg.time });
      }
      return UI.chat.bubble({
        role:    msg.role,
        text:    msg.text,
        time:    msg.time,
        isError: msg.isError || false
      });
    }).join('');

    container.innerHTML = html;

    // Re-bind confirm buttons after render
    _bindConfirmButtons();

    // Scroll to bottom
    _scrollToBottom();
  }

  function _showTyping() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.id = 'chat-typing';
    typing.innerHTML = `
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>`;
    container.appendChild(typing);
    _scrollToBottom();
  }

  function _hideTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  function _scrollToBottom() {
    const scroll = document.getElementById('scroll-chat');
    if (scroll) {
      setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 50);
    }
  }

  // ─────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────
  function sendMessage(text) {
    text = text.trim();
    if (!text || _isLoading) return;

    // Push user message
    _pushMessage({ role: 'user', text });

    // Clear textarea
    const ta = document.getElementById('chat-textarea');
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    _updateSendBtn();

    // Render immediately so user sees their message
    _render();

    // Start AI response
    _isLoading = true;
    setTimeout(_showTyping, TYPING_DELAY);

    _callAI(text)
      .then(response => {
        _hideTyping();
        _handleAIResponse(response);
      })
      .catch(err => {
        _hideTyping();
        console.error('[ChatApp] AI error:', err);
        _pushMessage({
          role: 'ai',
          text: 'Maaf, Arkana tidak bisa terhubung saat ini. Coba lagi ya.',
          isError: true
        });
        _render();
      })
      .finally(() => {
        _isLoading = false;
      });
  }

  function _pushMessage(msg) {
    _messages.push({
      role:        msg.role,
      text:        msg.text || '',
      time:        new Date().toISOString(),
      isError:     msg.isError || false,
      confirmData: msg.confirmData || null,
      confirmId:   msg.confirmId  || null,
      submitted:   false
    });
    _saveHistory();
  }

  // ─────────────────────────────────────────
  // AI CALL
  // ─────────────────────────────────────────
  async function _callAI(userText) {
    // Build conversation history for context (last 20 messages)
    const historySlice = _messages.slice(-20);
    const conversationHistory = historySlice.map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text || (m.confirmData ? '[Kartu konfirmasi ditampilkan]' : '')
    }));

    // Load supplier cache for lookup intent
    let supplierContext = '';
    try {
      const cached = loadFromCache('supplier');
      if (cached && cached.data && cached.data.suppliers) {
        const names = cached.data.suppliers
          .slice(0, 30)
          .map(s => `${s.name} (${s.level}, ${s.kota || '-'})`)
          .join('; ');
        supplierContext = `\n\nData supplier yang ada: ${names}`;
      }
    } catch (e) { /* no cache */ }

    const systemPrompt = `Kamu adalah Arkana AI, asisten operasional untuk CV Arkana Trisinergi.
Kamu hanya bisa membantu dua hal:
1. Tambah supplier baru
2. Cari/lookup supplier yang sudah ada

Bahasa: selalu Bahasa Indonesia, santai tapi profesional.

Untuk TAMBAH SUPPLIER, kumpulkan field berikut satu per satu jika belum ada:
- name (nama supplier/perusahaan) — WAJIB
- kontak (nomor telepon/WA) — WAJIB
- kota — WAJIB
- level: harus salah satu dari L1, L2, L3, L4, atau Jasa — WAJIB
  - L1 = Pabrik, L2 = Distributor Resmi, L3 = Grosir, L4 = Retail, Jasa = Penyedia Jasa
- units (unit bisnis, boleh lebih dari satu) — WAJIB
  Pilihan: IT & Elektronik, Medis & Kesehatan, Logistik, Energi, Konstruksi, Umum
- catatan — OPSIONAL

Tanya 1-2 field yang belum ada per giliran. Jangan tanya semua sekaligus.

Jika SEMUA field wajib sudah terkumpul, JANGAN tulis narasi lagi.
Langsung balas HANYA dengan JSON berikut (tidak ada teks lain):
{
  "intent": "ADD_SUPPLIER",
  "ready": true,
  "data": {
    "name": "...",
    "kontak": "...",
    "kota": "...",
    "level": "...",
    "units": ["..."],
    "catatan": "..."
  }
}

Untuk CARI SUPPLIER, beri ringkasan singkat dari data yang ada.${supplierContext}

Jika permintaan di luar dua topik ini, balas:
"Arkana belum bisa bantu itu. Coba ketik 'Tambah Supplier Baru' atau 'Cari Supplier'."

PENTING: Jika membalas JSON, HANYA tulis JSON. Tidak ada teks sebelum atau sesudah JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     systemPrompt,
        messages:   conversationHistory
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');

    const textBlock = (data.content || []).find(b => b.type === 'text');
    return textBlock ? textBlock.text.trim() : '';
  }

  // ─────────────────────────────────────────
  // HANDLE AI RESPONSE
  // ─────────────────────────────────────────
  function _handleAIResponse(text) {
    // Try to parse as JSON (ADD_SUPPLIER ready signal)
    let parsed = null;
    try {
      // Extract JSON even if there's stray whitespace/newlines
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) { /* not JSON — treat as plain text */ }

    if (parsed && parsed.intent === 'ADD_SUPPLIER' && parsed.ready && parsed.data) {
      // All fields collected — show confirmation card
      const msgId = 'confirm_' + Date.now();
      _pendingConfirm = { msgId, data: parsed.data };

      _messages.push({
        role:        'ai',
        text:        '',
        time:        new Date().toISOString(),
        isError:     false,
        confirmData: parsed.data,
        confirmId:   msgId,
        submitted:   false
      });
      _saveHistory();
      _render();
    } else {
      // Plain text response — just show as AI bubble
      _pushMessage({ role: 'ai', text });
      _render();
    }
  }

  // ─────────────────────────────────────────
  // CONFIRM CARD ACTIONS
  // ─────────────────────────────────────────
  async function _confirmSave(msgId) {
    if (!_pendingConfirm || _pendingConfirm.msgId !== msgId) return;

    const data = _pendingConfirm.data;

    // Disable buttons immediately
    const btns = document.querySelectorAll(`[data-confirm-id="${msgId}"]`);
    btns.forEach(b => { b.disabled = true; });

    try {
      const user = getUser();
      await api('addSupplier', {
        id:         genId(),
        name:       data.name,
        kontak:     data.kontak,
        kota:       data.kota,
        level:      data.level,
        units:      Array.isArray(data.units) ? data.units : [data.units],
        authorized: false,
        catatan:    data.catatan || '',
        createdBy:  user.name || user.id,
        createdAt:  new Date().toISOString()
      });

      // Mark confirm card as submitted
      const idx = _messages.findIndex(m => m.confirmId === msgId);
      if (idx > -1) _messages[idx].submitted = true;

      _pendingConfirm = null;

      // Clear supplier cache so next load picks up new entry
      clearCache('supplier');

      logActivity('Tambah Supplier', `${data.name} ditambahkan via Arkana AI`);

      _pushMessage({ role: 'ai', text: `✓ Supplier "${data.name}" berhasil ditambahkan ke database!` });
      _saveHistory();
      _render();

    } catch (err) {
      console.error('[ChatApp] addSupplier failed:', err);
      _pushMessage({
        role: 'ai',
        text: 'Gagal menyimpan supplier. Cek koneksi dan coba lagi.',
        isError: true
      });
      _render();
      // Re-enable buttons
      btns.forEach(b => { b.disabled = false; });
    }
  }

  function _confirmCancel(msgId) {
    // Mark card as submitted (hides action buttons on re-render)
    const idx = _messages.findIndex(m => m.confirmId === msgId);
    if (idx > -1) _messages[idx].submitted = true;
    _pendingConfirm = null;
    _pushMessage({ role: 'ai', text: 'Oke, dibatalkan. Ada yang ingin diubah atau ditambahkan?' });
    _saveHistory();
    _render();
  }

  // ─────────────────────────────────────────
  // EVENT BINDING
  // ─────────────────────────────────────────
  let _eventsBound = false;

  function _bindEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    // Back button
    document.getElementById('chat-back-btn')?.addEventListener('click', close);

    // Clear button
    document.getElementById('chat-clear-btn')?.addEventListener('click', clearHistory);

    // Textarea — auto-grow + send btn state
    const ta = document.getElementById('chat-textarea');
    if (ta) {
      ta.addEventListener('input', () => {
        // Auto-grow
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
        _updateSendBtn();
      });
      // Send on Enter (not Shift+Enter)
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(ta.value);
        }
      });
    }

    // Send button
    document.getElementById('chat-send-btn')?.addEventListener('click', () => {
      const ta = document.getElementById('chat-textarea');
      if (ta) sendMessage(ta.value);
    });

    // Confirm card buttons — delegated to messages container
    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-confirm-id]');
      if (!btn) return;
      const msgId = btn.dataset.confirmId;
      const action = btn.dataset.action;
      if (action === 'save')   _confirmSave(msgId);
      if (action === 'cancel') _confirmCancel(msgId);
    });
  }

  function _bindTemplateChips() {
    document.querySelectorAll('.chat-template-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        sendMessage(chip.dataset.template);
      });
    });
  }

  function _bindConfirmButtons() {
    // Confirm buttons are inside the messages container which uses delegation
    // via the chat-messages click handler bound in _bindEvents().
    // No extra binding needed here — delegation handles dynamically rendered cards.
  }

  function _updateSendBtn() {
    const ta  = document.getElementById('chat-textarea');
    const btn = document.getElementById('chat-send-btn');
    if (btn) btn.disabled = !ta || ta.value.trim() === '' || _isLoading;
  }

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────
  return { init, open, close, clearHistory };

})();

