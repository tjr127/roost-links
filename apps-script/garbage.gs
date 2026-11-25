// ===================================================================
// Garbage side game (Bingo Bango Bongo), server side. Added Nov 25, 2026. See claude/bbb-side-game.md.
// Three points a hole among the players the admin picked for tonight:
//   FO  Furthest Out   first on the green from the furthest distance (yards to the pin where that shot was hit).
//                      Par 3: everyone on from the tee counts the same; closest wins. Nobody on from the tee: furthest out.
//                      The shot onto the green can't be a mulligan replay. Penalty strokes don't matter.
//   CTP Closest to Pin closest once on the green, with a shot played from off the green. A chip-in is 0.
//   LP  Longest Putt   fewest putts; the longest first putt breaks ties. A chip-in takes CTP and LP.
//   A tie that the tiebreaks can't split = nobody gets that point.
// Worked out from the GSPro Log "Shots" column (R): [startLie, startYd, endLie, endYd, penaltyStrokes(, replay)]
//   lies T F R S G X, H = holed (end only); yards to the pin; mulligans already left out.
//   Element 6 (1 = this stroke was a mulligan replay) comes with a later agent update. Until then a player with
//   mulligans on the hole can't take FO on it (flagged "mull" so the admin can set it by hand).
// A hole counts once every Garbage player has a GSPro row with shots for it, or the admin set its winners by hand.
// Money: $1 a player; the leader at the end of the night takes the pot; a tie carries the pot to the next Garbage night.
// Settings: Script Property GARB_CFG = { night, on, players, over: { hole: { fo, ct, lp } }, carry, closed, rev }.
// History: "Garbage Log" tab, one row per night (key yyyy-MM-dd), rewritten whenever the night's result changes.
// Wiring (all in Web.gs):
//   apiGet_:      else if (p.api === 'garbage') out = apiGarbGet_(p);
//   doPost:       if (isAction && b.action === 'garbage') return ...apiGarb_(b)...;  and 'garbage' in the no-bust list
//   getBoardData: try { d.garbage = garbBrief_(); } catch (x) { console.error(x); }
// ===================================================================
var GARB_KEY_ = 'GARB_CFG', GARB_LOG_ = 'Garbage Log', GARB_BUY_ = 1, GARB_EXCL_ = /^jeff( holl)?$/i;
var GARB_HEAD_ = ['Night', 'Label', 'Players', 'Carry in', 'Pot', 'Status', 'Result', 'Winner', 'Points', 'State (JSON)', 'Saved'];

function garbCfg_() {
  var raw = apiProps_().getProperty(GARB_KEY_);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function garbNum_(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); }
function garbFt_(yd) { var ft = yd * 3; return ft < 10 ? (Math.round(ft * 10) / 10) + ' ft' : Math.round(ft) + ' ft'; }

/** One hole. rows: { player: { par, putts, mull, shots } }. Returns winners, display distances and notes. */
function garbHole_(players, rows, over) {
  var par = 0, P = [];
  players.forEach(function (p) {
    var r = rows[p]; if (!r) return;
    if (!par && r.par) par = Number(r.par) || 0;
    var S = r.shots || [], gi = -1;
    for (var i = 0; i < S.length; i++) { var sl = String(S[i][0]), el = String(S[i][2]); if (sl !== 'G' && (el === 'G' || el === 'H')) { gi = i; break; } }
    if (gi < 0) return;
    var s = S[gi], chip = String(s[2]) === 'H';
    var nputt = S.filter(function (x) { return String(x[0]) === 'G'; }).length;
    var putts = chip ? 0 : (garbNum_(r.putts) !== null ? garbNum_(r.putts) : nputt);
    var replay = s.length > 5 ? Number(s[5]) === 1 : (Number(r.mull) > 0 ? null : false);   // null = can't tell yet
    P.push({ p: p, start: Number(s[1]) || 0, tee: gi === 0, replay: replay, prox: chip ? 0 : (Number(s[3]) || 0), chip: chip, putts: putts });
  });
  var out = { par: par, fo: '', ct: '', lp: '', foD: '', ctD: '', lpD: '', tag: '', note: '' };
  function one(list, key, hi) {   // single best by key, or null on a tie / empty list
    if (!list.length) return null;
    var v = list.map(function (x) { return x[key]; }), b = hi ? Math.max.apply(null, v) : Math.min.apply(null, v);
    var w = list.filter(function (x) { return x[key] === b; });
    return w.length === 1 ? w[0] : null;
  }
  // Furthest Out
  var elig = P.filter(function (x) { return x.replay === false; });
  if (P.some(function (x) { return x.replay === null; })) out.note = 'mull';
  var tee = par === 3 ? elig.filter(function (x) { return x.tee; }) : [];
  var fo = tee.length ? one(tee, 'prox', false) : one(elig, 'start', true);
  if (fo) { out.fo = fo.p; out.foD = tee.length ? 'on from the tee, ' + (fo.chip ? 'holed' : garbFt_(fo.prox)) : Math.round(fo.start) + ' yd'; }
  // Closest to Pin (several chip-ins: the longest one)
  var chips = P.filter(function (x) { return x.chip; });
  var ct = chips.length ? one(chips, 'start', true) : one(P, 'prox', false);
  if (ct) { out.ct = ct.p; out.ctD = ct.chip ? 'chip-in from ' + Math.round(ct.start) + ' yd' : garbFt_(ct.prox); }
  // Longest Putt
  var lp = null;
  if (chips.length) lp = one(chips, 'start', true);
  else if (P.length) {
    var mn = Math.min.apply(null, P.map(function (x) { return x.putts; }));
    lp = one(P.filter(function (x) { return x.putts === mn; }), 'prox', true);
  }
  if (lp) { out.lp = lp.p; out.lpD = lp.chip ? 'chip-in' : garbFt_(lp.prox) + ' ' + lp.putts + '-putt'; }
  if (ct && ct.chip && lp && lp.p === ct.p) out.tag = 'chip';
  else if (par === 3 && tee.length && fo && ct && fo.p === ct.p) out.tag = 'p3';
  // admin's hand-set winners ('-' = nobody)
  if (over) ['fo', 'ct', 'lp'].forEach(function (k) {
    if (over[k] === undefined || over[k] === '') return;
    out[k] = over[k] === '-' ? '' : String(over[k]); out[k + 'D'] = 'set by hand'; out.src = 'admin'; out.tag = '';
  });
  return out;
}

/** Whole night. holeNums: ['10','11',…]; log: GSPro Log rows for the night; cfgOver: { hole: {fo,ct,lp} }. */
function garbCompute_(players, holeNums, log, cfgOver, closed) {
  var by = {};
  log.forEach(function (r) {
    var h = String(r[3]), p = String(r[2]), shots = null;
    if (r.length >= 18 && r[17]) { try { shots = JSON.parse(String(r[17])); } catch (e) { shots = null; } }
    (by[h] = by[h] || {})[p] = { par: r[15], putts: r[5], mull: r[6], shots: shots };
  });
  var pts = {}; players.forEach(function (p) { pts[p] = { fo: 0, ct: 0, lp: 0, t: 0 }; });
  var holes = [], done = 0;
  holeNums.forEach(function (h) {
    var rows = by[h] || {}, ov = (cfgOver || {})[h];
    var have = players.filter(function (p) { return rows[p] && rows[p].shots && rows[p].shots.length; });
    var ovAll = ov && ['fo', 'ct', 'lp'].every(function (k) { return ov[k] !== undefined && ov[k] !== ''; });
    var ready = players.length >= 2 && (have.length === players.length || ovAll);
    var o = { n: Number(h) || h, par: 0, done: false };
    if (ready) {
      var x = garbHole_(have, rows, ov);
      o = { n: Number(h) || h, par: x.par, done: true, fo: x.fo, ct: x.ct, lp: x.lp, foD: x.foD, ctD: x.ctD, lpD: x.lpD, tag: x.tag };
      if (x.note) o.note = x.note; if (x.src) o.src = x.src;
      ['fo', 'ct', 'lp'].forEach(function (k) { if (o[k] && pts[o[k]]) { pts[o[k]][k]++; pts[o[k]].t++; } });
      done++;
    } else {
      o.wait = players.filter(function (p) { return have.indexOf(p) < 0; });
      var anyRow = players.filter(function (p) { return rows[p]; });
      if (anyRow.length === players.length && have.length < players.length) o.note = 'noshots';   // entered by phone: needs a hand-set result
    }
    holes.push(o);
  });
  var order = players.slice().sort(function (a, b) { return pts[b].t - pts[a].t || (a < b ? -1 : 1); });
  var final = players.length >= 2 && holeNums.length > 0 && (done === holeNums.length || (!!closed && done > 0));
  return { players: players, total: holeNums.length, holes: holes, pts: pts, order: order, played: done, left: final ? 0 : (holeNums.length - done) * 3, final: final };
}

function garbLogSheet_(ss, make) {
  var sh = ss.getSheetByName(GARB_LOG_);
  if (!sh && make) { sh = ss.insertSheet(GARB_LOG_); sh.getRange('A:A').setNumberFormat('@'); sh.appendRow(GARB_HEAD_); sh.setFrozenRows(1); sh.getRange(1, 1, 1, GARB_HEAD_.length).setFontWeight('bold'); }
  return sh;
}
function garbLogRows_(ss) {
  var sh = garbLogSheet_(ss, false);
  return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, GARB_HEAD_.length).getValues() : [];
}
/** Pot carried into `key`: the pot of the latest earlier finished night, if it ended in a tie. */
function garbCarry_(rows, key) {
  var prev = rows.filter(function (r) { return String(r[0]) < key && String(r[5]) === 'Final'; }).sort(function (a, b) { return String(a[0]) < String(b[0]) ? 1 : -1; })[0];
  return prev && String(prev[6]) === 'Tie' ? Number(prev[4]) || 0 : 0;
}

/** Tonight's state (what ?api=garbage returns). */
function garbState_(ss) {
  var cfg = garbCfg_() || {}, t = ss.getSheetByName('Tonight');
  var label = agentNight_(t), dv = t.getRange('B1').getValue();
  var key = dv instanceof Date ? Utilities.formatDate(dv, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : label;
  var names = t.getRange('A10:A25').getDisplayValues().map(function (r) { return String(r[0]).trim(); }).filter(String);
  var can = names.filter(function (n) { return !GARB_EXCL_.test(n); });
  var mine = cfg.night === label;
  var players = mine && cfg.players ? can.filter(function (n) { return cfg.players.indexOf(n) >= 0; }) : can;
  var on = !!(mine && cfg.on);
  var out = { on: on, night: key, label: label, roster: can, excluded: names.filter(function (n) { return GARB_EXCL_.test(n); }), rev: cfg.rev || 0 };
  var logRows = garbLogRows_(ss);
  out.carry = mine && garbNum_(cfg.carry) !== null ? garbNum_(cfg.carry) : garbCarry_(logRows, key);
  out.carrySet = !!(mine && garbNum_(cfg.carry) !== null);
  if (!on) { out.players = players; out.pot = players.length * GARB_BUY_ + out.carry; return out; }
  var holeNums = t.getRange('E5:V5').getDisplayValues()[0].filter(String);
  var st = garbCompute_(players, holeNums, agentRows_(ss, false), cfg.over || {}, cfg.closed);
  for (var k in st) out[k] = st[k];
  out.closed = !!cfg.closed;
  out.pot = players.length * GARB_BUY_ + out.carry;
  var top = st.order.length ? st.pts[st.order[0]].t : 0;
  out.leaders = top > 0 ? st.order.filter(function (p) { return st.pts[p].t === top; }) : [];
  return out;
}

/** Keeps the night's row on the Garbage Log in step with the state (only writes when something changed). */
function garbLogSave_(ss, st) {
  if (!st.on || !st.played) return;
  var cache = CacheService.getScriptCache();
  var res = st.final ? (st.leaders.length === 1 ? 'Win' : 'Tie') : '';
  var slim = { night: st.night, label: st.label, players: st.players, total: st.total, holes: st.holes, pts: st.pts, order: st.order, played: st.played, left: st.left, final: st.final, pot: st.pot, carry: st.carry, leaders: st.leaders };
  var json = JSON.stringify(slim), sig = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json));
  if (cache.get('garb|sig|' + st.night) === sig) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) return;
  try {
    var sh = garbLogSheet_(ss, true), last = sh.getLastRow(), row = 0;
    if (last > 1) { var keys = sh.getRange(2, 1, last - 1, 1).getDisplayValues(); for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === st.night) { row = i + 2; break; } }
    var ptsTxt = st.order.map(function (p) { return p + ' ' + st.pts[p].t; }).join(', ');
    var vals = [st.night, st.label, st.players.join(', '), st.carry, st.pot, st.final ? 'Final' : 'Live', res, st.final ? st.leaders.join(', ') : '', ptsTxt, json, new Date()];
    if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
    cache.put('garb|sig|' + st.night, sig, 21600);
  } finally { lock.releaseLock(); }
}

function garbBrief_() {
  var cfg = garbCfg_(); if (!cfg || !cfg.on) return { on: false, rev: cfg ? cfg.rev || 0 : 0 };
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  return { on: cfg.night === agentNight_(ss.getSheetByName('Tonight')), rev: cfg.rev || 0 };
}

/** GET ?api=garbage  (tonight) · &night=yyyy-MM-dd (a saved night) · &season=1 (every saved night, for totals and the picker)
 *  · &test=<GSPro Log night text> (dry run over a logged night with everyone who played it; saves nothing). */
function apiGarbGet_(p) {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  if (p.test) {
    var log = ss.getSheetByName(AGENT_LOG_), all = log && log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, Math.min(AGENT_COLS_, log.getLastColumn())).getValues() : [];
    var rows = all.filter(function (r) { return String(r[0]) === String(p.test) && r[1] !== ''; }), ps = [], hs = [];
    rows.forEach(function (r) { var n = String(r[2]), h = String(r[3]); if (ps.indexOf(n) < 0 && !GARB_EXCL_.test(n)) ps.push(n); if (hs.indexOf(h) < 0) hs.push(h); });
    hs.sort(function (a, b) { return Number(a) - Number(b); });
    return { ok: true, test: true, garbage: garbCompute_(ps, hs, rows, {}, false) };
  }
  if (p.season || p.night) {
    var out = [];
    garbLogRows_(ss).forEach(function (r) {
      var key = r[0] instanceof Date ? Utilities.formatDate(r[0], ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(r[0]);
      if (p.night && key !== String(p.night)) return;
      var st = null; try { st = JSON.parse(String(r[9])); } catch (e) {}
      if (p.night) out.push(st);
      else out.push({ night: key, label: String(r[1]), players: String(r[2]).split(', ').filter(String), carry: Number(r[3]) || 0, pot: Number(r[4]) || 0, status: String(r[5]), result: String(r[6]), winners: String(r[7]).split(', ').filter(String), pts: st ? st.pts : {} });
    });
    return p.night ? { ok: true, garbage: out[0] || null } : { ok: true, nights: out };
  }
  var cache = CacheService.getScriptCache(), hit = cache.get('garb|state');
  if (hit) return { ok: true, garbage: JSON.parse(hit) };
  var st0 = garbState_(ss);
  try { garbLogSave_(ss, st0); } catch (e) { console.error(e); }
  try { cache.put('garb|state', JSON.stringify(st0), 10); } catch (e2) {}
  return { ok: true, garbage: st0 };
}

/** POST { action: 'garbage', token, op }  (admin only)
 *  op 'set':    { on, players: [names] | null, carry: number | null }   switch, who's in, pot carried in (null = automatic)
 *  op 'over':   { hole, fo, ct, lp }   hand-set winners for a hole (name, '-' for nobody, '' to go back to GSPro's result)
 *  op 'finish': { closed: true|false } end the night with the holes scored so far (false reopens it) */
function apiGarb_(b) {
  try {
    var user = apiUser_(b.token);
    if (!user || !user.admin) return { ok: false, code: user ? 'denied' : 'auth', error: user ? 'Only Ty can run Garbage.' : 'Please sign in again.' };
    var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var night = agentNight_(ss.getSheetByName('Tonight')), cfg = garbCfg_() || {};
      if (cfg.night !== night) cfg = { night: night, on: false, players: null, over: {}, rev: cfg.rev || 0 };   // a new night starts clean
      var was = !!cfg.on;
      if (b.op === 'set') {
        if (b.on !== undefined) cfg.on = !!b.on;
        if (b.players !== undefined) cfg.players = b.players && b.players.length !== undefined ? b.players.map(String).filter(function (n) { return !GARB_EXCL_.test(n); }) : null;
        if (b.carry !== undefined) cfg.carry = garbNum_(b.carry) === null ? null : Math.max(0, garbNum_(b.carry));
      } else if (b.op === 'over') {
        var h = String(b.hole || ''); if (!h) return { ok: false, error: 'Which hole?' };
        cfg.over = cfg.over || {};
        var o = { fo: String(b.fo === undefined ? '' : b.fo), ct: String(b.ct === undefined ? '' : b.ct), lp: String(b.lp === undefined ? '' : b.lp) };
        if (!o.fo && !o.ct && !o.lp) delete cfg.over[h]; else cfg.over[h] = o;
      } else if (b.op === 'finish') cfg.closed = b.closed !== false;
      else return { ok: false, error: 'Unknown Garbage request' };
      cfg.rev = (cfg.rev || 0) + 1;
      apiProps_().setProperty(GARB_KEY_, JSON.stringify(cfg));
      CacheService.getScriptCache().remove('garb|state');
      if (was !== !!cfg.on) boardBust_();
    } finally { lock.releaseLock(); }
    var st = garbState_(ss);
    try { garbLogSave_(ss, st); } catch (e) { console.error(e); }
    return { ok: true, garbage: st };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
}
