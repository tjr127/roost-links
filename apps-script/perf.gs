
// ===================================================================
// Lighter, faster data feed (added Nov 12, 2026).
// - The whole board is built at most once every 20 seconds and shared by every phone
//   (script cache). Any save through the app, the GSPro agent or the old page clears it.
// - live = Tonight's date is today: the app refreshes every minute when live, every 5 minutes otherwise.
// - The app sends the hashes of the handicap history and schedule it already has (have=...);
//   if they haven't changed they are left out of the reply and listed in `same`.
// The original builder is buildBoardData_ (renamed from getBoardData).
// ===================================================================
var BOARD_KEY_ = 'board|v1';
var BOARD_TTL_ = 20;  // seconds

// Nov 13: one rebuild at a time. While a rebuild runs, other requests get the last copy (board|stale, 10 min)
// instead of starting their own 12-second build. getBoardData(true) always builds (end-of-night alerts).
var BOARD_STALE_KEY_ = 'board|stale', BOARD_BUILD_KEY_ = 'board|building';

function getBoardData(fresh) {
  var cache = CacheService.getScriptCache();
  if (fresh !== true) {
    var hit = cache.get(BOARD_KEY_);
    if (hit) { try { return JSON.parse(hit); } catch (e) {} }
    if (cache.get(BOARD_BUILD_KEY_)) {
      var stale = cache.get(BOARD_STALE_KEY_);
      if (stale) { try { return JSON.parse(stale); } catch (e) {} }
    }
  }
  cache.put(BOARD_BUILD_KEY_, '1', 30);
  try {
    var d = buildBoardData_();
    d.live = boardLive_();
    d._h = { handicaps: boardHash_(d.handicaps), schedule: boardHash_(d.schedule) };
    try { d.entry = entryInfo_(); } catch (x) { console.error(x); }
    try {
      var s = JSON.stringify(d);
      if (s.length < 98000) { cache.put(BOARD_KEY_, s, BOARD_TTL_); cache.put(BOARD_STALE_KEY_, s, 600); }
    } catch (e) {}
    return d;
  } finally { cache.remove(BOARD_BUILD_KEY_); }
}

function boardBust_() { try { CacheService.getScriptCache().remove(BOARD_KEY_); } catch (e) {} }

function boardHash_(o) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(o === undefined ? null : o), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(b).slice(0, 12);
}

function boardLive_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var tz = ss.getSpreadsheetTimeZone();
  var d = ss.getSheetByName('Tonight').getRange('B1').getValue();
  return d instanceof Date && Utilities.formatDate(d, tz, 'yyyy-MM-dd') === Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

/** App data feed: leaves out handicaps / schedule when the phone already has the same version. */
function apiBoard_(p) {
  var d = getBoardData();
  var have = String(p.have || '');
  if (!have) return d;
  var same = [];
  have.split(',').forEach(function (kv) {
    var a = kv.split(':');
    if (d._h && a[0] && d._h[a[0]] && d._h[a[0]] === a[1]) { same.push(a[0]); delete d[a[0]]; }
  });
  d.same = same;
  return d;
}

// Nov 13: only clear the board when something changed. GSPro agent posts arrive after every shot and
// usually resend holes the sheet already has; app actions (sign-in, tee picks, saves) always clear it.
// AGENT_DIRTY_ is set at the end of agentSave_ (in Web.gs): any hole saved, GSPro Log row added/changed, or putts total written.
var AGENT_DIRTY_ = false;

function doPost(e) {
  AGENT_DIRTY_ = false;
  var isAction = false;
  try { var b = JSON.parse(e && e.postData ? e.postData.contents : '{}'); isAction = !!(b && b.action); } catch (x) {}
  try {
    if (isAction && b.action === 'entry') return ContentService.createTextOutput(JSON.stringify(apiEntry_(b))).setMimeType(ContentService.MimeType.JSON);
    return doPost0_(e);
  } finally { if (isAction || AGENT_DIRTY_) boardBust_(); }
}

/** Score saves from the old script.google.com page (and the app, via apiSave_) clear it too. */
function saveScore(name, hole, gross, putts) {
  try { return saveScore0_(name, hole, gross, putts); } finally { boardBust_(); }
}
