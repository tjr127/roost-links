/*
 * Closest to the Pin side game (Nov 20, 2026). Rules and server: apps-script/ctp.gs.
 * - CTP tab: hidden until Ty starts a CTP game (data.ctp.on, or the fresh state fetched here) and gone after he ends it.
 *   Shows who's up, the order with each shot, the leader, the pot, last hole's result, and wins / money tonight.
 * - Ty (admin) runs it from his phone: Admin > CTP to pick players and start; in the CTP tab he can enter or fix a shot,
 *   void a shot, add / remove players, change the order, re-hit the hole, undo, and end the game.
 * - While the CTP tab (or Admin > CTP) is open, the game state is fetched every 3 seconds with ?api=ctp
 *   (fast: it doesn't wait for the league board).
 */
(function () {
  var st = null, rev = -1, timer = null, busy = false, msg = '', err = false;
  var open = '';            // admin: the player row that's expanded
  var pick = null;          // admin: players picked for a new game { name: true }
  var confirmEnd = false;
  var lastTab = '';

  function e(s) { return esc(s); }
  function admin() { var a = window.RL && RL.user(); return !!(a && a.admin); }
  function on() { return !!(st ? st.on : (window.data && data.ctp && data.ctp.on)); }
  window.ctpOn = on;
  function players() { var en = window.data && window.data.entry; return (en && en.players) || []; }
  function tonight() { var all = players().map(function (p) { return p.name; }); return ((window.data && window.data.cards) || []).map(function (c) { return c.name; }).filter(function (nm) { return all.indexOf(nm) >= 0; }); }
  window.ctpInfo = function () { return on() ? { on: true, hole: st ? st.n : null, pot: st ? st.pot : null } : { on: false }; };
  function money(v) { v = Number(v) || 0; return (v < 0 ? '−$' : v > 0 ? '+$' : '$') + Math.abs(v); }
  function ft(x) { if (x == null) return ''; var i = Math.round(Number(x) * 12), f = Math.floor(i / 12); return f ? f + '′' + (i % 12) + '″' : (i % 12) + '″'; }   // under a foot: inches only
  function liveShots() { return st && st.ch ? (st.ch.phase === 'offer' ? [] : st.ch.shots) : (st && st.hole ? st.hole.shots : []); }
  function shotOf(p) { return liveShots().filter(function (s) { return s.p === p; })[0] || null; }
  function holeShotOf(p) { return st && st.hole ? st.hole.shots.filter(function (s) { return s.p === p; })[0] || null : null; }
  function me() { var a = window.RL && RL.user(); return a ? a.name : ''; }

  // ---------- data ----------
  function fetchState() {
    if (!window.RL) return;
    RL.get('ctp').then(function (j) { take(j.ctp); }, function () {});
  }
  function take(c) {
    if (!c) return;
    var was = on();
    st = c;
    if (c.rev !== rev || !document.getElementById('ctpbody').innerHTML) { rev = c.rev; draw(); }
    if (was !== on() && window.updateNav) updateNav();
  }
  function act(body, okMsg) {
    if (busy) return;
    var a = RL.user(); if (!a) return;
    busy = true; msg = 'Saving…'; err = false; draw();
    body.action = 'ctp'; body.token = a.token;
    RL.post(body).then(function (j) {
      busy = false; msg = okMsg || ''; err = false;
      if (j.ctp) { st = j.ctp; rev = j.ctp.rev; }
      draw(); if (window.updateNav) updateNav();
    }, function (x) {
      busy = false; msg = x.message || 'That didn\'t save. Try again.'; err = true; draw();
    });
  }
  function poll(want) {
    if (want && !timer) { fetchState(); timer = setInterval(function () { if (!document.hidden) fetchState(); }, 3000); }
    if (!want && timer) { clearInterval(timer); timer = null; }
  }

  // Called by the page when the tab changes, and on every board refresh.
  window.ctpShown = function (tab) { lastTab = tab; poll(tab === 'ctp' || tab === 'adminctp'); draw(); };
  window.renderCtp = function (d) {
    if (d && d.ctp && ((!st && d.ctp.on) || (st && (d.ctp.rev > st.rev || d.ctp.on !== !!st.on)))) fetchState();   // the board says something changed
    draw();
  };
  document.addEventListener('visibilitychange', function () { if (!document.hidden && timer) fetchState(); });

  // ---------- drawing ----------
  function draw() {
    drawTab();
    drawAdmin();
  }

  function resultLine(r) {
    if (!r) return '';
    var chal = r.chal || (r.ch ? r.ch.length : 0), cx = chal ? ' after ' + chal + ' challenge' + (chal > 1 ? 's' : '') : '';
    if (r.r === 'win') return '<b>' + e(r.w) + '</b> won hole ' + r.n + (r.ft != null ? ' at ' + ft(r.ft) : '') + cx + ' and takes <b>$' + r.pot + '</b>';
    if (r.r === 'tie') return 'Hole ' + r.n + ': <b>' + e((r.tied || []).join(' & ')) + '</b> tied at ' + ft(r.ft) + cx + '. One tie, all tie: pot carries ($' + r.pot + ')';
    return 'Hole ' + r.n + ': <b>no qualy</b>. Nobody on the green, pot carries ($' + r.pot + ')';
  }

  function statusOf(p) {
    var s = shotOf(p), lead = st.leader;
    if (!s) return p === st.up ? '<span class="ctp-st up">Up</span>' : '<span class="ctp-st wait">–</span>';
    if (s.g === 1) {
      var best = lead && (lead.p === p || (lead.tie || []).indexOf(p) >= 0);
      return '<span class="ctp-st green' + (best ? ' best' : '') + '">' + (s.ft != null ? ft(s.ft) : s.over != null ? 'Green, over ' + ft(s.over) : 'Green, distance?') + '</span>';
    }
    if (s.g === 0) return '<span class="ctp-st miss">' + (s.water ? 'Water' : 'Missed') + '</span>';
    return '<span class="ctp-st wait">Green or not?</span>';
  }

  function statusOfShot(s, p) {
    if (!s) return '<span class="ctp-st wait">–</span>';
    if (s.g === 1) return '<span class="ctp-st green' + (st.ch && st.ch.leader === p && st.ch.k === 1 && st.ch.phase === 'offer' ? ' best' : '') + '">' + (s.ft != null ? ft(s.ft) : 'Green') + '</span>';
    return '<span class="ctp-st miss">' + (s.water ? 'Water' : 'Missed') + '</span>';
  }

  // The challenge: answers (offer), challengers and their buy-ins (shoot), the leader's free shot (free).
  function challengeCard(A, ch) {
    var html = '<h2>' + (ch.phase === 'lead' ? 'LEADER\'S CALL' : ch.fixed ? '$' + ch.fixed + ' CHALLENGE' : 'CHALLENGE ' + ch.k) + '</h2><div class="card ctp-card ctp-chal">', mine = me();
    if (ch.phase === 'lead') {
      // The leader (or Ty) chooses: take the pot, or a flat $1 / $2 challenge.
      if (A || mine === ch.leader) {
        html += '<div class="ctp-p"><span class="ctp-name">' + e(ch.leader) + (mine === ch.leader ? ' <i>you</i>' : '') + '</span><span class="ctp-st up">Choosing</span></div>' +
          '<div class="ctp-btns ctp-ans"><button type="button" class="ctp-b pri" data-ctp="lead0"' + (busy ? ' disabled' : '') + '>Take the $' + st.pot + '</button>' +
          '<button type="button" class="ctp-b" data-ctp="lead1"' + (busy ? ' disabled' : '') + '>$1 challenge</button>' +
          '<button type="button" class="ctp-b" data-ctp="lead2"' + (busy ? ' disabled' : '') + '>$2 challenge</button></div>';
      } else html += '<div class="ctp-help">Waiting on ' + e(ch.leader) + ': take the pot, or a $1 / $2 challenge.</div>';
    } else if (ch.phase === 'offer') {
      var el = ch.eligible || [];
      el.forEach(function (p) {
        var a = ch.ans[p], can = A || p === mine;
        html += '<div class="ctp-p"><span class="ctp-name">' + e(p) + (p === mine ? ' <i>you</i>' : '') + '</span>' +
          (a === 'yes' ? '<span class="ctp-st up">Challenging</span>' : a === 'no' ? '<span class="ctp-st wait">Declined</span>' : '<span class="ctp-st wait">Deciding…</span>') + '</div>';
        if (can) html += '<div class="ctp-btns ctp-ans"><button type="button" class="ctp-b' + (a === 'yes' ? ' pri' : '') + '" data-ctp="chyes" data-v="' + e(p) + '"' + (busy ? ' disabled' : '') + '>Challenge</button>' +
          '<button type="button" class="ctp-b' + (a === 'no' ? ' sel' : '') + '" data-ctp="chno" data-v="' + e(p) + '"' + (busy ? ' disabled' : '') + '>Decline</button></div>';
      });
      if (!el.length) html += '<div class="empty">Nobody left to challenge.</div>';
      if (A) html += '<button type="button" class="en-save ctp-go" data-ctp="chgo"' + (busy ? ' disabled' : '') + '>Continue (anyone who hasn\'t answered declines)</button>';
      else if (el.indexOf(mine) < 0) html += '<div class="ctp-help">' + (mine === ch.leader ? 'You\'re the leader. Sit tight.' : 'Waiting on everyone to answer.') + '</div>';
    } else {
      var who = ch.phase === 'free' ? [ch.leader] : ch.order;
      if (ch.phase === 'free') html += '<div class="ctp-help">Challengers: ' + Object.keys(ch.cost).map(function (p) { return e(p) + ' $' + ch.cost[p]; }).join(' · ') + '</div>';
      if (A && ch.phase === 'shoot' && (ch.hidden || []).length) html += '<button type="button" class="ctp-b ctp-reveal" data-ctp="reveal"' + (busy ? ' disabled' : '') + '>Reveal all buy-ins now</button>';
      who.forEach(function (p, i) {
        var s = shotOf(p);
        html += '<div class="ctp-p' + (p === st.up ? ' isup' : '') + (A ? ' tap' : '') + '"' + (A ? ' data-ctp="open" data-v="' + e(p) + '"' : '') + '><span class="ctp-n">' + (i + 1) + '</span><span class="ctp-name">' + e(p) +
          ' <i>' + (ch.phase === 'free' ? 'free shot' : ch.cost[p] == null ? 'spinning the randomizer…' : 'paid $' + ch.cost[p] + (ch.fixed ? ' flat' : '')) + '</i></span>' + statusOf(p) + '</div>';
        if (A && open === p) html += adminRow(p, i, s, true);
      });
    }
    if (!A && msg) html += '<div class="esw-msg' + (err ? ' err' : '') + '">' + e(msg) + '</div>';
    return html + '</div>';
  }

  function drawTab() {
    var box = document.getElementById('ctpbody'); if (!box) return;
    if (!st || !st.on) {
      box.innerHTML = '<div class="card ctp-card"><div class="empty">' + (st && st.ended ? 'CTP is over for tonight.' : 'No CTP game right now.') + '</div></div>' + (st && st.ended ? ledger() : '');
      return;
    }
    var A = admin(), h = st.hole || { n: st.n, shots: [] };
    var up = st.up, first = st.order[0], picks = st.last && st.last.r === 'win' && st.last.w === first && !h.shots.length;
    var html = '<div class="card ctp-card ctp-head"><div class="ctp-row1"><span class="ctp-hole">Hole ' + h.n + '</span><span class="ctp-pot">Pot $' + st.pot + '</span></div>';
    var ch = st.ch;
    if (ch && ch.phase === 'lead') {
      html += '<div class="ctp-up chal"><small>No challengers</small>' + e(ch.leader) + '\'s call</div>' +
        '<div class="ctp-sub">' + e(ch.leader) + ' leads at ' + ft(ch.ft) + '. He can take the $' + st.pot + ' pot, or put up a flat $1 or $2 challenge to everyone else.</div>';
    } else if (ch && ch.phase === 'offer' && ch.fixed) {
      html += '<div class="ctp-up chal"><small>' + e(ch.leader) + '\'s $' + ch.fixed + ' challenge</small>' + e(ch.leader) + ' leads at ' + ft(ch.ft) + '</div>' +
        '<div class="ctp-sub">Anyone can have another go for a flat <b>$' + ch.fixed + '</b>. If nobody takes it, ' + e(ch.leader) + ' wins the pot.</div>';
    } else if (ch && ch.phase === 'offer') {
      html += '<div class="ctp-up chal"><small>Challenge round ' + ch.k + '</small>' + e(ch.leader) + ' leads at ' + ft(ch.ft) + '</div>' +
        '<div class="ctp-sub">Think you can get closer? One more shot costs a random <b>$' + ch.min + ' to $' + ch.max + '</b>, drawn after everyone answers. No backing out once it\'s drawn.</div>';
    } else if (ch && ch.phase === 'shoot' && up) {
      html += '<div class="ctp-up chal"><small>Challenger up · ' + (ch.cost[up] == null ? 'buy-in spinning…' : 'paid $' + ch.cost[up]) + '</small>' + e(up) + '</div>' +
        '<div class="ctp-sub">Has to beat ' + e(ch.leader) + ' at ' + ft(ch.ft) + '.' + (st.next ? ' On deck: ' + e(st.next) + '.' : '') + '</div>';
    } else if (ch && ch.phase === 'free' && up) {
      html += '<div class="ctp-up chal"><small>Free shot</small>' + e(up) + '</div>' +
        '<div class="ctp-sub">' + e(up) + ' was beaten by ' + e(ch.best.join(' & ')) + ' at ' + ft(ch.bestFt) + '. One free shot to take it back.</div>';
    } else if (up) {
      html += '<div class="ctp-up"><small>Up now</small>' + e(up) + '</div>' +
        (picks && up === first ? '<div class="ctp-sub">' + e(first) + ' won the last hole: picks the distance and hits first.</div>' : '') +
        (st.next ? '<div class="ctp-sub">On deck: ' + e(st.next) + '</div>' : '');
    } else if (st.need === 'distance') html += '<div class="ctp-up wait">Waiting for a distance</div><div class="ctp-sub">More than one ball is on the green' + (A ? '. Enter the missing distance below.' : '. Ty is entering it.') + '</div>';
    else if (st.need === 'green') html += '<div class="ctp-up wait">Green or not?</div><div class="ctp-sub">A shot couldn\'t be read' + (A ? '. Mark it below.' : '. Ty is checking it.') + '</div>';
    else if (!ch) html += '<div class="ctp-up wait">Everyone has hit</div>' + (A ? '<button type="button" class="en-save ctp-go" data-ctp="resolve"' + (busy ? ' disabled' : '') + '>Decide this hole</button>' : '');
    if (st.leader && !(ch && (ch.phase === 'offer' || ch.phase === 'lead'))) html += '<div class="ctp-lead">Leader: <b>' + e(st.leader.tie.length ? st.leader.tie.join(' & ') + ' (tied)' : st.leader.p) + '</b> ' + ft(st.leader.ft) + '</div>';
    if (st.last) html += '<div class="ctp-last ' + st.last.r + '">' + resultLine(st.last) + '</div>';
    html += '</div>';

    if (ch) html += challengeCard(A, ch);
    // Order and shots
    html += '<h2>' + (ch ? 'HOLE ' + h.n + ' SHOTS' : 'ORDER') + '</h2><div class="card ctp-card">';
    st.order.forEach(function (p, i) {
      var s = ch ? holeShotOf(p) : shotOf(p), leaving = (st.out || []).indexOf(p) >= 0, tap = A && !ch;
      html += '<div class="ctp-p' + (p === up && !ch ? ' isup' : '') + (tap ? ' tap' : '') + '"' + (tap ? ' data-ctp="open" data-v="' + e(p) + '"' : '') + '>' +
        '<span class="ctp-n">' + (i + 1) + '</span><span class="ctp-name">' + e(p) + (st.wins[p] ? ' <i>' + st.wins[p] + (st.wins[p] > 1 ? ' wins' : ' win') + '</i>' : '') + (leaving ? ' <i>leaving after this hole</i>' : '') + '</span>' + (ch ? statusOfShot(s, p) : statusOf(p)) + '</div>';
      if (tap && open === p) html += adminRow(p, i, s);
    });
    html += '</div>';
    if (A) html += adminBar();
    html += ledger() + history();
    box.innerHTML = html;
  }

  function adminRow(p, i, s, chal) {
    var fIn = s && s.ft != null ? Math.floor(Math.round(s.ft * 12) / 12) : '', iIn = s && s.ft != null ? Math.round(s.ft * 12) % 12 : '';
    return '<div class="ctp-edit">' +
      '<div class="ctp-k">' + e(p) + (s ? ': fix this shot' : ': enter a shot by hand') + '</div>' +
      '<div class="ctp-dist"><input type="number" inputmode="numeric" min="0" max="300" id="ctpft" placeholder="ft" value="' + fIn + '"><span>ft</span>' +
      '<input type="number" inputmode="numeric" min="0" max="11" id="ctpin" placeholder="in" value="' + iIn + '"><span>in</span>' +
      '<button type="button" class="ctp-b pri" data-ctp="green" data-v="' + e(p) + '">On the green</button></div>' +
      '<div class="ctp-btns"><button type="button" class="ctp-b" data-ctp="miss" data-v="' + e(p) + '">Missed the green</button>' +
      (s ? '<button type="button" class="ctp-b" data-ctp="void" data-v="' + e(p) + '">Void shot (hits again)</button>' : '') + '</div>' +
      (chal ? '' : '<div class="ctp-btns"><button type="button" class="ctp-b" data-ctp="up" data-v="' + e(p) + '"' + (i === 0 ? ' disabled' : '') + '>Move up</button>' +
      '<button type="button" class="ctp-b" data-ctp="down" data-v="' + e(p) + '"' + (i === st.order.length - 1 ? ' disabled' : '') + '>Move down</button>' +
      '<button type="button" class="ctp-b warn" data-ctp="remove" data-v="' + e(p) + '">Remove</button></div>') + '</div>';
  }

  function adminBar() {
    var out = players().filter(function (p) { return st.players.indexOf(p.name) < 0; });
    var html = '<div class="card ctp-card ctp-admin"><div class="ctp-k">Ty\'s controls <span>tap a player above to enter, fix or void a shot, move or remove them</span></div>';
    if (out.length) html += '<div class="ctp-add"><select id="ctpadd"><option value="">Add a player…</option>' + out.map(function (p) { return '<option>' + e(p.name) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="ctp-b pri" data-ctp="add">Add</button></div>';
    html += '<div class="ctp-btns"><button type="button" class="ctp-b" data-ctp="undo"' + (busy ? ' disabled' : '') + '>Undo</button>' +
      '<button type="button" class="ctp-b" data-ctp="redo"' + (busy ? ' disabled' : '') + '>Everyone re-hit</button>' +
      '<button type="button" class="ctp-b warn" data-ctp="end">End CTP</button></div>';
    if (confirmEnd) html += '<div class="msg-confirm">End CTP for tonight?' + (st.pot ? ' The $' + st.pot + ' pot hasn\'t been won.' : '') +
      '<div class="msg-btns"><button type="button" class="en-save" data-ctp="endyes">End it</button><button type="button" class="msg-cancel" data-ctp="endno">Keep playing</button></div></div>';
    html += '<div class="ctp-help">Undo after a finished hole brings that hole back with every shot, so you can fix it.</div>' +
      '<div class="esw-msg' + (err ? ' err' : '') + '">' + e(msg) + '</div></div>';
    return html;
  }

  function ledger() {
    var names = Object.keys(st.money || {});
    if (!names.length) return '';
    names.sort(function (a, b) { return (st.money[b] - st.money[a]) || ((st.wins[b] || 0) - (st.wins[a] || 0)) || (a < b ? -1 : 1); });
    return '<h2>TONIGHT</h2><div class="card ctp-card"><table class="ctp-t"><tr><th>Player</th><th class="n">Wins</th><th class="n">Money</th></tr>' +
      names.map(function (p) {
        var m = st.money[p], gone = st.players.indexOf(p) < 0;
        return '<tr' + (gone ? ' class="gone"' : '') + '><td>' + e(p) + (gone ? ' <i>left</i>' : '') + '</td><td class="n">' + (st.wins[p] || 0) + '</td><td class="n ' + (m > 0 ? 'up' : m < 0 ? 'dn' : '') + '">' + money(m) + '</td></tr>';
      }).join('') + '</table><div class="paykey">$1 a hole each. Money = winnings minus dollars put in' + (st.pot ? ', with $' + st.pot + ' in the pot now' : '') + '.' +
      (st.ended && st.refund && Object.keys(st.refund).length ? ' Ended with $' + Object.keys(st.refund).reduce(function (t, p) { return t + st.refund[p]; }, 0) + ' nobody had won yet: handed back to the players who put it in.' : '') + '</div></div>';
  }

  function history() {
    var h = (st.hist || []).slice().reverse();
    if (!h.length) return '';
    return '<h2>HOLES</h2><div class="card ctp-card">' + h.map(function (r) { return '<div class="ctp-hist ' + r.r + '">' + resultLine(r) + '</div>'; }).join('') + '</div>';
  }

  function drawAdmin() {
    var box = document.getElementById('adminctpbody'); if (!box) return;
    if (!admin()) { box.innerHTML = ''; return; }
    if (on()) {
      box.innerHTML = '<div class="card esw"><div class="esw-top"><b>CTP is running</b><div class="esw-sub">Hole ' + (st ? st.n : '') + (st ? ', pot $' + st.pot : '') + '. Run it from the CTP tab: enter or fix shots, add or remove players, undo, end.</div></div>' +
        '<button type="button" class="en-save ctp-go" data-gotab="ctp">Open the CTP tab</button></div>';
      return;
    }
    var pl = players();
    // Nov 25: tonight's players start picked; names are chips (shared picker in admin.js).
    if (!pick && pl.length) { pick = {}; tonight().forEach(function (nm) { pick[nm] = true; }); }
    var pk = pick || {}, tn = tonight();
    var n = pl.filter(function (p) { return pk[p.name]; }).length;
    var played = st && st.ended && st.money && ((st.hist || []).length || Object.keys(st.money).some(function (k) { return st.money[k] || (st.wins && st.wins[k]); }));
    box.innerHTML = '<div class="card esw msg"><div class="esw-top"><div class="esw-sub">$1 a hole each; closest on the green takes the pot. The first hole\'s order is random.</div></div>' +
      (pl.length && window.pkHtml ? pkHtml({
        shortcuts: [tn.length ? ['Tonight\'s ' + tn.length, 'data-ctp="picktonight"'] : null, ['All', 'data-ctp="pickall"'], ['None', 'data-ctp="picknone"']],
        items: pl.map(function (p) { return { name: p.name, tag: p.guest ? 'guest' : '' }; }),
        on: function (nm) { return !!pk[nm]; },
        attr: function (nm) { return 'data-ctp="pick" data-v="' + e(nm) + '" aria-label="' + e(nm) + ' plays"'; }
      }) : '<div class="empty">Loading players…</div>') +
      '<div class="pk-count"><b>' + n + '</b> playing</div>' +
      '<div class="pin-bar"><button type="button" class="en-save msg-go" data-ctp="start"' + (n >= 2 && !busy ? '' : ' disabled') + '>' + (n >= 2 ? 'Start CTP with ' + n : 'Start CTP') + '</button>' +
      '<div class="pin-hint">' + (n >= 2 ? 'Starting shows the CTP tab to everyone.' : 'Pick at least two players.') + '</div></div>' +
      '<div class="esw-msg' + (err ? ' err' : '') + '">' + e(msg) + '</div></div>' +
      (played ? ledger().replace('<h2>TONIGHT</h2>', '<h2>LAST CTP GAME</h2>') : st && st.ended ? '<div class="card pk-line"><b>Last CTP game</b><small>No holes played</small></div>' : '');
  }

  // ---------- taps ----------
  function distIn() {
    var f = document.getElementById('ctpft'), i = document.getElementById('ctpin');
    var fv = f && f.value !== '' ? Number(f.value) : null, iv = i && i.value !== '' ? Number(i.value) : 0;
    if (fv == null && !(iv > 0)) return null;
    return (fv || 0) + Math.min(11, Math.max(0, iv)) / 12;
  }
  function move(p, d) {
    var o = st.order.slice(), i = o.indexOf(p), j = i + d;
    if (i < 0 || j < 0 || j >= o.length) return;
    o[i] = o[j]; o[j] = p;
    act({ op: 'order', order: o });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ctp]'); if (!b) return;
    var k = b.getAttribute('data-ctp'), v = b.getAttribute('data-v');
    if (k === 'open') { open = open === v ? '' : v; msg = ''; draw(); return; }
    if (k === 'pick') { pick = pick || {}; pick[v] = !pick[v]; msg = ''; draw(); return; }
    if (k === 'pickall') { pick = {}; players().forEach(function (p) { pick[p.name] = true; }); draw(); return; }
    if (k === 'picktonight') { pick = {}; tonight().forEach(function (nm) { pick[nm] = true; }); draw(); return; }
    if (k === 'picknone') { pick = {}; draw(); return; }
    if (k === 'end') { confirmEnd = true; draw(); return; }
    if (k === 'endno') { confirmEnd = false; draw(); return; }
    if (b.disabled) return;
    if (k === 'start') {
      var names = players().map(function (p) { return p.name; }).filter(function (n) { return pick && pick[n]; });
      act({ op: 'start', players: names }, 'Started. Order is on the CTP tab.');
      pick = null;
      return;
    }
    if (k === 'endyes') { confirmEnd = false; act({ op: 'end' }, 'CTP ended.'); return; }
    if (k === 'resolve') { act({ op: 'resolve' }); return; }
    if (k === 'chyes') { act({ op: 'answer', name: v, yes: true }, v + ' is challenging.'); return; }
    if (k === 'chno') { act({ op: 'answer', name: v, yes: false }, v + ' declined.'); return; }
    if (k === 'reveal') { act({ op: 'reveal', all: true }, 'Buy-ins revealed.'); return; }
    if (k === 'chgo') { act({ op: 'continue' }, 'Challenge answers closed.'); return; }
    if (k === 'lead0') { act({ op: 'leadopt', amount: 0 }, 'Pot taken.'); return; }
    if (k === 'lead1' || k === 'lead2') { var amt = k === 'lead1' ? 1 : 2; act({ op: 'leadopt', amount: amt }, '$' + amt + ' challenge offered.'); return; }
    if (k === 'undo') { open = ''; act({ op: 'undo' }, 'Undone.'); return; }
    if (k === 'redo') { act({ op: 'redo' }, 'Shots cleared. Everyone hits this hole again.'); return; }
    if (k === 'add') { var sel = document.getElementById('ctpadd'); if (sel && sel.value) act({ op: 'add', name: sel.value }, sel.value + ' added ($1 in).'); return; }
    if (k === 'green') {
      var d = distIn();
      open = '';
      act(shotOf(v) ? { op: 'edit', name: v, green: true, ft: d } : { op: 'shot', name: v, green: true, ft: d }, v + ': on the green' + (d != null ? ', ' + ft(d) : ''));
      return;
    }
    if (k === 'miss') { open = ''; act(shotOf(v) ? { op: 'edit', name: v, green: false } : { op: 'shot', name: v, green: false }, v + ': missed'); return; }
    if (k === 'void') { open = ''; act({ op: 'void', name: v }, v + '\'s shot voided. ' + v + ' hits again.'); return; }
    if (k === 'remove') { open = ''; act({ op: 'remove', name: v }, v + ' removed.'); return; }
    if (k === 'up') { move(v, -1); return; }
    if (k === 'down') { move(v, 1); return; }
  });
})();
