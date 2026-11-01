// Pure checks used by the main process. Kept free of Electron so they can be unit tested.

const SECRET_FIELDS = [
  'geminiApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'groqApiKey',
  'openrouterApiKey',
  'customApiKey'
];
const MASK_CHAR = '•';

// Returns the normalised address for http(s) links, or null. Links with a user name or
// password are refused because "https://bank.com@evil.com" goes to evil.com.
function toWebUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

function isTrustedFrameUrl(frameUrl, appUrl) {
  const frame = String(frameUrl || '').split(/[?#]/)[0];
  const app = String(appUrl || '').split(/[?#]/)[0];
  return Boolean(frame) && Boolean(app) && (frame === app || frame === app.replace(/\/$/, ''));
}

const isMasked = (v) => typeof v === 'string' && v.includes(MASK_CHAR);

function maskSecret(value) {
  return value ? `${MASK_CHAR.repeat(12)}${value.slice(-4)}` : '';
}

// Allow-lists renderer-supplied settings: no file paths, masked keys keep stored values,
// and a changed custom endpoint never inherits the stored custom key.
function sanitizeIncomingSettings(current, incoming, allowedKeys) {
  const clean = {};
  if (!incoming || typeof incoming !== 'object') return clean;
  for (const key of allowedKeys) {
    if (key === 'profilePath' || incoming[key] === undefined) continue;
    if (SECRET_FIELDS.includes(key)) {
      clean[key] = isMasked(incoming[key]) ? current[key] : String(incoming[key] || '').trim();
    } else if (key === 'profileMarkdown' || typeof incoming[key] === 'string') {
      clean[key] = String(incoming[key]);
    }
  }
  const urlChanged =
    clean.customBaseUrl !== undefined &&
    clean.customBaseUrl.replace(/\/+$/, '') !== (current.customBaseUrl || '').replace(/\/+$/, '');
  if (urlChanged && (incoming.customApiKey === undefined || isMasked(incoming.customApiKey))) {
    clean.customApiKey = '';
  }
  return clean;
}

// cipher: { available: boolean, encrypt(string) -> Buffer, decrypt(Buffer) -> string } (Electron safeStorage)
function settingsForDisk(settings, cipher) {
  const toStore = { ...settings };
  delete toStore.profileMarkdown; // lives in the profile .md file
  delete toStore.replicateApiToken;
  if (cipher.available) {
    toStore.encryptedSecrets = {};
    for (const field of SECRET_FIELDS) {
      const value = toStore[field];
      delete toStore[field];
      if (value) toStore.encryptedSecrets[field] = cipher.encrypt(value).toString('base64');
    }
  }
  return toStore;
}

function secretsFromDisk(saved, cipher) {
  const out = {};
  const enc = saved.encryptedSecrets || {};
  for (const field of SECRET_FIELDS) {
    if (enc[field] && cipher.available) {
      try {
        out[field] = cipher.decrypt(Buffer.from(enc[field], 'base64'));
        continue;
      } catch {}
    }
    if (typeof saved[field] === 'string') out[field] = saved[field];
  }
  return out;
}

// Stops captured text from closing the <untrusted_…> fence it is wrapped in.
function stripFenceTags(text) {
  return String(text || '').replace(/<\/?untrusted_[a-z_]*>/gi, '');
}

module.exports = {
  SECRET_FIELDS,
  MASK_CHAR,
  toWebUrl,
  isTrustedFrameUrl,
  isMasked,
  maskSecret,
  sanitizeIncomingSettings,
  settingsForDisk,
  secretsFromDisk,
  stripFenceTags
};
