// ===================================================================
// Season putt standings (added Nov 14, 2026). Standings tab > Putts.
// Ty's rules: total putts per league member over their FIRST 9 league rounds of the season (date order).
// Fewest total putts wins $60, most wins $60, ties split. Tiebreaker and playoff rounds come last in date order,
// so they only count for a player who is still short of 9 after the regular season.
// Only rounds with putts count: Nov 5 (week 1) has none anywhere, so counting starts Nov 12 (Ty, Nov 14).
// A makeup night where a player covers two matches is still one Round Log row, so one round.
// Round Log: A Date, B Player, C Round type, D Course, E Nine, F Holes, ... AE Putts (index 30).
// Season: B Date, E Night type ("Off" weeks skipped).
// Feed: getBoardData (perf.gs) adds d.puttStand = puttStandings_() (cached with the board).
//   { cap, pay, nightsLeft, last: 'Thu Nov 12', players: [{ name, rounds: [{ d: 'Nov 12', c: course, p: 16 }], extra }] }
//   rounds = the counted rounds only (first cap); extra = later league rounds that don't count.
// The page (puttstand.js) works out totals, averages, pace, leaders, trends and the even comparison.
// ===================================================================
var PUTT_SEASON_CAP_ = 9, PUTT_SEASON_PAY_ = 60;

function puttStandings_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  function asDate(v) { if (v instanceof Date) return v; if (!v) return null; var p = new Date(String(v)); return isNaN(p) ? null : p; }
  function key(d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }

  var members = ss.getSheetByName('Players').getRange('A2:C60').getValues()
    .filter(function (r) { return String(r[0]).trim() && String(r[1]).trim() === 'League' && (r[2] === true || String(r[2]).toUpperCase() === 'TRUE'); })
    .map(function (r) { return String(r[0]).trim(); });

  var log = ss.getSheetByName('Round Log'), n = log.getLastRow() - 1;
  var vals = n > 0 ? log.getRange(2, 1, n, 31).getValues() : [];
  var by = {}, last = '';
  vals.forEach(function (r) {
    if (String(r[2]).trim() !== 'League') return;
    var d = asDate(r[0]), name = String(r[1]).trim(), p = r[30];
    if (!d || !name || p === '' || p === null || isNaN(Number(p))) return;
    var k = key(d);
    if (k > last) last = k;
    (by[name] = by[name] || []).push({ k: k, d: Utilities.formatDate(d, tz, 'MMM d'), c: String(r[3] || ''), p: Number(p) });
  });

  var nights = ss.getSheetByName('Season').getRange('B2:E80').getValues()
    .map(function (r) { return { d: asDate(r[0]), t: String(r[3]).trim() }; })
    .filter(function (x) { return x.d && x.t && x.t !== 'Off'; })
    .map(function (x) { return key(x.d); });
  var nightsLeft = nights.filter(function (k) { return k > last; }).length;

  var players = members.map(function (name) {
    var rs = (by[name] || []).sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
    return {
      name: name,
      rounds: rs.slice(0, PUTT_SEASON_CAP_).map(function (x) { return { d: x.d, c: x.c, p: x.p }; }),
      extra: Math.max(0, rs.length - PUTT_SEASON_CAP_)
    };
  });
  var lastLbl = last ? Utilities.formatDate(asDate(last + 'T12:00:00'), tz, 'EEE MMM d') : '';
  return { cap: PUTT_SEASON_CAP_, pay: PUTT_SEASON_PAY_, nightsLeft: nightsLeft, last: lastLbl, players: players };
}
