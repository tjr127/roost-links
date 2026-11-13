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
  return { mode: modeAt(idx), night: Utilities.formatDate(nights[idx].date, tz, 'EEE MMM d'), tonight: tonight };
}
