// ===================================================================
// Nightly schedule (added Nov 22, 2026): Schedule tab > Nightly view.
// GET ?api=nightly                  -> the next league night (or the last one once the season is over)
// GET ?api=nightly&night=yyyy-MM-dd -> that night
// Returns { nights: [{ night, label }], night, label, course, nine, holes, matches: [{ a, b }], byes: [names] }
// where a / b = { name, index, tee, ch }. Index = the player's current index (Players I); tee = his Tee Choices
// pick for that night, else his Players-tab tees; ch = course handicap for that night's course and nine at that
// tee (same formula as tpBuild_ / Tonight column D). Pairs come from teePairs_ (regular, one-way and makeups).
// Wired in apiGet_: else if (p.api === 'nightly') out = nightly_(p.night);
// Cached 5 minutes per night.
// ===================================================================
function nightly_(want) {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var cache = CacheService.getScriptCache();
  var ckey = 'nightly|' + (want || today);
  var hit = cache.get(ckey);
  if (hit) return JSON.parse(hit);

  var nights = [];
  ss.getSheetByName('Season').getRange('A2:E60').getValues().forEach(function (r) {
    var d = r[1], type = String(r[4] || '');
    if (!(d instanceof Date) || type === 'Off' || type === '') return;
    nights.push({ night: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), date: d, course: String(r[2] || ''), nine: String(r[3] || ''),
      label: Utilities.formatDate(d, tz, 'EEE MMM d') + ' · ' + r[2] + (r[3] === 'Front' || r[3] === 'Back' ? ' ' + r[3] + ' 9' : '') });
  });
  nights.sort(function (a, b) { return a.night < b.night ? -1 : 1; });
  if (!nights.length) return { ok: true, nights: [], matches: [], byes: [] };

  var n = nights.filter(function (x) { return x.night === want; })[0] ||
    nights.filter(function (x) { return x.night >= today; })[0] || nights[nights.length - 1];

  var b = tpBuild_(ss, { key: n.night, date: n.date, course: n.course, nine: n.nine, casual: false, locked: true,
    label: n.label, lockText: '', teedOff: false });
  var idx = {};
  ss.getSheetByName('Players').getRange('A2:I40').getDisplayValues().forEach(function (p) {
    if (p[0]) idx[p[0]] = p[8] === '' ? '' : Number(p[8]);
  });
  function side(name) {
    var p = b && b.players[name];
    var tee = p ? (p.pick || p.def) : '';
    return { name: name, index: idx[name] === undefined ? '' : idx[name], tee: tee, ch: p && tee ? p.chs[tee] : '' };
  }
  var pairs = teePairs_(ss, n.night), playing = {};
  pairs.forEach(function (x) { playing[x[0]] = 1; playing[x[1]] = 1; });
  var out = {
    ok: true,
    nights: nights.map(function (x) { return { night: x.night, label: x.label }; }),
    night: n.night, label: n.label, course: n.course, nine: n.nine, holes: b ? b.holes : '',
    matches: pairs.map(function (x) { return { a: side(x[0]), b: side(x[1]) }; }),
    byes: pairs.length ? teeLeague_(ss).filter(function (name) { return !playing[name]; }) : []
  };
  cache.put(ckey, JSON.stringify(out), 300);
  return out;
}
