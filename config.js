// ─────────────────────────────────────────
// ARKANA APP — Central Config
// Single source of truth for:
//   - Apps Script URL
//   - App Version
//   - Gemini API Key
//   - Unit Bisnis list
//
// This is the ONLY file where these values are defined.
// All other files read from here — never redefine.
// ─────────────────────────────────────────

const ARKANA_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-OmUSRNWFsqwhYomuIbfK_sjKe-Isg80eFynIxsajs50AjhpJc8QNr7VD8g2luTpV1g/exec';
const APP_VERSION       = '2.1.0';

// Gemini AI — used by chat.js (Arkana AI feature)
// Get your key at: aistudio.google.com → Get API key
// Replace the placeholder below with your actual key before deploying.
const GEMINI_API_KEY    = 'AQ.Ab8RN6K_2QbjAUkZLzbPlpOdaOhew34b-g7Emo8r7FplZeYJbg';

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
