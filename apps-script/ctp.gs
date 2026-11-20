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
// Challenges (Nov 20, Ty): when a hole has a leader on the green, everyone else may challenge or decline. When all have
// answered, each challenger draws a buy-in from 2 to (pot + 1) dollars, paid into the pot, no backing out. Challengers
// hit one shot each (hole order). If one beats the leader, the leader gets one free shot; the closest ball is then the
// leader. Either way a new challenge round is offered on the bigger pot; the hole ends when everyone declines (leader takes
// the pot). Any exact tie during a challenge is "one tie, all tie": the pot rolls over to a new hole, same order.
// st.ch while a challenge runs: { k (round), leader, ft, phase: 'offer'|'shoot'|'free', pot0 (pot when offered),
//   ans {name: 'yes'|'no'}, cost {name: dollars}, order [challengers], shots [], best [names closest among challengers],
//   bestFt, hist [{k, cost, shots, free, out}] }

function ctpNew_(players, now, rnd) {
  var st = { v: 2, on: true, id: String(now), started: now, rev: 0, n: 0, players: [], order: [], hole: null, pot: 0,
    wins: {}, lastWin: {}, seq: 0, money: {}, out: [], last: null, hist: [], need: '', ch: null };
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
  st.ch = null;
  order.forEach(function (p) { st.money[p] = (st.money[p] || 0) - 1; st.pot += 1; });
  st.need = '';
}

function ctpDrop_(st, p) {
  st.players = st.players.filter(function (x) { return x !== p; });
  st.order = st.order.filter(function (x) { return x !== p; });
  if (st.ch) {
    delete st.ch.ans[p];
    if (st.ch.phase === 'shoot' && !st.ch.shots.some(function (s) { return s.p === p; })) st.ch.order = st.ch.order.filter(function (x) { return x !== p; });
  }
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

/** The shots and hitting order that are live right now: the hole, the challengers, or the leader's free shot. */
function ctpActive_(st) {
  if (st.ch && st.ch.phase === 'shoot') return { order: st.ch.order, shots: st.ch.shots, kind: 'challenge' };
  if (st.ch && st.ch.phase === 'free') return { order: [st.ch.leader], shots: st.ch.shots, kind: 'free' };
  if (st.ch) return { order: [], shots: [], kind: 'offer' };
  return { order: st.order, shots: st.hole ? st.hole.shots : [], kind: 'hole' };
}
function ctpShotOf_(st, p) { return ctpActive_(st).shots.filter(function (s) { return s.p === p; })[0] || null; }
function ctpUp_(st) {
  if (!st.on || !st.hole) return '';
  var a = ctpActive_(st);
  for (var i = 0; i < a.order.length; i++) if (!ctpShotOf_(st, a.order[i])) return a.order[i];
  return '';
}
function ctpIn_(ft) { return Math.round(Number(ft) * 12); }   // ties are judged to the inch (as GSPro shows it)

/** Who can answer the current challenge offer: everyone in the game except the leader (and players leaving). */
function ctpEligible_(st) {
  if (!st.ch) return [];
  return st.order.filter(function (p) { return p !== st.ch.leader && st.out.indexOf(p) < 0 && st.players.indexOf(p) >= 0; });
}

/** Closest green ball so far (hole, or challenge round): { p, ft, tie: [names] } or null. */
function ctpLeader_(st) {
  if (st.ch) {
    var best = st.ch.phase === 'free' ? { p: st.ch.best[0], ft: st.ch.bestFt, tie: st.ch.best.length > 1 ? st.ch.best.slice() : [] } : { p: st.ch.leader, ft: st.ch.ft, tie: [] };
    if (st.ch.phase !== 'offer') {
      var g = st.ch.shots.filter(function (s) { return s.g === 1 && s.ft != null; });
      g.forEach(function (s) { if (ctpIn_(s.ft) < ctpIn_(best.ft)) best = { p: s.p, ft: s.ft, tie: [] }; else if (ctpIn_(s.ft) === ctpIn_(best.ft) && s.p !== best.p) best.tie = (best.tie.length ? best.tie : [best.p]).concat(s.p); });
    }
    return best;
  }
  var g2 = (st.hole ? st.hole.shots : []).filter(function (s) { return s.g === 1 && s.ft != null; });
  if (!g2.length) return null;
  var b2 = Math.min.apply(null, g2.map(function (s) { return ctpIn_(s.ft); }));
  var at = g2.filter(function (s) { return ctpIn_(s.ft) === b2; });
  return { p: at[0].p, ft: at[0].ft, tie: at.length > 1 ? at.map(function (s) { return s.p; }) : [] };
}

/** Greens from a set of shots that can still count: drops balls known to be farther than a known ball (full panel). */
function ctpLive_(shots) {
  var greens = shots.filter(function (s) { return s.g === 1; });
  var known = greens.filter(function (s) { return s.ft != null; });
  return greens.filter(function (s) {
    if (s.ft != null) return true;
    return !(s.over != null && known.some(function (k) { return ctpIn_(k.ft) <= ctpIn_(s.over); }));
  });
}

function ctpPush_(st, res, now) {   // tie: one tie, all tie. Pot rolls over, same order.
  res.r = 'tie';
  ctpFinish_(st, res, st.order.slice(), now);
}
function ctpWin_(st, res, w, ft, now, rnd) {
  res.r = 'win'; res.w = w; res.ft = ft; res.pot = st.pot;
  st.money[w] = (st.money[w] || 0) + st.pot;
  st.pot = 0;
  st.seq++; st.wins[w] = (st.wins[w] || 0) + 1; st.lastWin[w] = st.seq;
  ctpFinish_(st, res, ctpOrderAfterWin_(st, w, rnd), now);
}
function ctpFinish_(st, res, next, now) {
  if (res.pot == null) res.pot = st.pot;
  if (st.ch && st.ch.hist.length) res.ch = st.ch.hist;
  st.need = '';
  st.last = res;
  st.hist.push({ n: res.n, r: res.r, w: res.w || '', ft: res.ft == null ? null : res.ft, pot: res.pot, tied: res.tied || [], chal: res.ch ? res.ch.length : 0 });
  if (st.hist.length > CTP_HIST_) st.hist = st.hist.slice(-CTP_HIST_);
  ctpStartHole_(st, next, now);
}
function ctpOffer_(st, leader, ft, now) {
  var k = st.ch ? st.ch.k + 1 : 1, hist = st.ch ? st.ch.hist : [];
  st.ch = { k: k, leader: leader, ft: ft, phase: 'offer', pot0: st.pot, ans: {}, cost: {}, order: [], shots: [], best: [], bestFt: null, hist: hist, t: now };
}

/**
 * Move the hole along once everyone who is up has hit (or answered). Returns an event:
 *   { r: 'win'|'noqualy'|'tie', ... } when the hole is over, { e: 'offer' } when a challenge is offered,
 *   { e: 'draws' } when the buy-ins are drawn, { e: 'free' } when the leader gets his free shot, or null.
 */
function ctpResolve_(st, now, rnd) {
  if (!st.hole) return null;
  var res = { n: st.hole.n, t: now, shots: st.hole.shots.map(function (s) { return { p: s.p, g: s.g, ft: s.ft }; }) };
  if (st.ch) {
    var ch = st.ch;
    if (ch.phase === 'offer') {
      var el = ctpEligible_(st);
      if (el.some(function (p) { return !ch.ans[p]; })) return null;
      var yes = el.filter(function (p) { return ch.ans[p] === 'yes'; });
      if (!yes.length) { ctpWin_(st, res, ch.leader, ch.ft, now, rnd); return st.last; }
      yes.forEach(function (p) {   // each challenger's own draw: 2 .. pot + 1 dollars
        var c = 2 + Math.floor((rnd || Math.random)() * ch.pot0);
        ch.cost[p] = c; st.money[p] = (st.money[p] || 0) - c; st.pot += c;
      });
      ch.order = yes; ch.shots = []; ch.phase = 'shoot';
      return { e: 'draws', k: ch.k, cost: ch.cost, pot: st.pot, leader: ch.leader, ft: ch.ft };
    }
    if (ctpUp_(st)) return null;
    if (ch.shots.some(function (s) { return s.g == null; })) { st.need = 'green'; return null; }
    var live = ctpLive_(ch.shots);
    if (live.some(function (s) { return s.ft == null; })) { st.need = 'distance'; return null; }
    st.need = '';
    if (ch.phase === 'shoot') {
      var round = { k: ch.k, cost: ch.cost, shots: ch.shots.map(function (s) { return { p: s.p, g: s.g, ft: s.ft }; }) };
      if (!live.length) { ch.hist.push(round); ctpOffer_(st, ch.leader, ch.ft, now); return { e: 'offer', k: st.ch.k, held: true, leader: ch.leader, ft: ch.ft, pot: st.pot }; }
      var bi = Math.min.apply(null, live.map(function (s) { return ctpIn_(s.ft); }));
      var at = live.filter(function (s) { return ctpIn_(s.ft) === bi; });
      if (bi > ctpIn_(ch.ft)) { ch.hist.push(round); ctpOffer_(st, ch.leader, ch.ft, now); return { e: 'offer', k: st.ch.k, held: true, leader: ch.leader, ft: ch.ft, pot: st.pot }; }
      if (bi === ctpIn_(ch.ft)) { ch.hist.push(round); res.tied = [ch.leader].concat(at.map(function (s) { return s.p; })); res.ft = ch.ft; res.pot = st.pot; ctpPush_(st, res, now); return st.last; }
      round.beat = at.map(function (s) { return s.p; });
      ch.hist.push(round);
      ch.best = at.map(function (s) { return s.p; }); ch.bestFt = at[0].ft;
      ch.phase = 'free'; ch.shots = [];
      return { e: 'free', leader: ch.leader, best: ch.best, ft: ch.bestFt, pot: st.pot };
    }
    if (ch.phase === 'free') {
      var f = ch.shots[0];
      var last = ch.hist[ch.hist.length - 1]; if (last) last.free = f ? { g: f.g, ft: f.ft } : null;
      var cand = ch.best.map(function (p) { return { p: p, ft: ch.bestFt }; });
      if (f && f.g === 1 && f.ft != null) cand.push({ p: ch.leader, ft: f.ft });
      var m = Math.min.apply(null, cand.map(function (c) { return ctpIn_(c.ft); }));
      var top = cand.filter(function (c) { return ctpIn_(c.ft) === m; });
      if (top.length > 1) { res.tied = top.map(function (c) { return c.p; }); res.ft = top[0].ft; res.pot = st.pot; ctpPush_(st, res, now); return st.last; }
      var keep = top[0].p === ch.leader;
      ctpOffer_(st, top[0].p, top[0].ft, now);
      return { e: 'offer', k: st.ch.k, held: keep, retook: keep, leader: top[0].p, ft: top[0].ft, pot: st.pot };
    }
    return null;
  }
  if (ctpUp_(st)) return null;
  var shots = st.hole.shots.filter(function (s) { return st.order.indexOf(s.p) >= 0 || st.out.indexOf(s.p) >= 0; });
  if (shots.some(function (s) { return s.g == null; })) { st.need = 'green'; return null; }   // a shot we couldn't read
  var greens = ctpLive_(shots);
  res.pot = st.pot;
  if (!shots.some(function (s) { return s.g === 1; })) { res.r = 'noqualy'; ctpFinish_(st, res, st.order.slice(), now); return st.last; }
  if (greens.length > 1 && greens.some(function (s) { return s.ft == null; })) { st.need = 'distance'; return null; }
  st.need = '';
  var w, wft;
  if (greens.length === 1) {
    w = greens[0].p; wft = greens[0].ft;
    if (wft == null && st.order.some(function (p) { return p !== w && st.out.indexOf(p) < 0; })) { st.need = 'distance'; return null; }   // challengers need a number to beat
  }
  else {
    var best = Math.min.apply(null, greens.map(function (s) { return ctpIn_(s.ft); }));
    var top2 = greens.filter(function (s) { return ctpIn_(s.ft) === best; });
    if (top2.length > 1) { res.tied = top2.map(function (s) { return s.p; }); res.ft = top2[0].ft; ctpPush_(st, res, now); return st.last; }
    w = top2[0].p; wft = top2[0].ft;
  }
  // A leader on the green: offer the challenge (if anyone else is still in the game).
  st.ch = null;
  ctpOffer_(st, w, wft, now);
  if (!ctpEligible_(st).length) { ctpWin_(st, res, w, wft, now, rnd); return st.last; }
  return { e: 'offer', k: 1, leader: w, ft: wft, pot: st.pot };
}

/** Apply one change. b = { op, ... }. who = the signed-in player's name (players may answer only for themselves). */
function ctpApply_(st, b, isAdmin, now, rnd, who) {
  var op = String(b.op || ''), res = null;
  if (op === 'start') {
    if (!isAdmin) throw new Error('Only Ty can start CTP.');
    if (st && st.on) throw new Error('CTP is already running. End it first.');
    return { st: ctpNew_([].concat(b.players || []).map(String), now, rnd), res: null };
  }
  if (!st || !st.on) throw new Error('CTP isn\'t running.');
  if (st.ch === undefined) st.ch = null;
  var name = b.name == null ? '' : String(b.name);
  if (op === 'answer') {
    // Challenge or decline: a player for himself, Ty for anyone, before the buy-ins are drawn.
    if (!st.ch || st.ch.phase !== 'offer') throw new Error('No challenge is open right now.');
    if (!isAdmin && name !== who) throw new Error('You can only answer for yourself.');
    if (ctpEligible_(st).indexOf(name) < 0) throw new Error(name + ' can\'t challenge this one.');
    st.ch.ans[name] = b.yes ? 'yes' : 'no';
  } else if (op === 'continue') {
    if (!isAdmin) throw new Error('Only Ty can do that.');
    if (!st.ch || st.ch.phase !== 'offer') throw new Error('No challenge is open right now.');
    ctpEligible_(st).forEach(function (p) { if (!st.ch.ans[p]) st.ch.ans[p] = 'no'; });
  } else {
    if (op !== 'shot' && !isAdmin) throw new Error('Only Ty can change CTP.');
    var inGame = function (p) { return st.players.indexOf(p) >= 0; };
    var act = ctpActive_(st);
    if (op === 'shot') {
      // From the PC watcher (no name: the player who's up) or from Ty (name given; replaces that player's shot).
      if (act.kind === 'offer') throw new Error('Waiting on challenge answers.');
      var p = name || ctpUp_(st);
      if (!p) throw new Error('Everyone has already hit.');
      if (!inGame(p) && act.kind === 'hole') throw new Error(p + ' isn\'t in the game.');
      if (act.order.indexOf(p) < 0) throw new Error(p + ' isn\'t hitting right now.');
      if (!isAdmin && ctpShotOf_(st, p)) throw new Error(p + ' already hit.');
      var g = b.green === true || b.green === 1 ? 1 : b.green === false || b.green === 0 ? 0 : null;
      var ft = b.ft === '' || b.ft == null || isNaN(Number(b.ft)) ? null : Math.max(0, Number(b.ft));
      if (g !== 1) ft = null;
      var list = act.shots.filter(function (s) { return s.p !== p; });
      var shot = { p: p, g: g, ft: ft, src: isAdmin ? 'ty' : 'pc', t: now };
      if (b.surf != null) shot.surf = Number(b.surf);
      if (b.water) shot.water = 1;
      if (g === 1 && ft == null && b.over != null && !isNaN(Number(b.over))) shot.over = Number(b.over);   // farther than this (full panel)
      if (b.sp != null) shot.sp = Math.round(Number(b.sp) * 10) / 10;
      list.push(shot);
      if (act.kind === 'hole') st.hole.shots = list; else st.ch.shots = list;
    } else if (op === 'edit') {
      var s0 = ctpShotOf_(st, name);
      if (!s0) throw new Error(name + ' hasn\'t hit yet.');
      if (b.green !== undefined) s0.g = b.green === true || b.green === 1 ? 1 : b.green === false || b.green === 0 ? 0 : null;
      if (b.ft !== undefined) s0.ft = b.ft === '' || b.ft == null || isNaN(Number(b.ft)) ? null : Math.max(0, Number(b.ft));
      if (s0.g !== 1) s0.ft = null;
      if (s0.ft != null || s0.g !== 1) delete s0.over;
      s0.src = 'ty';
    } else if (op === 'void') {
      if (!ctpShotOf_(st, name)) throw new Error(name + ' hasn\'t hit yet.');
      var rest = act.shots.filter(function (s) { return s.p !== name; });
      if (act.kind === 'hole') st.hole.shots = rest; else st.ch.shots = rest;
    } else if (op === 'redo') {
      if (act.kind === 'hole') st.hole.shots = []; else st.ch.shots = [];   // everyone up hits again (the dollars stay in)
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
      var hit = st.hole.shots.some(function (s) { return s.p === name; }) || (st.ch && (st.ch.leader === name || st.ch.shots.some(function (s) { return s.p === name; })));
      if (hit) { if (st.out.indexOf(name) < 0) st.out.push(name); }   // keeps his shot (and any lead), gone next hole
      else ctpDrop_(st, name);                                        // forfeits this hole's dollar
    } else if (op === 'order') {
      var want = [].concat(b.order || []).map(String);
      if (want.length !== st.order.length || want.some(function (p) { return st.order.indexOf(p) < 0; })) throw new Error('The order has to list the same players.');
      st.order = want;
      if (st.ch && st.ch.phase === 'shoot') st.ch.order = want.filter(function (p) { return st.ch.order.indexOf(p) >= 0; });
    } else if (op === 'resolve') {
      // nothing to change: decide now (after Undo brought back a finished step for fixing)
    } else if (op === 'end') {
      st.on = false; st.ended = now;
      return { st: st, res: null };
    } else throw new Error('Unknown CTP action.');
  }
  var pre = (ctpUp_(st) || (st.ch && st.ch.phase === 'offer')) ? null : JSON.stringify(st);   // Undo comes back to here, with every shot kept
  res = ctpResolve_(st, now, rnd);
  return { st: st, res: res, pre: res ? pre : null };
}

/** What the app and the watcher see. */
function ctpViewOf_(st) {
  if (!st) return { on: false };
  var v = JSON.parse(JSON.stringify(st));
  if (v.ch === undefined) v.ch = null;
  v.up = ctpUp_(st);
  v.leader = ctpLeader_(st);
  var a = ctpActive_(st);
  v.phase = a.kind;
  v.next = v.up ? (function () { var i = a.order.indexOf(v.up); for (var k = i + 1; k < a.order.length; k++) if (!ctpShotOf_(st, a.order[k])) return a.order[k]; return ''; })() : '';
  if (st.ch) { v.ch.eligible = ctpEligible_(st); v.ch.min = 2; v.ch.max = st.ch.pot0 + 1; }
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
  try { return apiCtp0_(b); } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
}

function apiCtp0_(b) {
  var user = apiUser_(b.token), isAdmin = !!(user && user.admin);
  var isAgent = String(b.key || '') === AGENT_KEY_;
  if (b.op === 'state') return { ok: true, ctp: ctpView_() };
  var isPlayer = !!(user && (b.op === 'answer'));
  if (!isAdmin && !isAgent && !isPlayer) return { ok: false, code: user ? 'denied' : 'auth', error: user ? 'Only Ty can run CTP.' : 'Please sign in again.' };
  if (isAgent && !isAdmin && b.op !== 'shot') return { ok: false, error: 'The watcher can only report shots.' };
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
    var out = ctpApply_(st, b, isAdmin, Date.now(), Math.random, user ? user.name : '');
    out.st.rev = (st ? st.rev : 0) + 1;
    var s = JSON.stringify(out.st);
    if (s.length > 8500) { out.st.hist = out.st.hist.slice(-4); s = JSON.stringify(out.st); }
    for (var k = CTP_UNDO_N_ - 1; k > 0; k--) {
      var pv = props.getProperty('CTP_UNDO' + (k - 1));
      if (pv) props.setProperty('CTP_UNDO' + k, pv);
    }
    if (raw && b.op !== 'start') props.setProperty('CTP_UNDO0', out.pre || raw); else for (var u = 0; u < CTP_UNDO_N_; u++) props.deleteProperty('CTP_UNDO' + u);
    props.setProperty(CTP_KEY_, s);
    if (out.res && out.res.r) try { ctpLogHole_(out.st, out.res); } catch (e) { console.error(e); }
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
  (res.ch || []).forEach(function (c) {
    shots += ' | Challenge ' + c.k + ': ' + c.shots.map(function (x) { return x.p + ' ($' + (c.cost || {})[x.p] + ') ' + (x.g === 1 ? (x.ft == null ? 'green' : ctpFt_(x.ft)) : 'missed'); }).join(', ') +
      (c.free ? '; free shot ' + (c.free.g === 1 && c.free.ft != null ? ctpFt_(c.free.ft) : 'missed') : '');
  });
  sh.appendRow([new Date(res.t), st.id, res.n, label, res.w || (res.tied || []).join(' & '), res.ft == null ? '' : ctpFt_(res.ft), res.pot, shots]);
}
