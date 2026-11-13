// ===================================================================
// Player settings (added Nov 13, 2026). Opened from the cog in the app header.
// - Tee time default: Early / Late / Either, or none ("Let me decide every week", the default).
//   Stored in Script Properties as teeDefault:<Name>. When sign-up opens for a league night, every league
//   member with a default and a match that night who hasn't picked yet gets their default as their pick
//   (Tee Times tab, Set by "Default"). Byes are skipped. Players can still change it that week.
//   Setting a default while sign-up is already open applies it straight away if the player hasn't picked.
// - Default tees: writes the player's Tees on the Players tab (column D), the same default Ty sets there.
// Wiring: doPost (perf.gs) sends action 'settings' here; notifyTick (league-tees.gs) calls teeDefaults_.
// ===================================================================
var SET_TEETIMES_ = ['Early', 'Late', 'Either'];

function setTeeDefault_(name) { return apiProps_().getProperty('teeDefault:' + name) || ''; }

/** The player's Players-tab row: { row, tees, league } or null. */
function setPlayerRow_(ss, name) {
  var vals = ss.getSheetByName('Players').getRange('A2:D40').getDisplayValues(), out = null;
  vals.forEach(function (r, i) {
    if (!out && r[0] === name) out = { row: i + 2, tees: r[3], league: r[1] === 'League' && r[2] === 'TRUE' };
  });
  return out;
}

/** App: { action: 'settings', token } reads; add teeTime ('' | Early | Late | Either) and/or tees to change. */
function apiSettings_(req) {
  var user = apiUser_(req.token);
  if (!user) return { ok: false, code: 'auth', error: 'Please sign in again.' };
  var name = user.name;
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var p = setPlayerRow_(ss, name);
  if (!p) return { ok: false, error: name + ' is not on the Players tab.' };
  var applied = '';
  if (req.teeTime !== undefined) {
    var tt = String(req.teeTime || '');
    if (tt && SET_TEETIMES_.indexOf(tt) < 0) return { ok: false, error: 'Pick Early, Late, Either or Let me decide.' };
    if (!p.league) return { ok: false, error: 'Tee time defaults are for league members.' };
    if (tt) apiProps_().setProperty('teeDefault:' + name, tt); else apiProps_().deleteProperty('teeDefault:' + name);
    if (tt) {
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try { applied = setApplyOne_(ss, name, tt); } finally { lock.releaseLock(); }
    }
  }
  if (req.tees !== undefined) {
    var tees = String(req.tees || '');
    if (TP_TEES_.indexOf(tees) < 0) return { ok: false, error: 'Pick Tips, Long, Medium or Short.' };
    ss.getSheetByName('Players').getRange(p.row, 4).setValue(tees);
    p.tees = tees;
  }
  if (req.teeTime !== undefined || req.tees !== undefined) boardBust_();
  return { ok: true, name: name, league: p.league, teeTime: setTeeDefault_(name), tees: p.tees, teesList: TP_TEES_, applied: applied };
}

/**
 * Give one player their default for the next league night if sign-up is open, they have a match
 * (or the night has no matchups yet) and they haven't picked. Returns 'applied', 'bye', 'picked' or ''.
 */
function setApplyOne_(ss, name, choice, ctx) {
  ctx = ctx || setCtx_(ss);
  if (!ctx) return '';
  if (ctx.pairs.length && !ctx.sched[name]) return 'bye';
  var r = ctx.rows[name];
  if (r && r.choice) return 'picked';
  var sh = teeSheet_(ss), vals = [[ctx.night.key, name, choice, new Date(), 'Default']];
  if (r) sh.getRange(r.row, 1, 1, 5).setValues(vals);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, 5).setValues(vals);
  ctx.rows[name] = { row: r ? r.row : sh.getLastRow(), choice: choice };
  return 'applied';
}

/** Next league night with sign-up open, its matchups and current picks; null when sign-up isn't open. */
function setCtx_(ss) {
  var night = teeNight_(ss);
  if (!night || teeState_(night) !== 'open') return null;
  var pairs = teePairs_(ss, night.key), sched = {};
  pairs.forEach(function (x) { sched[x[0]] = true; sched[x[1]] = true; });
  return { night: night, pairs: pairs, sched: sched, rows: teeRows_(ss, night.key) };
}

/** 5-minute timer: once sign-up opens, fill in everyone's tee time default (once per night). */
function teeDefaults_(ss) {
  var ctx = setCtx_(ss);
  if (!ctx) return;
  var props = apiProps_(), flag = 'ntf:defaults:' + ctx.night.key;
  if (props.getProperty(flag)) return;
  var all = props.getProperties(), league = teeLeague_(ss), n = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('teeDefault:') !== 0) return;
      var name = k.slice(11), c = all[k];
      if (league.indexOf(name) < 0 || SET_TEETIMES_.indexOf(c) < 0) return;
      if (setApplyOne_(ss, name, c, ctx) === 'applied') n++;
    });
    props.setProperty(flag, new Date().toISOString() + ' (' + n + ')');
  } finally { lock.releaseLock(); }
  if (n) boardBust_();
}
