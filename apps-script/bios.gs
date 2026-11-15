// ===================================================================
// Commentary bios in the app (added Nov 15, 2026). News > Bios.
// - Signed-in players can read every bio on the Commentary Bios tab and ADD to any player's bio.
//   Nothing can be edited or removed from the app: the server only ever appends a new line to the
//   cell ("<text> (added by Jeff, Nov 15)"). Ty edits or removes things in the sheet himself.
// - "Off limits" is never sent to the app, for anyone. A player can add to their OWN off limits
//   (write-only: it's appended to the sheet, nobody sees it in the app).
// - Every addition is also logged on the "Bio Additions" tab (Time, By, Player, Field, Text), so
//   anything changed in the sheet can be traced back.
// - Columns are found by header name, so inserting a column (like Major Wins) doesn't break it.
// Wiring: doPost (perf.gs) sends action 'bios' (read) and 'bio' (add) here; neither clears the board cache.
// ===================================================================
var BIO_TAB_ = 'Commentary Bios';
var BIO_LOG_TAB_ = 'Bio Additions';
var BIO_MAX_ = 400;          // characters per addition
var BIO_HOURLY_ = 30;        // additions per player per hour
// Header → key and whether players can add to it. Unknown headers are shown read-only.
var BIO_FIELDS_ = [
  [/^full name/i, 'full', false],
  [/^how to say/i, 'say', true],
  [/^nicknames?/i, 'nick', true],
  [/^job/i, 'life', true],
  [/^golf game/i, 'game', true],
  [/^legendary|disasters/i, 'disasters', true],
  [/^rivalr/i, 'rivals', true],
  [/^brags?/i, 'brags', true],
  [/^major/i, 'majors', true]
];
var BIO_OFF_ = /^off limits/i;

/** Reads the tab: { sh, cols: [{key, label, col, add}], off: col|0, rows: [{name, row, vals}], lore: [{name, text}] } */
function bioRead_(ss) {
  var sh = ss.getSheetByName(BIO_TAB_);
  if (!sh) return null;
  var lastC = sh.getLastColumn(), lastR = Math.max(sh.getLastRow(), 2);
  var all = sh.getRange(1, 1, lastR, lastC).getDisplayValues();
  var head = all[0], cols = [], off = 0;
  head.forEach(function (h, i) {
    if (i === 0 || !h) return;
    if (BIO_OFF_.test(h)) { off = i + 1; return; }
    var key = '', add = false;
    BIO_FIELDS_.some(function (f) { if (f[0].test(h)) { key = f[1]; add = f[2]; return true; } return false; });
    cols.push({ key: key || ('c' + (i + 1)), label: h, col: i + 1, add: add });
  });
  var rows = [], i = 1;
  for (; i < all.length && all[i][0]; i++) rows.push({ name: all[i][0], row: i + 1, vals: all[i] });
  // League lore: the block under a row whose first cell starts "Tournaments", until a blank row.
  var lore = [];
  for (; i < all.length; i++) {
    if (!/^tournaments/i.test(all[i][0])) continue;
    for (var j = i + 1; j < all.length && all[j][0]; j++) lore.push({ name: all[j][0], text: all[j][1] || '' });
    break;
  }
  return { sh: sh, cols: cols, off: off, rows: rows, lore: lore };
}

/** App: { action: 'bios', token } → every bio (no Off limits), the fields and the league lore. */
function apiBios_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var b = bioRead_(ss);
  if (!b) return { ok: false, error: 'The Commentary Bios tab is missing.' };
  return {
    ok: true, me: user.name, max: BIO_MAX_,
    fields: b.cols.map(function (c) { return { key: c.key, label: c.label, add: c.add }; }),
    players: b.rows.map(function (r) {
      var v = {};
      b.cols.forEach(function (c) { v[c.key] = r.vals[c.col - 1] || ''; });
      return { name: r.name, v: v };
    }),
    hasOff: !!b.off,
    lore: b.lore
  };
}

/** App: { action: 'bio', token, player, field, text } → appends one line. Never replaces or removes anything. */
function apiBioAdd_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  var text = String(req.text == null ? '' : req.text).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!text) return { ok: false, error: 'Type something to add.' };
  if (text.length > BIO_MAX_) return { ok: false, error: 'Keep it under ' + BIO_MAX_ + ' characters.' };
  var cache = CacheService.getScriptCache(), ck = 'bioN|' + user.name, n = Number(cache.get(ck) || 0);
  if (n >= BIO_HOURLY_ && !user.admin) return { ok: false, error: 'That\'s a lot of material. Take a breather and add more in an hour.' };

  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var b = bioRead_(ss);
    if (!b) return { ok: false, error: 'The Commentary Bios tab is missing.' };
    var p = null;
    b.rows.forEach(function (r) { if (!p && r.name === String(req.player)) p = r; });
    if (!p) return { ok: false, error: 'No bio for ' + req.player + '.' };
    var col = 0, label = '', field = String(req.field || '');
    if (field === 'offlimits') {
      if (!b.off) return { ok: false, error: 'Off limits isn\'t set up on the sheet.' };
      if (p.name !== user.name) return { ok: false, error: 'You can only add to your own off limits.' };
      col = b.off; label = 'Off limits';
    } else {
      b.cols.forEach(function (c) { if (c.key === field && c.add) { col = c.col; label = c.label; } });
      if (!col) return { ok: false, error: 'That part of the bio can\'t be added to.' };
    }
    var cell = b.sh.getRange(p.row, col);
    var cur = String(cell.getValue() == null ? '' : cell.getValue()).replace(/\s+$/, '');
    var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'America/New_York', 'MMM d');
    var line = text + ' (added by ' + user.name + ', ' + stamp + ')';
    var val = cur ? cur + '\n' + line : line;
    if (/^[=+\-@]/.test(val)) val = "'" + val;    // never let an addition become a formula
    cell.setValue(val);

    var log = ss.getSheetByName(BIO_LOG_TAB_);
    if (!log) {
      log = ss.insertSheet(BIO_LOG_TAB_);
      log.getRange(1, 1, 1, 5).setValues([['Time', 'By', 'Player', 'Field', 'Text']]).setFontWeight('bold');
      log.setFrozenRows(1);
    }
    log.appendRow([new Date(), user.name, p.name, label, "'" + text]);
    cache.put(ck, String(n + 1), 3600);
    return { ok: true, player: p.name, field: field, value: field === 'offlimits' ? '' : String(cell.getDisplayValue()) };
  } finally { lock.releaseLock(); }
}
