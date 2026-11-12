
// ===================================================================
// Weekly tee choice and hole yardages (added Nov 12, 2026).
// Casual rounds: players pick Tips, Long, Medium or Short on Scores > Handicaps until the first score goes in
// (Ty can still change after that). League nights: picked with the tee time on the Schedule tab (league-tees.gs);
// the Handicaps card is read-only. Picks live on the "Tee Choices" tab (one row per night + player);
// Tonight column B reads them, and a player with no pick plays their tees from the Players tab.
// Hole-by-hole yardages for every tee live on the "Hole Yards" tab.
// ===================================================================
var TP_SHEET_ = 'Tee Choices';
var TP_HEAD_ = ['Night', 'Player', 'Tees', 'Updated', 'Set by'];
var TP_TEES_ = ['Tips', 'Long', 'Medium', 'Short'];
var TP_LOCK_HOUR_ = 15;  // 3:00 PM on a league night

function tpSheet_(ss) {
  var sh = ss.getSheetByName(TP_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(TP_SHEET_);
    sh.getRange(1, 1, 1, TP_HEAD_.length).setValues([TP_HEAD_]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * The night tee picks are for: Tonight's date if it is today (league or casual),
 * otherwise the next league night on the Season tab (skipping "Off" weeks).
 */
function tpNight_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var top = ss.getSheetByName('Tonight').getRange('B1:B7').getValues();
  var tDate = top[0][0], tCourse = String(top[1][0] || ''), tNine = String(top[2][0] || '');
  var tKey = tDate instanceof Date ? Utilities.formatDate(tDate, tz, 'yyyy-MM-dd') : '';
  var night = null;
  if (tKey && tKey === today) {
    night = { key: tKey, date: tDate, course: tCourse, nine: tNine, casual: String(top[6][0]) === 'Casual' };
  } else {
    var rows = ss.getSheetByName('Season').getRange('A2:E60').getValues();
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i][1], type = String(rows[i][4] || '');
      if (!(d instanceof Date) || type === 'Off' || type === '') continue;
      var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      if (key < today) continue;
      night = { key: key, date: d, course: String(rows[i][2] || ''), nine: String(rows[i][3] || ''), casual: false };
      break;
    }
  }
  if (!night) return null;
  if (!night.nine && tCourse && tCourse === night.course) night.nine = tNine;
  var off = Utilities.formatDate(night.date, tz, 'Z');  // e.g. -0500
  night.lockAt = new Date(night.key + 'T' + ('0' + TP_LOCK_HOUR_).slice(-2) + ':00:00' + off.slice(0, 3) + ':' + off.slice(3));
  night.teedOff = night.casual ? tpTeedOff_(ss) : false;
  night.locked = night.casual ? night.teedOff : true;   // league tees are picked on the Schedule tab (tee times card)
  night.label = Utilities.formatDate(night.date, tz, 'EEEE, MMM d');
  night.lockText = Utilities.formatDate(night.lockAt, tz, "EEEE 'at' h:mm a");
  return night;
}

/** Hole yardages and tee colors for one course: { Tips: { color, yards: [18] }, ... } */
function tpHoleYards_(ss, course) {
  var sh = ss.getSheetByName('Hole Yards');
  if (!sh || !course) return {};
  var last = sh.getLastRow();
  if (last < 2) return {};
  var out = {};
  sh.getRange(2, 1, last - 1, 21).getValues().forEach(function (r) {
    if (String(r[0]) !== String(course) || !r[1]) return;
    out[String(r[1])] = { color: String(r[2] || ''), yards: r.slice(3, 21).map(function (v) { return v === '' ? '' : Number(v); }) };
  });
  return out;
}

function tpRows_(ss, nightKey) {
  var sh = tpSheet_(ss), last = sh.getLastRow();
  var vals = last > 1 ? sh.getRange(2, 1, last - 1, TP_HEAD_.length).getValues() : [];
  var out = {};
  vals.forEach(function (r, i) { if (String(r[0]) === nightKey && r[1]) out[String(r[1])] = { row: i + 2, tees: String(r[2] || ''), by: String(r[4] || '') }; });
  return out;
}

/** Any score on Tonight yet (first group has teed off)? */
function tpTeedOff_(ss) {
  return ss.getSheetByName('Tonight').getRange('E10:V25').getValues().some(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
}

/** Everything the Handicaps card needs to show and change each player's tees for the coming night. */
function teePick_(ss) {
  return tpBuild_(ss, tpNight_(ss));
}

/** Tees for the next league night (Season tab), for the tee times card on the Schedule tab. */
function tpLeague_(ss) {
  var n = teeNight_(ss);
  if (!n) return null;
  var tz = ss.getSpreadsheetTimeZone(), nine = '';
  ss.getSheetByName('Season').getRange('A2:E60').getValues().forEach(function (r) {
    if (r[1] instanceof Date && Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') === n.key) nine = String(r[3] || '');
  });
  var top = ss.getSheetByName('Tonight').getRange('B2:B3').getDisplayValues();
  if (!nine && top[0][0] === n.course) nine = top[1][0];
  return tpBuild_(ss, { key: n.key, date: n.date, course: n.course, nine: nine, casual: false, locked: false,
    label: n.label, lockText: Utilities.formatDate(n.closes, tz, "EEEE 'at' h:mm a"), teedOff: false });
}

function tpBuild_(ss, night) {
  if (!night) return null;
  var cs = ss.getSheetByName('Courses');
  var head = cs.getRange(1, 1, 1, cs.getLastColumn()).getDisplayValues()[0];
  var names = cs.getRange(2, 1, Math.max(1, cs.getLastRow() - 1), 1).getDisplayValues().map(function (r) { return r[0]; });
  var ci = names.indexOf(night.course);
  var crow = ci >= 0 ? cs.getRange(ci + 2, 1, 1, head.length).getValues()[0] : null;
  var holes = night.nine === 'Front' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : night.nine === 'Back' ? [10, 11, 12, 13, 14, 15, 16, 17, 18]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  var par = 0;
  if (crow) holes.forEach(function (h) { par += Number(crow[h]) || 0; });  // Par 1 is column B (index 1)
  function val(label) { var i = head.indexOf(label); return (crow && i >= 0 && crow[i] !== '') ? Number(crow[i]) : null; }
  var hy = tpHoleYards_(ss, night.course);
  var tees = TP_TEES_.map(function (t) {
    var h = hy[t], y = '';
    if (h) { y = 0; holes.forEach(function (n) { y += Number(h.yards[n - 1]) || 0; }); }
    return { tee: t, color: h ? h.color : '', yards: y, rating: val(t + ' rating'), slope: val(t + ' slope') };
  });
  var picks = tpRows_(ss, night.key);
  var players = {};
  ss.getSheetByName('Players').getRange('A2:I40').getDisplayValues().forEach(function (p) {
    if (!p[0] || p[2] !== 'TRUE') return;
    var idx = p[8] === '' ? null : Number(p[8]);
    var chs = {};
    tees.forEach(function (t) {
      chs[t.tee] = (idx === null || t.rating === null || t.slope === null || !crow) ? '' :
        rnd_(idx * (t.slope / 113) * (holes.length / 18) + (t.rating * holes.length / 18 - par));
    });
    var pk = picks[p[0]];
    players[p[0]] = { def: p[3], pick: pk && pk.tees ? pk.tees : '', by: pk ? pk.by : '', chs: chs };
  });
  return {
    night: night.key, label: night.label, course: night.course, nine: night.nine, holes: holes.length,
    casual: night.casual, locked: night.locked, teedOff: !!night.teedOff, lockText: night.lockText,
    tees: tees.map(function (t) { return { tee: t.tee, color: t.color, yards: t.yards, ok: t.rating !== null && t.slope !== null, rating: t.rating, slope: t.slope }; }),
    par: par, exp: ss.getSheetByName('Settings').getRange('B43:B44').getValues().map(function (r) { return Number(r[0]) || 0; }),
    tbl: (function () { var o = {}; ss.getSheetByName('Settings').getRange('A20:C37').getValues().forEach(function (r) { if (r[0] !== '') o[Number(r[0])] = [Number(r[1]) || 0, Number(r[2]) || 0]; }); return o; })(),
    maxN: Number(ss.getSheetByName('Settings').getRange('B39').getValue()) || 20,
    players: players
  };
}

/** App: set (or clear, tees '') a player's tees for the coming night. Admins can set anyone's, even after the lock. */
function apiTeePick_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  var name = String(req.name || ''), tees = String(req.tees || '');
  if (name !== user.name && !user.admin) return { ok: false, code: 'denied', error: 'You can only pick your own tees.' };
  if (tees !== '' && TP_TEES_.indexOf(tees) < 0) return { ok: false, error: 'Pick Tips, Long, Medium or Short.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var night = tpNight_(ss);
  if (!night) return { ok: false, error: 'No night coming up.' };
  if (req.night && String(req.night) !== night.key) return { ok: false, code: 'stale', error: 'The night changed. Refresh and try again.' };
  var known = ss.getSheetByName('Players').getRange('A2:C40').getDisplayValues().some(function (r) { return r[0] === name && r[2] === 'TRUE'; });
  if (!known) return { ok: false, error: name + ' is not an active player.' };
  if (!night.casual) return { ok: false, code: 'league', error: 'League night: pick your tees with your tee time on the Schedule tab.' };
  if (night.teedOff && !user.admin) return { ok: false, code: 'locked', error: 'Somebody has teed off, so tees are locked. Ask Ty if you need to change.' };
  tpWrite_(ss, night.key, name, tees, user.name === name ? 'Player' : user.name);
  return { ok: true, night: night.key, name: name, tees: tees };
}

/** Save one player's tees for a night (one row per night + player on Tee Choices). */
function tpWrite_(ss, nightKey, name, tees, by) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = tpSheet_(ss), r = tpRows_(ss, nightKey)[name];
    var vals = [[nightKey, name, tees, new Date(), by]];
    if (r) sh.getRange(r.row, 1, 1, 5).setValues(vals);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 5).setValues(vals);
  } finally { lock.releaseLock(); }
}
