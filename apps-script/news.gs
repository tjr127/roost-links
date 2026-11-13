// ===================================================================
// News tab in the app (added Nov 13, 2026): every push alert is also saved, so players can read them later.
// - Results: the end-of-night alerts (League results, Low net and putts, Team game). Kept until the next
//   night's results arrive, which replace them.
// - Announcements: every other alert (sign-up open, groups set, teed off, last hole, reminders). Kept 3 days.
//   An alert sent to only some players (e.g. the 8 AM reminder) is shown only to them.
// Stored on the "News" tab (created automatically): Time, Kind (results/announce), Night, Title, Body, To.
// Wiring: the original notify_ was renamed notify0_; notify_ below saves the alert and then sends it.
// getBoardData (perf.gs) adds d.news = newsFeed_() (cached with the board; a new alert clears the cache).
// ===================================================================
var NEWS_KEEP_MS_ = 3 * 24 * 3600 * 1000;
var NEWS_RESULTS_ = [/^League results at /, /^Low net and putts/, /^Team game:/];

function notify_(heading, message, names) {
  try { newsAdd_(heading, message, names); } catch (e) { console.error(e); }
  return notify0_(heading, message, names);
}

function newsSheet_(ss) {
  var sh = ss.getSheetByName('News');
  if (!sh) {
    sh = ss.insertSheet('News');
    sh.getRange(1, 1, 1, 6).setValues([['Time', 'Kind', 'Night', 'Title', 'Body', 'To']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function newsAdd_(heading, message, names) {
  names = (names || []).filter(String);
  if (!names.length || /^Test alert/.test(String(message))) return;
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var results = NEWS_RESULTS_.some(function (re) { return re.test(String(heading)); });
  var league = teeLeague_(ss);
  var everyone = league.every(function (n) { return names.indexOf(n) >= 0; });
  var night = '';
  if (results) {
    var d = ss.getSheetByName('Tonight').getRange('B1').getValue();
    night = d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = newsSheet_(ss);
    sh.appendRow([new Date(), results ? 'results' : 'announce', night ? "'" + night : '', String(heading), String(message), everyone ? '' : names.join(', ')]);
    newsPrune_(sh, results ? night : null);
  } finally { lock.releaseLock(); }
  try { boardBust_(); } catch (e) {}
}

/** Drop announcements older than 3 days and, when a new night's results come in, the older results. */
function newsPrune_(sh, keepNight) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var vals = sh.getRange(2, 1, n, 3).getValues(), now = Date.now();
  for (var i = vals.length - 1; i >= 0; i--) {
    var t = vals[i][0] instanceof Date ? vals[i][0].getTime() : 0, kind = vals[i][1];
    var drop = kind === 'announce' ? now - t > NEWS_KEEP_MS_ : (keepNight && String(vals[i][2]) !== keepNight);
    if (drop) sh.deleteRow(i + 2);
  }
}

/** Feed: results (latest night, in send order) and announcements (last 3 days, newest first). */
function newsFeed_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var sh = ss.getSheetByName('News');
  if (!sh || sh.getLastRow() < 2) return { results: [], announce: [], night: '' };
  var tz = ss.getSpreadsheetTimeZone(), now = Date.now();
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var lastNight = '';
  vals.forEach(function (r) { if (r[1] === 'results' && String(r[2]) > lastNight) lastNight = String(r[2]); });
  function item(r) {
    var t = r[0] instanceof Date ? r[0] : new Date(r[0]);
    return { at: Utilities.formatDate(t, tz, "EEE MMM d, h:mm a"), ts: t.getTime(), title: String(r[3]), body: String(r[4]),
      to: r[5] ? String(r[5]).split(/\s*,\s*/) : '' };
  }
  var results = vals.filter(function (r) { return r[1] === 'results' && String(r[2]) === lastNight; }).map(item);
  var announce = vals.filter(function (r) { return r[1] === 'announce' && r[0] instanceof Date && now - r[0].getTime() <= NEWS_KEEP_MS_; })
    .map(item).sort(function (a, b) { return b.ts - a.ts; });
  var nightLabel = '';
  if (lastNight) { var p = lastNight.split('-'); nightLabel = Utilities.formatDate(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12), tz, 'EEE MMM d'); }
  return { results: results, announce: announce, night: nightLabel };
}
