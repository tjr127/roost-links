// ===================================================================
// Closest to the Pin side game (added Nov 20, 2026). Played after the league round, in GSPro practice mode with Quick CTP on.
// Rules (Ty):
// - Everyone in the game puts in $1 per hole and gets exactly one shot. Closest ball ON THE GREEN wins the pot.
// - No qualy (nobody on the green) or a tie for closest ("one tie, all tie"): pot carries over, new hole, everyone puts in
//   another $1, same order.
// - After a win: the winner goes first (and picks the distance), then the others with wins tonight (most wins first,
//   ties to the more recent win), then everyone with no wins in random order. The first hole is random.
// - Players can be added or removed at any time; a player removed before hitting forfeits that hole's dollar, a player
//   removed after hitting keeps that shot and drops out at the next hole.
// State: Script Property CTP_STATE (JSON), with CTP_UNDO0..2 holding the last three states for Undo.
// Each finished hole is also written to the "CTP Log" tab.
// Wiring (Web.gs):
//   - apiGet_: `else if (p.api === 'ctp') out = { ok: true, ctp: ctpView_() };`  (fast: no board build)
//   - doPost (perf.gs part): `if (isAction && b.action === 'ctp') return apiJson_(apiCtp_(b));` with 'ctp' added to the
//     list of actions that don't bust the board (start/end bust it themselves).
//   - getBoardData: `try { d.ctp = ctpBrief_(); } catch (x) { console.error(x); }` so the app knows to show the tab.
// Writers: Ty from the app (token, admin) or the CTP watcher on the sim PC (key = AGENT_KEY_, shot reports only).
// ===================================================================
var CTP_KEY_ = 'CTP_STATE', CTP_UNDO_N_ = 3, CTP_HIST_ = 12, CTP_LOG_TAB_ = 'CTP Log';

// ---------- pure game logic (no Google services; tested in Node) ----------

function ctpNew_(players, now, rnd) {
  var st = { v: 1, on: true, id: String(now), started: now, rev: 0, n: 0, players: [], order: [], hole: null, pot: 0,
    wins: {}, lastWin: {}, seq: 0, money: {}, out: [], last: null, hist: [], need: '' };
  players.forEach(function (p) { if (st.players.indexOf(p) < 0) { st.players.push(p); st.money[p] = 0; } });
  if (st.players.length < 2) throw new Error('Pick at least two players.');
  ctpStartHole_(st, ctpShuffle_(st.players.slice(), rnd), now);
  return st;
}

function ctpShuffle_(a, rnd) {
  rnd = rnd || Math.random;
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/** New hole with this order: everyone in it puts in $1. */
function ctpStartHole_(st, order, now) {
  st.out.forEach(function (p) { ctpDrop_(st, p); });
  st.out = [];
  order = order.filter(function (p) { return st.players.indexOf(p) >= 0; });
  st.players.forEach(function (p) { if (order.indexOf(p) < 0) order.push(p); });
  st.n++;
  st.order = order;
  st.hole = { n: st.n, shots: [], ante: order.slice(), t: now };
  order.forEach(function (p) { st.money[p] = (st.money[p] || 0) - 1; st.pot += 1; });
  st.need = '';
}

function ctpDrop_(st, p) {
  st.players = st.players.filter(function (x) { return x !== p; });
  st.order = st.order.filter(function (x) { return x !== p; });
}

/** Order after a win: winner, then others with wins (most first, ties to the latest win), then the rest at random. */
function ctpOrderAfterWin_(st, winner, rnd) {
  var others = st.players.filter(function (p) { return p !== winner && st.out.indexOf(p) < 0; });
  var won = others.filter(function (p) { return st.wins[p] > 0; }).sort(function (a, b) {
    return (st.wins[b] - st.wins[a]) || ((st.lastWin[b] || 0) - (st.lastWin[a] || 0));
  });
  var rest = ctpShuffle_(others.filter(function (p) { return !(st.wins[p] > 0); }), rnd);
  return [winner].concat(won, rest);
}

function ctpShotOf_(st, p) { return st.hole ? st.hole.shots.filter(function (s) { return s.p === p; })[0] || null : null; }
function ctpUp_(st) {
  if (!st.on || !st.hole) return '';
  for (var i = 0; i < st.order.length; i++) if (!ctpShotOf_(st, st.order[i])) return st.order[i];
  return '';
}
function ctpIn_(ft) { return Math.round(Number(ft) * 12); }   // ties are judged to the inch (as GSPro shows it)

/** Closest green ball on the current hole so far: { p, ft, tie: [names] } or null. */
function ctpLeader_(st) {
  var g = (st.hole ? st.hole.shots : []).filter(function (s) { return s.g === 1 && s.ft != null; });
  if (!g.length) return null;
  var best = Math.min.apply(null, g.map(function (s) { return ctpIn_(s.ft); }));
  var at = g.filter(function (s) { return ctpIn_(s.ft) === best; });
  return { p: at[0].p, ft: at[0].ft, tie: at.length > 1 ? at.map(function (s) { return s.p; }) : [] };
}

/** When everyone in the order has hit: decide the hole and start the next one. Returns the result or null. */
function ctpResolve_(st, now, rnd) {
  if (!st.hole || ctpUp_(st)) return null;
  var shots = st.hole.shots.filter(function (s) { return st.order.indexOf(s.p) >= 0 || st.out.indexOf(s.p) >= 0; });
  var greens = shots.filter(function (s) { return s.g === 1; });
  var unknown = shots.filter(function (s) { return s.g == null; });
  if (unknown.length) { st.need = 'green'; return null; }          // a shot we couldn't read: Ty says green or not
  var res = { n: st.hole.n, pot: st.pot, t: now, shots: shots.map(function (s) { return { p: s.p, g: s.g, ft: s.ft }; }) };
  if (!greens.length) res.r = 'noqualy';
  else if (greens.length === 1) { res.r = 'win'; res.w = greens[0].p; res.ft = greens[0].ft; }
  else {
    if (greens.some(function (s) { return s.ft == null; })) { st.need = 'distance'; return null; }
    var best = Math.min.apply(null, greens.map(function (s) { return ctpIn_(s.ft); }));
    var at = greens.filter(function (s) { return ctpIn_(s.ft) === best; });
    if (at.length > 1) { res.r = 'tie'; res.tied = at.map(function (s) { return s.p; }); res.ft = at[0].ft; }
    else { res.r = 'win'; res.w = at[0].p; res.ft = at[0].ft; }
  }
  st.need = '';
  var next;
  if (res.r === 'win') {
    st.money[res.w] = (st.money[res.w] || 0) + st.pot;
    st.pot = 0;
    st.seq++; st.wins[res.w] = (st.wins[res.w] || 0) + 1; st.lastWin[res.w] = st.seq;
    next = ctpOrderAfterWin_(st, res.w, rnd);
  } else next = st.order.slice();   // no qualy / tie: same order
  st.last = res;
  st.hist.push({ n: res.n, r: res.r, w: res.w || '', ft: res.ft == null ? null : res.ft, pot: res.pot, tied: res.tied || [] });
  if (st.hist.length > CTP_HIST_) st.hist = st.hist.slice(-CTP_HIST_);
  ctpStartHole_(st, next, now);
  return res;
}

/** Apply one change. b = { op, ... }. Throws on bad input. Returns { st, res } (res = finished hole, if any). */
function ctpApply_(st, b, isAdmin, now, rnd) {
  var op = String(b.op || ''), res = null;
  if (op === 'start') {
    if (!isAdmin) throw new Error('Only Ty can start CTP.');
    if (st && st.on) throw new Error('CTP is already running. End it first.');
    return { st: ctpNew_([].concat(b.players || []).map(String), now, rnd), res: null };
  }
  if (!st || !st.on) throw new Error('CTP isn\'t running.');
  if (op !== 'shot' && !isAdmin) throw new Error('Only Ty can change CTP.');
  var name = b.name == null ? '' : String(b.name);
  var inGame = function (p) { return st.players.indexOf(p) >= 0; };
  if (op === 'shot') {
    // From the PC watcher (no name: the player who's up) or from Ty (name given; replaces that player's shot).
    var p = name || ctpUp_(st);
    if (!p) throw new Error('Everyone has already hit this hole.');
    if (!inGame(p)) throw new Error(p + ' isn\'t in the game.');
    if (!isAdmin && ctpShotOf_(st, p)) throw new Error(p + ' already hit.');
    var g = b.green === true || b.green === 1 ? 1 : b.green === false || b.green === 0 ? 0 : null;
    var ft = b.ft === '' || b.ft == null || isNaN(Number(b.ft)) ? null : Math.max(0, Number(b.ft));
    if (g !== 1) ft = null;
    st.hole.shots = st.hole.shots.filter(function (s) { return s.p !== p; });
    var shot = { p: p, g: g, ft: ft, src: isAdmin ? 'ty' : 'pc', t: now };
    if (b.surf != null) shot.surf = Number(b.surf);
    if (b.water) shot.water = 1;
    if (b.sp != null) shot.sp = Math.round(Number(b.sp) * 10) / 10;
    st.hole.shots.push(shot);
  } else if (op === 'edit') {
    var s0 = ctpShotOf_(st, name);
    if (!s0) throw new Error(name + ' hasn\'t hit yet.');
    if (b.green !== undefined) s0.g = b.green === true || b.green === 1 ? 1 : b.green === false || b.green === 0 ? 0 : null;
    if (b.ft !== undefined) s0.ft = b.ft === '' || b.ft == null || isNaN(Number(b.ft)) ? null : Math.max(0, Number(b.ft));
    if (s0.g !== 1) s0.ft = null;
    s0.src = 'ty';
  } else if (op === 'void') {
    if (!ctpShotOf_(st, name)) throw new Error(name + ' hasn\'t hit yet.');
    st.hole.shots = st.hole.shots.filter(function (s) { return s.p !== name; });
  } else if (op === 'redo') {
    st.hole.shots = [];   // e.g. GSPro hiccup: everyone hits this hole again (the dollars stay in)
    st.need = '';
  } else if (op === 'add') {
    if (!name) throw new Error('Pick a player.');
    if (inGame(name)) { st.out = st.out.filter(function (x) { return x !== name; }); }
    else {
      st.players.push(name);
      if (st.money[name] == null) st.money[name] = 0;
      st.order.push(name);
      st.hole.ante.push(name);
      st.money[name] -= 1; st.pot += 1;
    }
  } else if (op === 'remove') {
    if (!inGame(name)) throw new Error(name + ' isn\'t in the game.');
    if (st.players.length - st.out.length <= 1 && st.out.indexOf(name) < 0) throw new Error('That would leave nobody. End CTP instead.');
    if (ctpShotOf_(st, name)) { if (st.out.indexOf(name) < 0) st.out.push(name); }   // keeps this shot, gone next hole
    else ctpDrop_(st, name);                                                        // forfeits this hole's dollar
  } else if (op === 'order') {
    var want = [].concat(b.order || []).map(String);
    if (want.length !== st.order.length || want.some(function (p) { return st.order.indexOf(p) < 0; })) throw new Error('The order has to list the same players.');
    st.order = want;
  } else if (op === 'resolve') {
    // nothing to change: decide the hole now (after Undo brought back a finished hole for fixing)
  } else if (op === 'end') {
    st.on = false; st.ended = now;
    return { st: st, res: null };
  } else throw new Error('Unknown CTP action.');
  var pre = ctpUp_(st) ? null : JSON.stringify(st);   // everyone has hit: Undo comes back to here, with every shot kept
  res = ctpResolve_(st, now, rnd);
  return { st: st, res: res, pre: res ? pre : null };
}

/** What the app and the watcher see. */
function ctpViewOf_(st) {
  if (!st) return { on: false };
  var v = JSON.parse(JSON.stringify(st));
  v.up = ctpUp_(st);
  v.leader = ctpLeader_(st);
  v.next = v.up ? (function () { var i = st.order.indexOf(v.up); for (var k = i + 1; k < st.order.length; k++) if (!ctpShotOf_(st, st.order[k])) return st.order[k]; return ''; })() : '';
  return v;
}

function ctpFt_(ft) {
  if (ft == null) return '';
  var inch = ctpIn_(ft), f = Math.floor(inch / 12), i = inch % 12;
  return f + '\'' + i + '"';
}

// ---------- Google side ----------

function ctpLoad_() {
  var raw = apiProps_().getProperty(CTP_KEY_);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function ctpView_() { return ctpViewOf_(ctpLoad_()); }
function ctpBrief_() { var st = ctpLoad_(); return { on: !!(st && st.on), rev: st ? st.rev : 0 }; }

function apiCtp_(b) {
  var user = apiUser_(b.token), isAdmin = !!(user && user.admin);
  var isAgent = String(b.key || '') === AGENT_KEY_;
  if (b.op === 'state') return { ok: true, ctp: ctpView_() };
  if (!isAdmin && !isAgent) return { ok: false, code: user ? 'denied' : 'auth', error: user ? 'Only Ty can run CTP.' : 'Please sign in again.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var props = apiProps_(), raw = props.getProperty(CTP_KEY_), st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (e) {}
    if (b.op === 'undo') {
      if (!isAdmin) return { ok: false, error: 'Only Ty can undo.' };
      var prev = props.getProperty('CTP_UNDO0');
      if (!prev) return { ok: false, error: 'Nothing to undo.' };
      for (var i = 0; i < CTP_UNDO_N_ - 1; i++) {
        var nx = props.getProperty('CTP_UNDO' + (i + 1));
        if (nx) props.setProperty('CTP_UNDO' + i, nx); else props.deleteProperty('CTP_UNDO' + i);
      }
      props.deleteProperty('CTP_UNDO' + (CTP_UNDO_N_ - 1));
      var back = JSON.parse(prev);
      back.rev = (st ? st.rev : 0) + 1;
      props.setProperty(CTP_KEY_, JSON.stringify(back));
      if (!!(st && st.on) !== !!back.on) boardBust_();
      return { ok: true, ctp: ctpViewOf_(back), undone: true };
    }
    var was = !!(st && st.on);
    var out = ctpApply_(st, b, isAdmin, Date.now(), Math.random);
    out.st.rev = (st ? st.rev : 0) + 1;
    var s = JSON.stringify(out.st);
    if (s.length > 8500) { out.st.hist = out.st.hist.slice(-4); s = JSON.stringify(out.st); }
    for (var k = CTP_UNDO_N_ - 1; k > 0; k--) {
      var pv = props.getProperty('CTP_UNDO' + (k - 1));
      if (pv) props.setProperty('CTP_UNDO' + k, pv);
    }
    if (raw && b.op !== 'start') props.setProperty('CTP_UNDO0', out.pre || raw); else for (var u = 0; u < CTP_UNDO_N_; u++) props.deleteProperty('CTP_UNDO' + u);
    props.setProperty(CTP_KEY_, s);
    if (out.res) try { ctpLogHole_(out.st, out.res); } catch (e) { console.error(e); }
    if (was !== out.st.on) boardBust_();
    return { ok: true, ctp: ctpViewOf_(out.st), result: out.res };
  } finally { lock.releaseLock(); }
}

/** One row per finished hole on the CTP Log tab. */
function ctpLogHole_(st, res) {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(LEAGUE_SHEET_ID);
  var sh = ss.getSheetByName(CTP_LOG_TAB_);
  if (!sh) {
    sh = ss.insertSheet(CTP_LOG_TAB_);
    sh.appendRow(['Time', 'Game', 'Hole', 'Result', 'Winner', 'Distance', 'Pot', 'Shots (in order)']);
    sh.setFrozenRows(1);
  }
  var label = { win: 'Win', noqualy: 'No qualy', tie: 'Tie (push)' }[res.r] || res.r;
  var shots = res.shots.map(function (s) { return s.p + ': ' + (s.g === 1 ? (s.ft == null ? 'green' : ctpFt_(s.ft)) : 'missed'); }).join(' · ');
  sh.appendRow([new Date(res.t), st.id, res.n, label, res.w || (res.tied || []).join(' & '), res.ft == null ? '' : ctpFt_(res.ft), res.pot, shots]);
}
