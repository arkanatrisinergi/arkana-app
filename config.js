// ─────────────────────────────────────────
// ARKANA APP — Central Config
// Single source of truth for:
//   - Apps Script URL
//   - App Version
//   - Unit Bisnis list
//
// Note: GEMINI_API_KEY lives in Apps Script Script Properties — not here.
//
// This is the ONLY file where these values are defined.
// All other files read from here — never redefine.
// ─────────────────────────────────────────

const ARKANA_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzbLqdV990CC-suwX0oEaHOGQjYTsVvvw1M0_72XAkKXw0tnzbmrHvg1hIhbN1TBkgbMw/exec';
const APP_VERSION       = '2..0';


// Unit bisnis — single source of truth.
// Used by: chat.js (AI system prompt), supplier form, expense form.
// Add/remove units here only — all features pick up the change automatically.
const UNITS_BISNIS = [
  'IT & Elektronik',
  'Medis & Kesehatan',
  'Logistik',
  'Energi',
  'Konstruksi',
  'Umum'
];
