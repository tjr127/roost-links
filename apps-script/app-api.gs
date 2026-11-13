
// ===================================================================
// Installable app (golf.rostlabs.com) API — added Nov 11, 2026.
// The app calls this web app with ?api=... (GET) or a JSON body with "action" (POST).
// Players sign in with their name and a 4-digit PIN. Everyone can view everything;
// a player can only save their own scores, except admins (API_ADMINS_) who can save anyone's.
// PINs are stored hashed in Script Properties, never as typed.
// ===================================================================
var API_ADMINS_ = ['Ty'];
var API_INTERNAL_ = false;   // true while the app API is saving, so saveScore knows the call is signed in

function apiJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function apiGet_(e) {
  var p = e.parameter || {}, out;
  try {
    if (p.api === 'data') out = { ok: true, data: getBoardData() };
    else if (p.api === 'players') out = { ok: true, players: apiPlayers_() };
    else if (p.api === 'whoami') out = { ok: true, user: apiUser_(p.token) };
    else out = { ok: false, error: 'Unknown request' };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return apiJson_(out);
}

function apiPost_(req) {
  try {
    switch (req.action) {
      case 'login': return apiLogin_(req.name, req.pin);
      case 'setup': return apiSetup_(req.name, req.pin);
      case 'logout': apiProps_().deleteProperty('tok:' + String(req.token || '')); return { ok: true };
      case 'save': return apiSave_(req);
    }
    return { ok: false, error: 'Unknown action' };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function apiProps_() { return PropertiesService.getScriptProperties(); }

function apiHash_(name, pin, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + name + '|' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function apiIsAdmin_(name) { return API_ADMINS_.indexOf(String(name)) >= 0; }

/** Active players (league members first, then guests) and whether each has set a PIN. */
function apiPlayers_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var rows = ss.getSheetByName('Players').getRange('A2:C40').getDisplayValues();
  var props = apiProps_().getProperties();
  var out = [];
  rows.forEach(function (r) {
    if (!r[0] || r[0] === 'Guest' || r[2] !== 'TRUE') return;
    out.push({ name: r[0], guest: r[1] === 'Guest', hasPin: !!props['pin:' + r[0]] });
  });
  out.sort(function (a, b) { return (a.guest ? 1 : 0) - (b.guest ? 1 : 0); });
  return out;
}

function apiCheckName_(name) {
  name = String(name || '');
  var ok = apiPlayers_().some(function (p) { return p.name === name; });
  if (!ok) throw new Error(name + ' is not an active player.');
  return name;
}

function apiCheckPin_(pin) {
  pin = String(pin || '');
  if (!/^\d{4}$/.test(pin)) throw new Error('The PIN must be 4 digits.');
  return pin;
}

function apiToken_(name) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  apiProps_().setProperty('tok:' + token, JSON.stringify({ name: name, at: new Date().toISOString() }));
  return { ok: true, token: token, name: name, admin: apiIsAdmin_(name) };
}

function apiUser_(token) {
  if (!token) return null;
  var raw = apiProps_().getProperty('tok:' + String(token));
  if (!raw) return null;
  try { var t = JSON.parse(raw); return { name: t.name, admin: apiIsAdmin_(t.name) }; } catch (e) { return null; }
}

/** First-time setup: choose a PIN for a name that doesn't have one yet. */
function apiSetup_(name, pin) {
  name = apiCheckName_(name); pin = apiCheckPin_(pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (apiProps_().getProperty('pin:' + name)) return { ok: false, code: 'taken', error: name + ' already has a PIN. Enter it instead.' };
    var salt = Utilities.getUuid();
    apiProps_().setProperty('pin:' + name, salt + ':' + apiHash_(name, pin, salt));
  } finally { lock.releaseLock(); }
  return apiToken_(name);
}

/** Sign in with an existing PIN. Five wrong tries locks that name for 15 minutes. */
function apiLogin_(name, pin) {
  name = apiCheckName_(name); pin = String(pin || '');
  var stored = apiProps_().getProperty('pin:' + name);
  if (!stored) return { ok: false, code: 'nopin', error: name + ' hasn\'t set a PIN yet.' };
  var cache = CacheService.getScriptCache(), fk = 'pinfail:' + name;
  var fails = Number(cache.get(fk) || 0);
  if (fails >= 5) return { ok: false, code: 'locked', error: 'Too many wrong PINs. Try again in 15 minutes, or ask Ty to reset it.' };
  var parts = stored.split(':');
  if (apiHash_(name, pin, parts[0]) !== parts[1]) {
    fails++;
    cache.put(fk, String(fails), 900);
    var left = 5 - fails;
    return { ok: false, code: left > 0 ? 'wrong' : 'locked',
      error: left > 0 ? 'Wrong PIN. ' + left + (left === 1 ? ' try' : ' tries') + ' left.' : 'Too many wrong PINs. Try again in 15 minutes, or ask Ty to reset it.' };
  }
  cache.remove(fk);
  return apiToken_(name);
}

/** Save a score from the app: players save their own; admins save anyone's. */
function apiSave_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  if (String(req.name) !== user.name && !user.admin) return { ok: false, code: 'denied', error: 'You can only enter your own scores.' };
  if (!user.admin && !entryAllowed_(user.name)) return { ok: false, code: 'entryoff', error: 'Score entry is turned off for you. Ty is entering scores.' };
  API_INTERNAL_ = true;
  try {
    return { ok: true, result: saveScore(req.name, req.hole, req.gross, req.putts) };
  } finally { API_INTERNAL_ = false; }
}

/** League menu: clear a player's PIN (and sign them out everywhere) so they can choose a new one. */
function resetPlayerPin() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Reset a player\'s PIN', 'Player name exactly as on the Players tab:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var name = r.getResponseText().trim();
  var props = apiProps_(), all = props.getProperties(), n = 0;
  if (!all['pin:' + name]) { ui.alert(name + ' doesn\'t have a PIN set.'); return; }
  props.deleteProperty('pin:' + name);
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('tok:') !== 0) return;
    try { if (JSON.parse(all[k]).name === name) { props.deleteProperty(k); n++; } } catch (e) {}
  });
  CacheService.getScriptCache().remove('pinfail:' + name);
  ui.alert('PIN cleared for ' + name + '. They choose a new one next time they open the app.');
}

/**
 * League menu: turn score entry off on the old script.google.com page, so every score
 * typed on a phone goes through a PIN. Run it once everyone has the app. Run again to turn it back on.
 */
function toggleOldPageEntry() {
  var props = apiProps_(), off = props.getProperty('OLD_PAGE_SAVE') === 'off';
  props.setProperty('OLD_PAGE_SAVE', off ? 'on' : 'off');
  SpreadsheetApp.getUi().alert(off ? 'Score entry on the old page is ON again.' : 'Score entry on the old page is now OFF. Players must use the app (with their PIN).');
}
