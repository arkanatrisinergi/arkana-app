// ═══════════════════════════════════════════════════
// Arkana App — Chat JS  v2.1.0
// PRD-05-A: Arkana AI — standalone page module.
// Runs on chat.html. Redirects to index.html if no session.
// Depends on: constants.js, utils.js, app.js, components.js
// ═══════════════════════════════════════════════════

const ChatApp = (() => {

  // ─────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────
  const MAX_HISTORY  = 50;
  const TYPING_DELAY = 500;

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
    // Guard — redirect if no session
    const session = getUser();
    if (!session || !session.id) {
      window.location.href = 'index.html';
      return;
    }
    _userName = session.name || 'Pengguna';

    _loadHistory();
    _render();
    _bindEvents();

    // Focus textarea
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
      // Restore pending confirm if last AI message has confirmData and not submitted
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
    // Remove existing typing indicator if any
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
        _pushMessage({
          role: 'ai',
          text: 'Maaf, Arkana tidak bisa terhubung saat ini. Coba lagi ya.',
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
  // AI CALL
  // ─────────────────────────────────────────
  async function _callAI(userText) {
    // Build Gemini contents array — last 20 messages
    // Gemini uses 'user' and 'model' roles (not 'assistant')
    const historySlice = _messages.slice(-20);
    const contents = historySlice.map(m => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text || (m.confirmData ? '[Kartu konfirmasi ditampilkan]' : '...') }]
    }));

    // Inject supplier cache as context for lookup intent
    let supplierContext = '';
    try {
      const cached = loadFromCache('supplier');
      if (cached && cached.data && cached.data.suppliers) {
        const list = cached.data.suppliers
          .slice(0, 40)
          .map(s => `${s.name} (${s.level}, ${s.kota || '-'}, unit: ${(s.units || []).join('/')})`)
          .join('; ');
        supplierContext = `\n\nData supplier yang sudah ada (${cached.data.suppliers.length} total): ${list}`;
      }
    } catch (e) { /* no cache — skip */ }

    // UNITS_BISNIS from config.js — single source of truth
    const unitsList = (typeof UNITS_BISNIS !== 'undefined' ? UNITS_BISNIS : [
      'IT & Elektronik', 'Medis & Kesehatan', 'Logistik', 'Energi', 'Konstruksi', 'Umum'
    ]).join(', ');

    const systemInstruction = `Kamu adalah Arkana AI, asisten operasional untuk CV Arkana Trisinergi.
Kamu hanya bisa membantu dua hal:
1. Tambah supplier baru
2. Cari/lookup supplier yang sudah ada

Bahasa: selalu Bahasa Indonesia, santai tapi profesional.

Untuk TAMBAH SUPPLIER, kumpulkan field berikut satu per satu jika belum ada:
- name (nama supplier/perusahaan) — WAJIB
- kontak (nomor telepon/WA) — WAJIB
- kota — WAJIB
- level: harus salah satu dari L1, L2, L3, L4, atau Jasa — WAJIB
  (L1 = Pabrik, L2 = Distributor Resmi, L3 = Grosir, L4 = Retail, Jasa = Penyedia Jasa)
- units (unit bisnis, boleh lebih dari satu) — WAJIB
  Pilihan: ${unitsList}
- catatan — OPSIONAL

Tanya 1-2 field yang belum ada per giliran. Jangan tanya semua sekaligus.

Jika SEMUA field wajib sudah terkumpul, balas HANYA dengan JSON ini (tidak ada teks lain sama sekali):
{"intent":"ADD_SUPPLIER","ready":true,"data":{"name":"...","kontak":"...","kota":"...","level":"...","units":["..."],"catatan":"..."}}

Untuk CARI SUPPLIER, beri ringkasan singkat dari data yang tersedia.${supplierContext}

Jika permintaan di luar dua topik ini, balas:
"Arkana belum bisa bantu itu. Coba ketik 'Tambah Supplier Baru' atau 'Cari Supplier'."

PENTING: Saat membalas JSON, HANYA tulis JSON. Tidak ada kata sebelum atau sesudah JSON.`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: contents,
          generationConfig: {
            maxOutputTokens: 1000,
            temperature:     0.3
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || ('API error ' + response.status);
      throw new Error(errMsg);
    }

    // Gemini response: candidates[0].content.parts[0].text
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    return text.trim();
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
  // EVENTS
  // ─────────────────────────────────────────
  function _bindEvents() {
    // Back — go to index.html
    document.getElementById('chat-back-btn')?.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    // Clear history
    document.getElementById('chat-clear-btn')?.addEventListener('click', _clearHistory);

    // Textarea — auto-grow + send state
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

    // Confirm card buttons — event delegation on messages container
    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-confirm-id]');
      if (!btn) return;
      const msgId  = btn.dataset.confirmId;
      const action = btn.dataset.action;
      if (action === 'save')   _confirmSave(msgId);
      if (action === 'cancel') _confirmCancel(msgId);
    });

    // Clear history inline overlay buttons
    document.getElementById('chat-clear-confirm-ok')?.addEventListener('click', _clearHistoryConfirmed);
    document.getElementById('chat-clear-confirm-cancel')?.addEventListener('click', _closeClearOverlay);
    document.getElementById('chat-clear-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('chat-clear-overlay')) _closeClearOverlay();
    });
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
