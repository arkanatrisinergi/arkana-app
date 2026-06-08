// ═══════════════════════════════════════════════════
// Arkana App — Chat JS  v2.1.0
// PRD-05-A: Arkana AI — standalone page module.
// Runs on chat.html. Redirects to index.html if no session.
// Depends on: config.js, constants.js, utils.js, app.js, components.js
//
// AI: Gemini via Apps Script proxy (geminiChat action)
// Key lives in Apps Script Script Properties — never in any file.
// ═══════════════════════════════════════════════════

const ChatApp = (() => {

  // ─────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────
  const MAX_HISTORY    = 50;  // max messages stored in localStorage
  const MAX_CONTEXT    = 6;   // max messages sent to AI per call (saves RPD)
  const TYPING_DELAY   = 500;

  // Hardcoded AI reply for "Tambah Supplier Baru" template — costs 0 RPD
  const TAMBAH_SUPPLIER_PROMPT = () => {
    const units = (typeof UNITS_BISNIS !== 'undefined' ? UNITS_BISNIS : [
      'IT & Elektronik', 'Medis & Kesehatan', 'Logistik',
      'Energi', 'Konstruksi', 'Umum'
    ]).join(', ');
    return `Silakan tuliskan info suppliernya dalam satu pesan. Contoh:\n"PT Maju Jaya, 0812-3456-789, Surabaya, L2, IT & Elektronik"\n\nLevel supplier:\nL1 Pabrik · L2 Distributor Resmi · L3 Grosir · L4 Retail · Jasa\n\nKategori tersedia:\n${units}`;
  };

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let _messages       = [];
  let _userName       = 'Pengguna';
  let _isLoading      = false;
  let _pendingConfirm = null; // { msgId, data }

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  function init() {
    const session = getUser();
    if (!session || !session.id) {
      window.location.href = 'index.html';
      return;
    }
    _userName = session.name || 'Pengguna';

    _loadHistory();
    _render();
    _bindEvents();

    setTimeout(() => {
      const ta = document.getElementById('chat-textarea');
      if (ta) ta.focus();
    }, 300);
  }

  // ─────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────
  function _loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY.CHAT_HISTORY);
      _messages = raw ? JSON.parse(raw) : [];
      const last = _messages[_messages.length - 1];
      if (last && last.confirmData && !last.submitted) {
        _pendingConfirm = { msgId: last.confirmId, data: last.confirmData };
      }
    } catch (e) {
      _messages = [];
    }
  }

  function _saveHistory() {
    try {
      if (_messages.length > MAX_HISTORY) {
        _messages = _messages.slice(_messages.length - MAX_HISTORY);
      }
      localStorage.setItem(STORAGE_KEY.CHAT_HISTORY, JSON.stringify(_messages));
    } catch (e) {
      console.warn('[ChatApp] Failed to save history:', e);
    }
  }

  // ─────────────────────────────────────────
  // CLEAR HISTORY
  // ─────────────────────────────────────────
  function _clearHistory() {
    const overlay = document.getElementById('chat-clear-overlay');
    if (overlay) overlay.classList.add('active');
  }

  function _clearHistoryConfirmed() {
    _messages = [];
    _pendingConfirm = null;
    localStorage.removeItem(STORAGE_KEY.CHAT_HISTORY);
    _closeClearOverlay();
    _render();
    showToast('Riwayat chat dihapus', 'success');
  }

  function _closeClearOverlay() {
    const overlay = document.getElementById('chat-clear-overlay');
    if (overlay) overlay.classList.remove('active');
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
    _scrollToBottom();
  }

  function _showTyping() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const existing = document.getElementById('chat-typing');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'chat-typing';
    el.id = 'chat-typing';
    el.innerHTML = `
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>`;
    container.appendChild(el);
    _scrollToBottom();
  }

  function _hideTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  function _scrollToBottom() {
    const scroll = document.getElementById('scroll-chat');
    if (scroll) requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  }

  // ─────────────────────────────────────────
  // SEND
  // ─────────────────────────────────────────
  function sendMessage(text) {
    text = text.trim();
    if (!text || _isLoading) return;

    // ── Hardcoded reply for "Tambah Supplier Baru" template ──
    // Costs 0 RPD — no AI call needed.
    if (text === 'Tambah Supplier Baru') {
      _pushMessage({ role: 'user', text });
      _pushMessage({ role: 'ai', text: TAMBAH_SUPPLIER_PROMPT() });
      const ta = document.getElementById('chat-textarea');
      if (ta) { ta.value = ''; ta.style.height = 'auto'; }
      _updateSendBtn();
      _render();
      return;
    }

    _pushMessage({ role: 'user', text });

    const ta = document.getElementById('chat-textarea');
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    _updateSendBtn();
    _render();

    _isLoading = true;
    _updateSendBtn();

    const typingTimer = setTimeout(_showTyping, TYPING_DELAY);

    _callAI(text)
      .then(response => {
        clearTimeout(typingTimer);
        _hideTyping();
        _handleAIResponse(response);
      })
      .catch(err => {
        clearTimeout(typingTimer);
        _hideTyping();
        console.error('[ChatApp] AI error:', err);

        // Detect quota exceeded — give specific friendly message
        const isQuota = err.message && (
          err.message.includes('429') ||
          err.message.toLowerCase().includes('quota') ||
          err.message.toLowerCase().includes('rate limit') ||
          err.message.toLowerCase().includes('resource has been exhausted')
        );

        _pushMessage({
          role: 'ai',
          text: isQuota
            ? 'Kuota harian Arkana AI sudah habis. Silakan coba lagi besok ya! 🙏'
            : 'Maaf, Arkana tidak bisa terhubung saat ini. Coba lagi ya.',
          isError: true
        });
        _render();
      })
      .finally(() => {
        _isLoading = false;
        _updateSendBtn();
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
  // AI CALL — via Apps Script proxy
  // Key lives in Script Properties server-side.
  // ─────────────────────────────────────────
  async function _callAI(userText) {
    // Detect intent from current message to decide if we need supplier cache
    const isLookup = /cari|search|siapa|mana|ada (supplier|vendor)|daftar/i.test(userText);

    // Build Gemini contents — last MAX_CONTEXT messages only (saves RPD)
    // Gemini: strict user/model alternation, no empty text, must end with user.
    const historySlice = _messages.slice(-MAX_CONTEXT);

    let contents = historySlice
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text || (m.confirmData ? '[Konfirmasi supplier ditampilkan]' : '')
      }))
      .filter(m => m.text.trim() !== '');

    // Enforce alternation — collapse consecutive same-role, keep latest
    contents = contents.reduce((acc, m) => {
      if (acc.length > 0 && acc[acc.length - 1].role === m.role) {
        acc[acc.length - 1] = m;
      } else {
        acc.push(m);
      }
      return acc;
    }, []);

    // Must end with user turn
    if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
      contents.pop();
    }

    // Convert to Gemini parts format
    contents = contents.map(m => ({
      role:  m.role,
      parts: [{ text: m.text }]
    }));

    // Safety fallback
    if (contents.length === 0) {
      contents = [{ role: 'user', parts: [{ text: userText }] }];
    }

    // Only inject supplier cache for lookup intent — saves ~200 tokens on add flow
    let supplierContext = '';
    if (isLookup) {
      try {
        const cached = loadFromCache('supplier');
        if (cached && cached.data && cached.data.suppliers) {
          const list = cached.data.suppliers
            .slice(0, 40)
            .map(s => `${s.name} (${s.level}, ${s.kota || '-'}, unit: ${(s.units || []).join('/')})`)
            .join('; ');
          supplierContext = `\n\nData supplier (${cached.data.suppliers.length} total): ${list}`;
        }
      } catch (e) { /* no cache — skip */ }
    }

    // UNITS_BISNIS from config.js
    const unitsList = (typeof UNITS_BISNIS !== 'undefined' ? UNITS_BISNIS : [
      'IT & Elektronik', 'Medis & Kesehatan', 'Logistik', 'Energi', 'Konstruksi', 'Umum'
    ]).join(', ');

    const systemInstruction = `Kamu adalah Arkana AI, asisten CV Arkana Trisinergi.
Bantu dua hal: tambah supplier baru, atau cari supplier.
Bahasa: Bahasa Indonesia, santai tapi profesional.

TAMBAH SUPPLIER — field wajib: name, kontak, kota, level, units.
Level: L1=Pabrik, L2=Distributor Resmi, L3=Grosir, L4=Retail, Jasa=Penyedia Jasa.
Units (boleh lebih dari satu): ${unitsList}.
Field opsional: catatan.
Tanya max 2 field yang kurang per giliran.
Jika semua field wajib lengkap, balas HANYA JSON ini:
{"intent":"ADD_SUPPLIER","ready":true,"data":{"name":"...","kontak":"...","kota":"...","level":"...","units":["..."],"catatan":"..."}}

CARI SUPPLIER — ringkas dari data yang ada.${supplierContext}

Diluar dua topik ini: "Arkana belum bisa bantu itu. Coba 'Tambah Supplier Baru' atau 'Cari Supplier'."
PENTING: saat balas JSON, HANYA JSON. Tidak ada teks lain.`;

    // Route through Apps Script proxy — no key in browser
    const result = await api('geminiChat', {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: contents
    });

    if (!result.ok) throw new Error(result.error || 'Gemini proxy error');
    if (!result.text) throw new Error('Empty response from Gemini');

    return result.text.trim();
  }

  // ─────────────────────────────────────────
  // HANDLE AI RESPONSE
  // ─────────────────────────────────────────
  function _handleAIResponse(text) {
    let parsed = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) { /* plain text */ }

    if (parsed && parsed.intent === 'ADD_SUPPLIER' && parsed.ready && parsed.data) {
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

      const idx = _messages.findIndex(m => m.confirmId === msgId);
      if (idx > -1) _messages[idx].submitted = true;
      _pendingConfirm = null;

      clearCache('supplier');
      logActivity('Tambah Supplier', `${data.name} ditambahkan via Arkana AI`);

      _pushMessage({ role: 'ai', text: `✓ Supplier "${data.name}" berhasil ditambahkan!` });
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
      btns.forEach(b => { b.disabled = false; });
    }
  }

  function _confirmCancel(msgId) {
    const idx = _messages.findIndex(m => m.confirmId === msgId);
    if (idx > -1) _messages[idx].submitted = true;
    _pendingConfirm = null;
    _pushMessage({ role: 'ai', text: 'Oke, dibatalkan. Ada yang ingin diubah atau ditambahkan?' });
    _saveHistory();
    _render();
  }

  // ─────────────────────────────────────────
  // COPY AI MESSAGE
  // Long-press on AI bubble → copy text to clipboard
  // ─────────────────────────────────────────
  function _bindCopyOnLongPress() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    let pressTimer = null;

    container.addEventListener('pointerdown', (e) => {
      const bubble = e.target.closest('.chat-msg-ai .chat-bubble');
      if (!bubble) return;
      pressTimer = setTimeout(() => {
        const textEl = bubble.querySelector('.chat-bubble-text');
        const text   = textEl ? textEl.innerText : bubble.innerText;
        if (!text) return;
        navigator.clipboard.writeText(text)
          .then(() => showToast('Pesan disalin', 'success'))
          .catch(() => showToast('Gagal menyalin', 'error'));
      }, 600); // 600ms long press
    });

    container.addEventListener('pointerup',     () => clearTimeout(pressTimer));
    container.addEventListener('pointercancel', () => clearTimeout(pressTimer));
    container.addEventListener('pointermove',   () => clearTimeout(pressTimer));
  }

  // ─────────────────────────────────────────
  // EVENTS
  // ─────────────────────────────────────────
  function _bindEvents() {
    // Back
    document.getElementById('chat-back-btn')?.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    // Clear history
    document.getElementById('chat-clear-btn')?.addEventListener('click', _clearHistory);

    // Clear confirm overlay
    document.getElementById('chat-clear-confirm-ok')?.addEventListener('click', _clearHistoryConfirmed);
    document.getElementById('chat-clear-confirm-cancel')?.addEventListener('click', _closeClearOverlay);
    document.getElementById('chat-clear-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('chat-clear-overlay')) _closeClearOverlay();
    });

    // Textarea
    const ta = document.getElementById('chat-textarea');
    if (ta) {
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
        _updateSendBtn();
      });
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

    // Confirm card — event delegation
    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-confirm-id]');
      if (!btn) return;
      const msgId  = btn.dataset.confirmId;
      const action = btn.dataset.action;
      if (action === 'save')   _confirmSave(msgId);
      if (action === 'cancel') _confirmCancel(msgId);
    });

    // Long-press to copy AI messages
    _bindCopyOnLongPress();
  }

  function _bindTemplateChips() {
    document.querySelectorAll('.chat-template-chip').forEach(chip => {
      chip.addEventListener('click', () => sendMessage(chip.dataset.template));
    });
  }

  function _updateSendBtn() {
    const ta  = document.getElementById('chat-textarea');
    const btn = document.getElementById('chat-send-btn');
    if (btn) btn.disabled = !ta || ta.value.trim() === '' || _isLoading;
  }

  // ─────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────
  return { init };

})();

window.addEventListener('DOMContentLoaded', () => ChatApp.init());
