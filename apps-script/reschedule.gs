// ===================================================================
// Self-serve reschedule (added Nov 24, 2026, Ty).
// A player taps "Reschedule" on a match that hasn't been played (until that night's sign-up closes).
// 1) The opponent left without a match gets a new one that night:
//    a) another player left without a match that night whom they never meet -> Regular match together;
//    b) else a one-way vs someone playing that night they never meet (fewest one-ways against them that night first);
//    c) else a one-way vs someone whose real match with them is already played; d) else anyone playing.
// 2) The player's match becomes a one-way makeup on the earliest later night both are playing
//    (skipping nights where the player already has a makeup, unless it's the only one);
//    else a one-way on the player's next night vs someone they never meet; else "TBD" and Ty is alerted.
// Ty is always notified (push + News). Every change is written to the "Reschedule Log" tab.
// Also adds makeup lines and reschedule info to the Schedule feed (scheduleX_).
// ===================================================================
var RS_LOG_ = 'Reschedule Log';
var RS_SEASON_ = null;   // per-execution copy of Season A2:J60

function rsKey_(d, tz) { return d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : ''; }
function rsDate_(key) { return new Date(key + 'T12:00:00'); }

/** Season nights: [{key, date, type}] (regular weeks only when regular=true). */
function rsNights_(ss, tz) {
  return ss.getSheetByName('Season').getRange('A2:E60').getValues()
    .filter(function (r) { return r[1] instanceof Date; })
    .map(function (r) { return { key: rsKey_(r[1], tz), date: r[1], type: String(r[4] || '') }; });
}

/** Sign-up close for a night (same rule as ntApply_, without touching the globals). */
function rsCloses_(ss, key, tz) {
  if (!RS_SEASON_) {
    var rg = ss.getSheetByName('Season').getRange('A2:J60');
    RS_SEASON_ = { rows: rg.getValues(), disp: rg.getDisplayValues() };
  }
  var rows = RS_SEASON_.rows, disp = RS_SEASON_.disp;
  var early = { h: 18, m: 0 }, close = null, date = null;
  for (var i = 0; i < rows.length; i++) {
    if (!(rows[i][1] instanceof Date) || rsKey_(rows[i][1], tz) !== key) continue;
    date = rows[i][1];
    early = ntParse_(disp[i][6]) || early;
    close = ntParse_(disp[i][8]);
    break;
  }
  if (!date) return null;
  if (!close) close = { h: Math.max(0, early.h - 3), m: early.m };
  var off = Utilities.formatDate(date, tz, 'Z');
  return new Date(key + 'T' + ('0' + close.h).slice(-2) + ':' + ('0' + close.m).slice(-2) + ':00' + off.slice(0, 3) + ':' + off.slice(3));
}

/** Matches rows as objects (row = sheet row). */
function rsRows_(ss, tz) {
  var sh = ss.getSheetByName('Matches');
  var n = Math.max(0, sh.getLastRow() - 1);
  if (!n) return [];
  return sh.getRange(2, 1, n, 6).getValues().map(function (r, i) {
    return {
      row: i + 2, date: rsKey_(r[0], tz), type: String(r[1] || ''), a: String(r[2] || ''), b: String(r[3] || ''),
      e: r[4], f: r[5], on: rsKey_(r[4], tz) || rsKey_(r[5], tz), tbd: r[4] !== '' && !(r[4] instanceof Date)
    };
  }).filter(function (m) { return m.date && m.a && m.b; });
}

function rsMoved_(m) { return !!(m.on || m.tbd); }

/** Who plays on a night: both sides of rows on that date that weren't moved, plus the player of makeups played that night. */
function rsPlaying_(rows, key, skip) {
  var s = {};
  rows.forEach(function (m) {
    if (skip && skip.indexOf(m) >= 0) return;
    if (m.date === key && !rsMoved_(m)) { s[m.a] = true; s[m.b] = true; }
    if (m.on === key) s[m.a] = true;
  });
  return s;
}

function rsMet_(rows, p, q, skip) {
  return rows.some(function (m) { return m !== skip && ((m.a === p && m.b === q) || (m.a === q && m.b === p)); });
}

/** True if every meeting of p and q is dated before key (already played). */
function rsMetBefore_(rows, p, q, key) {
  return rows.every(function (m) { return !((m.a === p && m.b === q) || (m.a === q && m.b === p)) || (m.on || m.date) < key; });
}

function rsFmt_(key, tz) { return Utilities.formatDate(rsDate_(key), tz, 'EEE MMM d'); }
function rsShort_(key, tz) { return Utilities.formatDate(rsDate_(key), tz, 'MMM d'); }

/**
 * Works out the reschedule. Returns {ok, text, changes:[...], alertTy, ...}; apply=true writes it.
 * req: {night, a, b, player}
 */
function rsPlan_(ss, req, user, apply) {
  var tz = ss.getSpreadsheetTimeZone();
  var key = String(req.night || ''), P = String(req.player || user.name);
  if (P !== user.name && !user.admin) throw new Error('You can only reschedule your own matches.');
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var nights = rsNights_(ss, tz);
  var night = nights.filter(function (n) { return n.key === key; })[0];
  if (!night || night.type !== 'Regular') throw new Error('Only regular-season nights can be rescheduled.');
  var closes = rsCloses_(ss, key, tz);
  if (key < today || (closes && new Date() >= closes)) throw new Error('Sign-up for that night has closed, so it can\'t be rescheduled now.');
  var rows = rsRows_(ss, tz);
  var row = rows.filter(function (m) {
    var mine = m.a === String(req.a) && m.b === String(req.b);
    return mine && ((m.date === key && !rsMoved_(m)) || m.on === key);
  })[0];
  if (!row) throw new Error('That match wasn\'t found. Pull down to refresh and try again.');
  var makeupRow = row.on === key;                 // a makeup being played that night
  var O = row.a === P ? row.b : row.b === P ? row.a : '';
  if (!O) throw new Error('That isn\'t ' + P + '\'s match.');
  if (row.type === 'One-way' && row.a !== P) throw new Error('That one-way is ' + row.a + '\'s match, not yours.');
  var regular = row.type !== 'One-way' && !makeupRow;
  var later = nights.filter(function (n) { return n.type === 'Regular' && n.key > key && n.key >= today; });

  // 2) P's makeup: earliest later night both play.
  var shared = later.filter(function (n) { var s = rsPlaying_(rows, n.key, [row]); return s[P] && s[O]; });
  var free = shared.filter(function (n) { return !rows.some(function (m) { return m !== row && m.a === P && m.on === n.key; }); });
  var to = free[0] || shared[0], vs = O, how = 'same';
  if (!to) {
    how = 'new';
    for (var i = 0; i < later.length && !to; i++) {
      var s = rsPlaying_(rows, later[i].key, [row]);
      if (!s[P]) continue;
      var ys = Object.keys(s).filter(function (y) { return y !== P && y !== O && !rsMet_(rows, P, y, row); }).sort();
      if (ys.length) { to = later[i]; vs = ys[0]; }
    }
  }
  if (!to) how = 'tbd';

  // 1) O's new match on the night (only when a regular match is broken up).
  var fix = null;
  if (regular) {
    var playing = rsPlaying_(rows, key, [row]);
    delete playing[P];
    var takenOn = {};   // O's other opponents that night
    rows.forEach(function (m) { if (m !== row && m.date === key && !rsMoved_(m) && (m.a === O || m.b === O)) takenOn[m.a === O ? m.b : m.a] = true; });
    // a) another player left without a match (B of a row moved off this night, now holding a one-way on it)
    var orphanRow = null;
    rows.forEach(function (m) {
      if (orphanRow || m === row || m.date !== key || !rsMoved_(m) || m.b === O || m.b === P) return;
      var q = m.b;
      var own = rows.filter(function (x) { return x.date === key && !rsMoved_(x) && x.type === 'One-way' && x.a === q; })[0];
      if (own && !rsMet_(rows, q, O, own) && !takenOn[q]) orphanRow = own;
    });
    if (orphanRow) fix = { kind: 'pair', row: orphanRow, q: orphanRow.a, oldX: orphanRow.b };
    else {
      var cands = Object.keys(playing).filter(function (x) { return x !== O && !takenOn[x]; });
      var load = {}, season = {};
      rows.forEach(function (m) {
        if (m.type !== 'One-way') return;
        season[m.b] = (season[m.b] || 0) + 1;
        if (m.date === key && !rsMoved_(m)) load[m.b] = (load[m.b] || 0) + 1;
      });
      function rank(list) {
        return list.sort(function (x, y) { return (load[x] || 0) - (load[y] || 0) || (season[x] || 0) - (season[y] || 0) || (x < y ? -1 : 1); })[0];
      }
      var X = rank(cands.filter(function (x) { return !rsMet_(rows, O, x, row); })), tier = 'new';
      if (!X) { X = rank(cands.filter(function (x) { return rsMetBefore_(rows, O, x, key); })); tier = 'played'; }
      if (!X) { X = rank(cands.slice()); tier = 'repeat'; }
      fix = X ? { kind: 'oneway', x: X, tier: tier } : { kind: 'none' };
    }
  }

  // Text for the player and the alert.
  var when = rsFmt_(key, tz);
  var lines = [];
  if (how === 'same') lines.push(P + ' vs ' + O + ' (' + when + ') moves to ' + rsFmt_(to.key, tz) + ' as a one-way.');
  else if (how === 'new') lines.push(P + '\'s ' + when + ' match vs ' + O + ' can\'t be made up (no night left they both play), so ' + P + ' plays ' + vs + ' (one-way) on ' + rsFmt_(to.key, tz) + '.');
  else lines.push(P + '\'s ' + when + ' match vs ' + O + ' has no makeup night left. Ty will sort it out.');
  if (fix && fix.kind === 'pair') lines.push(O + ' plays ' + fix.q + ' (regular match) on ' + when + ' instead.');
  else if (fix && fix.kind === 'oneway') lines.push(O + ' plays ' + fix.x + ' (one-way) on ' + when + ' instead.');
  else if (fix && fix.kind === 'none') lines.push('Nobody else is playing on ' + when + ', so ' + O + ' has no match that night. Ty will sort it out.');
  var text = lines.join('\n');
  var alertTy = how === 'tbd' || (fix && fix.kind === 'none');
  if (!apply) return { ok: true, text: text, alertTy: alertTy };

  // Write.
  var sh = ss.getSheetByName('Matches');
  var toDate = to ? rsDate_(to.key) : 'TBD';
  sh.getRange(row.row, 2, 1, 5).setValues([['One-way', P, vs, toDate, toDate]]);
  var newRow = null;
  if (fix && fix.kind === 'pair') {
    sh.getRange(fix.row.row, 2, 1, 3).setValues([['Regular', fix.q, O]]);
  } else if (fix && fix.kind === 'oneway') {
    var last = 0;
    rows.forEach(function (m) { if (m.date === key && m.row > last) last = m.row; });
    sh.insertRowAfter(last);
    sh.getRange(last + 1, 1, 1, 6).setValues([[rsDate_(key), 'One-way', O, fix.x, '', '']]);
    newRow = last + 1;
  }
  var log = ss.getSheetByName(RS_LOG_);
  if (!log) {
    log = ss.insertSheet(RS_LOG_);
    log.getRange(1, 1, 1, 7).setValues([['Time', 'By', 'Night', 'Player', 'Opponent', 'Moved to', 'What happened']]).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  log.appendRow([new Date(), user.name, rsDate_(key), P, O, to ? rsDate_(to.key) : 'TBD', text]);

  // Fresh feeds.
  try {
    var cache = CacheService.getScriptCache(), rl = ss.getSheetByName('Round Log').getLastRow();
    cache.removeAll(['web|schedule|' + rl, 'web|schedule2|' + rl, 'nightly3|' + rl + '|' + key].concat(to ? ['nightly3|' + rl + '|' + to.key] : []));
  } catch (e) {}
  boardBust_();

  // Alerts: Ty always; the players involved.
  var names = [P, O];
  if (vs !== O) names.push(vs);
  if (fix && fix.kind === 'oneway') names.push(fix.x);
  if (fix && fix.kind === 'pair') names.push(fix.q);
  API_ADMINS_.forEach(function (a) { if (names.indexOf(a) < 0) names.push(a); });
  try { notify_((alertTy ? 'Needs Ty: ' : '') + P + ' rescheduled a match', text, names); } catch (e) { console.error(e); }
  return { ok: true, text: text, alertTy: alertTy };
}

function apiReschedule_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, error: 'Please sign in again.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return rsAll_(ss, req, user, req.apply === true); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  finally { lock.releaseLock(); }
}

/**
 * Reschedules every match the player has on that night (a regular match plus any makeup played then),
 * one after another, so one tap moves the whole night. Dry runs show each step as planned on today's sheet.
 */
function rsAll_(ss, req, user, apply) {
  var tz = ss.getSpreadsheetTimeZone(), key = String(req.night || ''), P = String(req.player || user.name);
  var rows = rsRows_(ss, tz);
  var list = rows.filter(function (m) {
    return (m.date === key && !rsMoved_(m) && (m.a === P || (m.b === P && m.type !== 'One-way'))) || (m.on === key && m.a === P);
  }).map(function (m) { return { a: m.a, b: m.b }; });
  if (!list.length) throw new Error('No match found for ' + P + ' that night. Pull down to refresh and try again.');
  var texts = [], alertTy = false;
  list.forEach(function (x) {
    var r = rsPlan_(ss, { night: key, a: x.a, b: x.b, player: P }, user, apply);
    texts.push(r.text);
    if (r.alertTy) alertTy = true;
  });
  return { ok: true, text: texts.join('\n\n'), alertTy: alertTy, count: list.length };
}

/** schedule_ plus, per week: the match that can be rescheduled (rs) and makeups played that night (extras). */
function scheduleX_(ss) {
  var players = schedule_(ss);
  var tz = ss.getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var nights = rsNights_(ss, tz), byLabel = {};
  nights.forEach(function (n) { byLabel[Utilities.formatDate(n.date, tz, 'MMM d')] = n; });
  var rows = rsRows_(ss, tz);
  var openKey = {};
  nights.forEach(function (n) {
    if (n.type !== 'Regular' || n.key < today) return;
    var c = rsCloses_(ss, n.key, tz);
    openKey[n.key] = !c || new Date() < c;
  });
  players.forEach(function (p) {
    p.weeks.forEach(function (w) {
      var n = byLabel[w.date];
      if (!n) return;
      var mine = rows.filter(function (m) { return m.date === n.key && !rsMoved_(m) && (m.a === p.name || (m.b === p.name && m.type !== 'One-way')); })[0];
      if (mine && openKey[n.key]) w.rs = { night: n.key, a: mine.a, b: mine.b };
      var ex = rows.filter(function (m) { return m.on === n.key && m.a === p.name; });
      if (ex.length) w.extras = ex.map(function (m) {
        return { opp: m.b, from: rsShort_(m.date, tz), rs: openKey[n.key] ? { night: n.key, a: m.a, b: m.b } : null };
      });
    });
  });
  return players;
}
