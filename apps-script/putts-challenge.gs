// ===================================================================
// Weekly putting challenge (added Nov 13, 2026). Low and High putts alternate every league night:
// Thu Nov 12, 2026 was Low (Clint and Sunderman tied at 13), so Nov 19 is High, and so on. Only nights on the
// Season tab that aren't "Off" count, so Thanksgiving / Christmas weeks don't flip it. Tiebreaker and playoff nights count.
// Season tab: A Week, B Date, C Course, D Nine, E Night type, F Notes.
// Feed: getBoardData (perf.gs) adds d.putts = { mode: 'Low'|'High', night: 'Thu Nov 19', tonight: true|false }.
//   tonight = Tonight's date (B1) is that league night, so the Field Leaderboard highlights the winner(s).
//   Otherwise it describes the next league night on or after today.
// To flip the whole sequence, change PUTT_ANCHOR_MODE_.
// ===================================================================
var PUTT_ANCHOR_ = '2026-11-12', PUTT_ANCHOR_MODE_ = 'Low';

function puttsChallenge_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  function key(d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  var nights = ss.getSheetByName('Season').getRange('B2:E80').getValues()
    .map(function (r) { if (!(r[0] instanceof Date) && r[0]) { var p = new Date(String(r[0])); if (!isNaN(p)) r[0] = p; } return r; })
    .filter(function (r) { return r[0] instanceof Date && String(r[3]).trim() && String(r[3]).trim() !== 'Off'; })
    .map(function (r) { return { key: key(r[0]), date: r[0] }; })
    .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  var anchor = -1;
  nights.forEach(function (n, i) { if (n.key === PUTT_ANCHOR_) anchor = i; });
  if (anchor < 0) return null;
  function modeAt(i) { return (Math.abs(i - anchor) % 2 === 0) ? PUTT_ANCHOR_MODE_ : (PUTT_ANCHOR_MODE_ === 'Low' ? 'High' : 'Low'); }
  var t = ss.getSheetByName('Tonight').getRange('B1').getValue();
  var tk = t instanceof Date ? key(t) : '', today = key(new Date());
  var idx = -1, tonight = false;
  nights.forEach(function (n, i) { if (n.key === tk) idx = i; });
  // Tonight's round counts when it's a league night that is today or still on the board from the last league night
  // (the board keeps showing it until Ty clears it), and no later league night has started yet.
  if (idx >= 0 && !(idx + 1 < nights.length && nights[idx + 1].key <= today)) tonight = true;
  else { idx = -1; nights.forEach(function (n, i) { if (idx < 0 && n.key >= today) idx = i; }); }
  if (idx < 0) return null;
  var out = { mode: modeAt(idx), night: Utilities.formatDate(nights[idx].date, tz, 'EEE MMM d'), tonight: tonight };
  try { puttsPot_(ss, tz, key, nights, idx, tonight, modeAt, out); } catch (x) { console.error(x); }
  return out;
}

// ===================================================================
// Putting pool (added Nov 23, 2026). Everyone who plays a league night (members and guests) puts in $1.
// Single winner takes the pot; a tie pushes the whole pot to the next league night.
// Worked out from the Round Log (Round type League, Putts column AE), starting with $0 going into Nov 12:
//   Nov 12 Low, 7 players, Clint/Sunderman tie at 13 -> $7 pushes; Nov 19 High, 8 players, Schertzer/Clint tie at 18 -> $15 pushes.
// Adds to the feed's d.putts: carry (pot coming into the night), players (on Tonight, when tonight), pot (carry + players),
//   next ('December 3rd' = next league night, for "pushes to"), result (once the night is in the Round Log:
//   { tie: true } or { winners: [names] }), lastWin ({ night, names, amt } = most recent paid-out night).
// If the pool ever needs correcting by hand, change PUTT_POT_START_ / PUTT_POT_START_AMT_ (pot going into that night).
// ===================================================================
var PUTT_POT_START_ = '2026-11-12', PUTT_POT_START_AMT_ = 0;

function puttsPot_(ss, tz, key, nights, idx, tonight, modeAt, out) {
  var start = -1;
  nights.forEach(function (n, i) { if (n.key === PUTT_POT_START_) start = i; });
  if (start < 0 || idx < start) return;
  // League rounds by night: player -> putts.
  var log = ss.getSheetByName('Round Log'), last = log.getLastRow(), byNight = {};
  if (last >= 2) {
    var a = log.getRange(2, 1, last - 1, 3).getValues(), p = log.getRange(2, 31, last - 1, 1).getValues();
    a.forEach(function (r, i) {
      if (String(r[2]).trim() !== 'League' || !String(r[1]).trim()) return;
      var d = r[0] instanceof Date ? r[0] : (r[0] ? new Date(String(r[0])) : null);
      if (!d || isNaN(d)) return;
      var k = key(d);
      (byNight[k] = byNight[k] || []).push({ name: String(r[1]).trim(), putts: p[i][0] === '' ? null : Number(p[i][0]) });
    });
  }
  function judge(rows, mode) {
    var have = rows.filter(function (r) { return r.putts !== null && !isNaN(r.putts); });
    if (!have.length) return null;
    var best = have.reduce(function (m, r) { return m === null ? r.putts : mode === 'High' ? Math.max(m, r.putts) : Math.min(m, r.putts); }, null);
    var w = have.filter(function (r) { return r.putts === best; }).map(function (r) { return r.name; });
    return w.length > 1 ? { tie: true, winners: w, putts: best } : { winners: w, putts: best };
  }
  var carry = PUTT_POT_START_AMT_, lastWin = null;
  for (var i = start; i < idx; i++) {
    var rows = byNight[nights[i].key];
    if (!rows || !rows.length) continue;           // night not played / not posted: nothing goes in, pot carries
    var pot = carry + rows.length, res = judge(rows, modeAt(i));
    if (res && !res.tie) { lastWin = { night: Utilities.formatDate(nights[i].date, tz, 'EEE MMM d'), names: res.winners, amt: pot }; carry = 0; }
    else carry = pot;
  }
  out.carry = carry;
  out.lastWin = lastWin;
  if (idx + 1 < nights.length) {
    var nd = nights[idx + 1].date, dn = Number(Utilities.formatDate(nd, tz, 'd'));
    var suf = (dn % 100 >= 11 && dn % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[dn % 10] || 'th';
    out.next = Utilities.formatDate(nd, tz, 'MMMM ') + dn + suf;
  }
  if (!tonight) return;
  // Players on Tonight: column A from row 10 down to the first blank.
  var names = ss.getSheetByName('Tonight').getRange('A10:A40').getValues(), n = 0;
  for (var j = 0; j < names.length && String(names[j][0]).trim(); j++) n++;
  out.players = n;
  out.pot = carry + n;
  var posted = byNight[nights[idx].key];
  if (posted && posted.length) {
    var r = judge(posted, out.mode);
    if (r) out.result = r;
  }
}
