// ===================================================================
// Who can enter their own scores (added Nov 13, 2026). Ty turns it on or off per player in Admin > Enter score.
// Script Properties: 'entry:<Name>' = 'on'. No property = off (Ty's default for everyone, new players and guests too).
// Admins (API_ADMINS_) can always save anyone's score; the GSPro agent is not affected.
// Wiring (in Web.gs):
//   - getBoardData: d.entry = entryInfo_() after buildBoardData_ (cached with the board; Ty's changes clear the cache).
//   - doPost: a body with action 'entry' goes to apiEntry_ before doPost0_ (still clears the board in finally).
//   - apiSave_: refuses non-admins whose entry is off.
// ===================================================================
function entryAllowed_(name) { return apiProps_().getProperty('entry:' + name) === 'on'; }

/** Sent in the data feed: active players (league + guests) and who is switched on. */
function entryInfo_() {
  var props = apiProps_().getProperties(), on = {}, players = [];
  apiPlayers_().forEach(function (p) {
    var admin = apiIsAdmin_(p.name);
    players.push({ name: p.name, guest: !!p.guest, admin: admin });
    if (admin || props['entry:' + p.name] === 'on') on[p.name] = true;
  });
  return { on: on, players: players };
}

/** Admin action: { action: 'entry', token, name: '<Name>' or '*', on: true|false }. */
function apiEntry_(b) {
  var user = apiUser_(b.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  if (!user.admin) return { ok: false, code: 'denied', error: 'Only Ty can change who enters scores.' };
  var all = apiPlayers_().map(function (p) { return p.name; }).filter(function (n) { return !apiIsAdmin_(n); });
  var names = b.name === '*' ? all : all.filter(function (n) { return n === String(b.name); });
  if (!names.length) return { ok: false, error: String(b.name) + ' is not an active player.' };
  var props = apiProps_();
  names.forEach(function (n) { if (b.on) props.setProperty('entry:' + n, 'on'); else props.deleteProperty('entry:' + n); });
  return { ok: true, changed: names.length };
}
