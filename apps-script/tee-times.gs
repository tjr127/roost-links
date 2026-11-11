
// ===================================================================
// Tee times (Early / Late groups) — added Nov 11, 2026.
// League members pick Early, Late, Either or Out for the next league night (Season tab,
// skipping "Off" weeks). Opens the day before at 8 AM, closes on the night at 3 PM.
// Ty confirms the groups; after that nobody can change (Ty can reopen).
// Picks live on the "Tee Times" tab (one row per night + player); confirmed groups go in
// its Group column and in Script Properties (teeConf:<night>).
// ===================================================================
var TEE_SHEET_ = 'Tee Times';
var TEE_HEAD_ = ['Night', 'Player', 'Choice', 'Updated', 'Set by', 'Group'];
var TEE_OPEN_ = { daysBefore: 1, hour: 8 };    // Wednesday 8:00 AM
var TEE_CLOSE_ = { daysBefore: 0, hour: 15 };  // Thursday 3:00 PM
var TEE_TIMES_ = { Early: '6:00 PM', Late: '8:00 PM' };
var TEE_CHOICES_ = ['Early', 'Late', 'Either', 'Out'];

function teeSheet_(ss) {
  var sh = ss.getSheetByName(TEE_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(TEE_SHEET_);
    sh.getRange(1, 1, 1, TEE_HEAD_.length).setValues([TEE_HEAD_]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** The next league night on or after today (not an "Off" week), with its sign-up window. */
function teeNight_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var rows = ss.getSheetByName('Season').getRange('A2:E60').getValues();
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i][1], type = String(rows[i][4] || '');
    if (!(d instanceof Date) || type === 'Off' || type === '') continue;
    var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (key < today) continue;
    function at(rule) {
      var x = new Date(d.getTime());
      x.setDate(x.getDate() - rule.daysBefore);
      var day = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      // Build the local time in the sheet's time zone.
      var off = Utilities.formatDate(x, tz, 'Z');  // e.g. -0500
      return new Date(day + 'T' + ('0' + rule.hour).slice(-2) + ':00:00' + off.slice(0, 3) + ':' + off.slice(3));
    }
    return {
      key: key, date: d, type: type, course: String(rows[i][2] || ''),
      label: Utilities.formatDate(d, tz, 'EEEE, MMM d'),
      opens: at(TEE_OPEN_), closes: at(TEE_CLOSE_)
    };
  }
  return null;
}

function teeLeague_(ss) {
  return ss.getSheetByName('Players').getRange('A2:C40').getDisplayValues()
    .filter(function (r) { return r[0] && r[1] === 'League' && r[2] === 'TRUE'; })
    .map(function (r) { return r[0]; });
}

/** Head-to-head pairs playing on that night: regular and one-way rows on the date, plus makeups whose "plays on" is that night. */
function teePairs_(ss, nightKey) {
  var tz = ss.getSpreadsheetTimeZone();
  function k(v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : ''; }
  var out = [], seen = {};
  ss.getSheetByName('Matches').getRange('A2:F200').getValues().forEach(function (m) {
    if (!m[2] || !m[3]) return;
    var onDate = k(m[0]) === nightKey && !m[4] && !m[5];
    var makeup = k(m[4]) === nightKey || k(m[5]) === nightKey;
    if (!onDate && !makeup) return;
    var id = [m[2], m[3]].sort().join('|');
    if (seen[id]) return;
    seen[id] = true;
    out.push([String(m[2]), String(m[3])]);
  });
  return out;
}

function teeRows_(ss, nightKey) {
  var sh = teeSheet_(ss), last = sh.getLastRow();
  var vals = last > 1 ? sh.getRange(2, 1, last - 1, TEE_HEAD_.length).getValues() : [];
  var out = {};
  vals.forEach(function (r, i) { if (String(r[0]) === nightKey && r[1]) out[r[1]] = { row: i + 2, choice: String(r[2]), by: String(r[4]), group: String(r[5]) }; });
  return out;
}

function teeState_(night) {
  var now = new Date();
  var conf = apiProps_().getProperty('teeConf:' + night.key);
  if (conf) return 'confirmed';
  if (now < night.opens) return 'before';
  if (now >= night.closes) return 'closed';
  return 'open';
}

/**
 * Suggested groups: Early and Late pickers stay put; "Either" players are placed to keep
 * head-to-head opponents together first, then to balance the groups (target 4 and 4, never over 5 if avoidable).
 */
function teeSuggest_(choices, pairs) {
  var early = [], late = [], either = [];
  Object.keys(choices).forEach(function (n) {
    var c = choices[n];
    if (c === 'Early') early.push(n); else if (c === 'Late') late.push(n); else if (c === 'Either') either.push(n);
  });
  var best = null;
  var combos = Math.pow(2, either.length);
  for (var mask = 0; mask < combos; mask++) {
    var e = early.slice(), l = late.slice();
    either.forEach(function (n, i) { if (mask & (1 << i)) l.push(n); else e.push(n); });
    var split = 0;
    pairs.forEach(function (p) {
      var a = e.indexOf(p[0]) >= 0 ? 'E' : l.indexOf(p[0]) >= 0 ? 'L' : '';
      var b = e.indexOf(p[1]) >= 0 ? 'E' : l.indexOf(p[1]) >= 0 ? 'L' : '';
      if (a && b && a !== b) split++;
    });
    var over = Math.max(0, e.length - 5) + Math.max(0, l.length - 5);
    var score = over * 1000 + split * 100 + Math.abs(e.length - l.length) * 10 + (e.length < l.length ? 1 : 0);
    if (!best || score < best.score) best = { score: score, early: e, late: l, split: split };
  }
  return { early: best.early, late: best.late, split: best.split };
}

function teeTimes_(ss) {
  var night = teeNight_(ss);
  if (!night) return null;
  var tz = ss.getSpreadsheetTimeZone();
  var league = teeLeague_(ss);
  var rows = teeRows_(ss, night.key);
  var choices = {}, players = league.map(function (n) {
    var r = rows[n];
    if (r && r.choice) choices[n] = r.choice;
    return { name: n, choice: r ? r.choice : '', by: r ? r.by : '' };
  });
  var pairs = teePairs_(ss, night.key).filter(function (p) { return league.indexOf(p[0]) >= 0 && league.indexOf(p[1]) >= 0; });
  var state = teeState_(night);
  var conf = apiProps_().getProperty('teeConf:' + night.key);
  return {
    night: night.key, label: night.label, type: night.type, course: night.course, state: state,
    opens: Utilities.formatDate(night.opens, tz, "EEE, MMM d 'at' h:mm a"),
    closes: Utilities.formatDate(night.closes, tz, "EEE 'at' h:mm a"),
    times: TEE_TIMES_, players: players, pairs: pairs,
    suggested: teeSuggest_(choices, pairs),
    confirmed: conf ? JSON.parse(conf) : null,
    draft: (function (d) { return d ? JSON.parse(d) : null; })(apiProps_().getProperty('teeDraft:' + night.key))
  };
}

/** App: a player sets their own pick (admins can set anyone's) while sign-up is open (admins until groups are confirmed). */
function apiTee_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  var name = String(req.name || ''), choice = String(req.choice || '');
  if (name !== user.name && !user.admin) return { ok: false, code: 'denied', error: 'You can only set your own tee time.' };
  if (choice !== '' && TEE_CHOICES_.indexOf(choice) < 0) return { ok: false, error: 'Pick Early, Late, Either or Can\'t play.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var night = teeNight_(ss);
  if (!night) return { ok: false, error: 'No league night coming up.' };
  if (teeLeague_(ss).indexOf(name) < 0) return { ok: false, error: name + ' is not a league member.' };
  var state = teeState_(night);
  if (state === 'confirmed') return { ok: false, code: 'locked', error: 'Groups are set. Ask Ty if you need to change.' };
  if (!user.admin && state !== 'open') return { ok: false, code: 'locked', error: state === 'before' ? 'Sign-up opens ' + Utilities.formatDate(night.opens, ss.getSpreadsheetTimeZone(), "EEE 'at' h:mm a") + '.' : 'Sign-up is closed. Ask Ty if you need to change.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = teeSheet_(ss), r = teeRows_(ss, night.key)[name];
    var vals = [[night.key, name, choice, new Date(), user.name === name ? 'Player' : user.name]];
    if (r) sh.getRange(r.row, 1, 1, 5).setValues(vals);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 5).setValues(vals);
  } finally { lock.releaseLock(); }
  return { ok: true, night: night.key, name: name, choice: choice };
}

/** App (admin): confirm the groups. Locks every pick for that night. */
function apiTeeConfirm_(req) {
  var user = apiUser_(req.token);
  if (!user || !user.admin) return { ok: false, code: 'denied', error: 'Only Ty can set the groups.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var night = teeNight_(ss);
  if (!night || night.key !== String(req.night)) return { ok: false, error: 'That night is no longer the next league night. Refresh and try again.' };
  var league = teeLeague_(ss);
  var early = (req.early || []).map(String).filter(function (n) { return league.indexOf(n) >= 0; });
  var late = (req.late || []).map(String).filter(function (n) { return league.indexOf(n) >= 0 && early.indexOf(n) < 0; });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = teeSheet_(ss), rows = teeRows_(ss, night.key);
    league.forEach(function (n) {
      var g = early.indexOf(n) >= 0 ? 'Early' : late.indexOf(n) >= 0 ? 'Late' : '';
      var r = rows[n];
      if (r) sh.getRange(r.row, 6).setValue(g);
      else if (g) sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([[night.key, n, '', new Date(), user.name, g]]);
    });
    apiProps_().deleteProperty('teeDraft:' + night.key);
    apiProps_().setProperty('teeConf:' + night.key, JSON.stringify({
      early: early, late: late, by: user.name,
      at: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "EEE h:mm a")
    }));
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/** App (admin): undo the confirmation so picks can change again. */
function apiTeeReopen_(req) {
  var user = apiUser_(req.token);
  if (!user || !user.admin) return { ok: false, code: 'denied', error: 'Only Ty can reopen sign-up.' };
  apiProps_().deleteProperty('teeConf:' + String(req.night || ''));
  return { ok: true };
}

/** App (admin): save Ty's in-progress groups (before confirming) so moves survive a refresh. clear: true goes back to the suggestion. */
function apiTeeDraft_(req) {
  var user = apiUser_(req.token);
  if (!user || !user.admin) return { ok: false, code: 'denied', error: 'Only Ty can arrange the groups.' };
  var key = 'teeDraft:' + String(req.night || '');
  if (req.clear) { apiProps_().deleteProperty(key); return { ok: true }; }
  apiProps_().setProperty(key, JSON.stringify({ early: (req.early || []).map(String), late: (req.late || []).map(String) }));
  return { ok: true };
}
