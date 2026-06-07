// ═══════════════════════════════════════════════════
// Arkana App — Component Library  v2.2.0
// UI.* — pure functions returning HTML strings.
// No DOM access. No side effects. Input in, HTML out.
//
// Load order: 5th (after app.js, before [page].js)
//
// ─────────────────────────────────────────
// COMPONENT CATALOG
// ─────────────────────────────────────────
//
// UI.emptyState(icon, text)
//   Generic empty state panel.
//
// UI.badge.level(level)
//   Supplier level badge (L1/L2/L3/L4/Jasa).
//
// UI.badge.auth()
//   "✓ Authorized" badge.
//
// UI.badge.metode(metode)
//   Expense payment method badge.
//
// UI.badge.status(status)
//   Project status badge (active/closed).
//
// UI.badge.kategori(label)
//   Expense category label badge.
//
// UI.badge.reimburse()
//   Reimburse flag badge.
//
// UI.badge.proyek(label)
//   Project tag badge.
//
// UI.badge.unit(label)
//   Supplier unit bisnis badge.
//
// UI.card.supplier(supplier, countMap)
//   Full supplier list card HTML.
//
// UI.card.expense(expense, projects)
//   Expense list card HTML.
//
// UI.card.project(project)
//   Project list card HTML.
//
// UI.chat.bubble(msg)
//   Single chat message bubble. msg = { role, text, time, isError }
//
// UI.chat.confirmCard(data, msgId)
//   Supplier confirmation card before submission.
//   data = { name, level, kota, kontak, units, catatan }
//   msgId = unique id for button binding
//
// UI.chat.templateChips(userName)
//   Pre-chat template chips shown when history is empty.
//
// ═══════════════════════════════════════════════════

const UI = (() => {

  // ─────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtNum(n) {
    return Number(n).toLocaleString('id-ID');
  }

  function _fmtDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    const days   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function _fmtRp(val) {
    return 'Rp ' + (parseFloat(val) || 0).toLocaleString('id-ID');
  }

  function _fmtTime(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d)) return '';
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }

  // ─────────────────────────────────────────
  // UI.emptyState
  // ─────────────────────────────────────────

  function emptyState(icon, text) {
    return `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-text">${text}</div>
    </div>`;
  }

  // ─────────────────────────────────────────
  // UI.badge.*
  // ─────────────────────────────────────────

  const badge = {

    level(level) {
      const isJasa = level === 'Jasa';
      const cls = isJasa ? 'jasa' : level.toLowerCase();
      const label = isJasa ? '🔧 Jasa' : level;
      return `<span class="level-badge ${cls}">${label}</span>`;
    },

    auth() {
      return `<span class="auth-badge">✓ Authorized</span>`;
    },

    metode(metode) {
      if (metode === 'kas_perusahaan')
        return `<span class="badge badge-kas">🏦 Kas Perusahaan</span>`;
      if (metode === 'personal')
        return `<span class="badge badge-personal">👤 Personal</span>`;
      if (metode === 'vendor_paylater')
        return `<span class="badge badge-paylater">⏳ Vendor Paylater</span>`;
      return '';
    },

    status(status) {
      const isActive = status === 'active';
      const cls   = isActive ? 'status-active' : 'status-closed';
      const label = isActive ? 'Aktif' : 'Selesai';
      return `<span class="status-badge ${cls}">${label}</span>`;
    },

    kategori(label) {
      return `<span class="badge badge-kategori">${_esc(label)}</span>`;
    },

    reimburse() {
      return `<span class="badge badge-reimburse">↩ Reimburse</span>`;
    },

    proyek(label) {
      return `<span class="badge badge-proyek">📁 ${_esc(label)}</span>`;
    },

    unit(label) {
      return `<span class="unit-badge">${_esc(label)}</span>`;
    }

  };

  // ─────────────────────────────────────────
  // UI.card.*
  // ─────────────────────────────────────────

  const card = {

    supplier(supplier, countMap = {}) {
      const s        = supplier;
      const initials = s.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const color    = SUPPLIER_COLORS[s.name.charCodeAt(0) % SUPPLIER_COLORS.length];
      const phone    = s.kontak ? String(s.kontak) : '—';
      const counts   = countMap[s.id] || { produk: 0, jasa: 0 };
      const isJasa   = s.level === SUPPLIER_LEVEL.JASA;

      const countChips = [
        counts.produk > 0 ? `<span class="count-chip count-produk">📦 ${counts.produk} produk</span>` : '',
        counts.jasa   > 0 ? `<span class="count-chip count-jasa">🔧 ${counts.jasa} jasa</span>` : ''
      ].filter(Boolean).join('');

      const units = (s.units || []).map(u => badge.unit(u)).join('');

      return `<div class="supplier-card js-open-supplier" data-id="${s.id}">
        <div class="supplier-card-top">
          <div class="supplier-initial" style="background:${color}">${initials}</div>
          <div class="supplier-info">
            <div class="supplier-name">${_esc(s.name)}</div>
            <div class="supplier-meta">${_esc(phone)}${s.kota ? ' · ' + _esc(s.kota) : ''}</div>
          </div>
        </div>
        <div class="supplier-divider"></div>
        <div class="supplier-badges">
          ${badge.level(s.level)}
          ${s.authorized && !isJasa ? badge.auth() : ''}
          ${units}
        </div>
        ${countChips ? `<div class="supplier-count-chips">${countChips}</div>` : ''}
      </div>`;
    },

    expense(expense, projects = []) {
      const e = expense;

      const proj = e.tipe === 'proyek'
        ? projects.find(p => p.id === e.projectId)
        : null;

      const kategoriLabel = (e.kategori === 'Lain-lain' && e.customKategori)
        ? e.customKategori
        : (e.kategori || '—');

      const reimburseTag = (
        e.metodePembayaran === 'personal' &&
        e.perluReimburse === 'ya'
      ) ? badge.reimburse() : '';

      const proyekTag = proj
        ? badge.proyek(proj.nama)
        : (e.tipe === 'proyek' ? badge.proyek('Proyek') : '');

      return `<div class="expense-card" data-id="${e.id}">
        <div class="card-desc">${_esc(e.deskripsi || '(tanpa deskripsi)')}</div>
        <div class="card-amount">${_fmtRp(e.jumlah)}</div>
        <div class="card-divider"></div>
        <div class="card-footer">
          <div class="card-date">${_fmtDate(e.tanggal)}</div>
          <div class="card-badges">
            ${badge.kategori(kategoriLabel)}
            ${badge.metode(e.metodePembayaran)}
            ${reimburseTag}
            ${proyekTag}
          </div>
        </div>
      </div>`;
    },

    project(project) {
      const p = project;
      const isClosed = p.status === 'closed';

      return `<div class="project-card ${isClosed ? 'closed' : ''}" data-id="${p.id}">
        <div class="card-stripe ${isClosed ? 'stripe-closed' : 'stripe-active'}"></div>
        <div class="card-body">
          <div class="card-name">${_esc(p.nama)}</div>
          <div class="card-meta">
            <span class="card-unit">${_esc(p.unitBisnis || '—')}</span>
            ${badge.status(p.status)}
          </div>
        </div>
        <div class="card-arrow">›</div>
      </div>`;
    }

  };

  // ─────────────────────────────────────────
  // UI.chat.*
  // PRD-05-A: Arkana AI chat components.
  // ─────────────────────────────────────────

  const chat = {

    /**
     * Single chat bubble.
     * @param {object} msg
     *   msg.role    — 'user' | 'ai'
     *   msg.text    — message text (newlines rendered as <br>)
     *   msg.time    — ISO timestamp string
     *   msg.isError — boolean, renders error style on AI bubble
     *   msg.html    — optional raw HTML content (for confirm cards embedded in bubble)
     */
    bubble(msg) {
      const isUser  = msg.role === 'user';
      const timeStr = msg.time ? _fmtTime(msg.time) : '';
      const content = msg.html
        ? msg.html
        : `<div class="chat-bubble-text">${_esc(msg.text).replace(/\n/g, '<br>')}</div>`;

      const errorClass = (!isUser && msg.isError) ? ' chat-bubble-error' : '';

      return `<div class="chat-msg chat-msg-${isUser ? 'user' : 'ai'}">
        <div class="chat-bubble${errorClass}">
          ${content}
        </div>
        ${timeStr ? `<div class="chat-time">${timeStr}</div>` : ''}
      </div>`;
    },

    /**
     * Supplier confirmation card — rendered inside an AI bubble.
     * @param {object} data   — { name, level, kota, kontak, units, catatan }
     * @param {string} msgId  — unique string used for button data attributes
     */
    confirmCard(data, msgId) {
      const levelLabel = {
        L1: 'L1 · Pabrik',
        L2: 'L2 · Distributor Resmi',
        L3: 'L3 · Grosir',
        L4: 'L4 · Retail',
        Jasa: 'Jasa'
      }[data.level] || data.level;

      const unitsStr = Array.isArray(data.units)
        ? data.units.join(', ')
        : (data.units || '—');

      return `<div class="chat-confirm-card">
        <div class="chat-confirm-title">Konfirmasi Supplier Baru</div>
        <div class="chat-confirm-divider"></div>
        <div class="chat-confirm-rows">
          <div class="chat-confirm-row">
            <span class="chat-confirm-label">Nama</span>
            <span class="chat-confirm-value">${_esc(data.name)}</span>
          </div>
          <div class="chat-confirm-row">
            <span class="chat-confirm-label">Level</span>
            <span class="chat-confirm-value">${_esc(levelLabel)}</span>
          </div>
          <div class="chat-confirm-row">
            <span class="chat-confirm-label">Kota</span>
            <span class="chat-confirm-value">${_esc(data.kota)}</span>
          </div>
          <div class="chat-confirm-row">
            <span class="chat-confirm-label">Kontak</span>
            <span class="chat-confirm-value">${_esc(data.kontak)}</span>
          </div>
          <div class="chat-confirm-row">
            <span class="chat-confirm-label">Unit</span>
            <span class="chat-confirm-value">${_esc(unitsStr)}</span>
          </div>
          ${data.catatan ? `<div class="chat-confirm-row">
            <span class="chat-confirm-label">Catatan</span>
            <span class="chat-confirm-value">${_esc(data.catatan)}</span>
          </div>` : ''}
        </div>
        <div class="chat-confirm-divider"></div>
        <div class="chat-confirm-actions">
          <button class="chat-confirm-btn chat-confirm-cancel" data-confirm-id="${_esc(msgId)}" data-action="cancel">Batalkan</button>
          <button class="chat-confirm-btn chat-confirm-save"   data-confirm-id="${_esc(msgId)}" data-action="save">✓ Simpan</button>
        </div>
      </div>`;
    },

    /**
     * Pre-chat template chips — shown when chat history is empty.
     * @param {string} userName — greeting name
     */
    templateChips(userName) {
      return `<div class="chat-welcome">
        <div class="chat-welcome-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="chat-welcome-title">Arkana AI</div>
        <div class="chat-welcome-sub">Halo, ${_esc(userName)}! Ada yang bisa Arkana bantu?</div>
        <div class="chat-templates">
          <button class="chat-template-chip" data-template="Tambah Supplier Baru">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Tambah Supplier Baru
          </button>
          <button class="chat-template-chip" data-template="Cari Supplier">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            Cari Supplier
          </button>
        </div>
      </div>`;
    }

  };

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────
  return { emptyState, badge, card, chat };

})();
