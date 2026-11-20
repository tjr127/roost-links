// ===================================================================
// Bios for the commentary program (Nov 20, 2026): GET ?api=bios&key=<GSPro agent key> (apiGet_ routes it to apiBioFeed_; apiBios_ is the app's names-only bios action).
// The commentary loads every player's bio straight from the Commentary Bios tab each time it starts (and on F).
// Key-protected with the GSPro agent's key, so the app and the public never get bio text.
// Columns are matched by header words; any other column comes back under "extra" with its header as the label.
// Lore = the Tournaments block (column A name, column B description) below the "Tournaments" heading.
// ===================================================================
function apiBioFeed_(key) {
  if (String(key || '') !== AGENT_KEY_) return { ok: false, error: 'auth' };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var sh = ss.getSheetByName('Commentary Bios');
  if (!sh) return { ok: false, error: 'no Commentary Bios tab' };
  var v = sh.getDataRange().getDisplayValues();
  var head = v[0] || [];
  function field(h) {
    var s = String(h || '').toLowerCase();
    if (!s) return '';
    if (s === 'player') return 'player';
    if (s.indexOf('full name') >= 0) return 'fullName';
    if (s.indexOf('how to say') >= 0 || s.indexOf('pronoun') >= 0) return 'sayIt';
    if (s.indexOf('nickname') >= 0) return 'nicknames';
    if (s.indexOf('job') >= 0 || s.indexOf('family') >= 0) return 'life';
    if (s.indexOf('golf game') >= 0) return 'game';
    if (s.indexOf('disaster') >= 0 || s.indexOf('running joke') >= 0) return 'disasters';
    if (s.indexOf('rival') >= 0) return 'rivals';
    if (s.indexOf('brag') >= 0) return 'brags';
    if (s.indexOf('major') >= 0 || s.indexOf('title') >= 0) return 'majors';
    if (s.indexOf('drink') >= 0 || s.indexOf('vice') >= 0) return 'vices';
    if (s.indexOf('off limits') >= 0) return 'offLimits';
    return '#' + h;
  }
  var cols = head.map(field);
  var players = [], lore = [], inLore = false;
  for (var r = 1; r < v.length; r++) {
    var a = String(v[r][0] || '').trim();
    if (/^tournaments/i.test(a)) { inLore = true; continue; }
    if (inLore) { if (a) lore.push({ name: a, about: String(v[r][1] || '').trim() }); continue; }
    if (!a) continue;
    var p = { extra: [] };
    cols.forEach(function (c, i) {
      var t = String(v[r][i] || '').trim();
      if (!c || !t) return;
      if (c.charAt(0) === '#') p.extra.push({ label: c.slice(1), text: t }); else p[c] = t;
    });
    if (p.player) players.push(p);
  }
  return { ok: true, players: players, lore: lore, at: new Date().toISOString() };
}
