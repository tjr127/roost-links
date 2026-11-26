/*
 * Garbage side game (the group's name for Bingo Bango Bongo). See claude/bbb-side-game.md.
 * Real scoring since Nov 25, 2026: everything comes from the server (?api=garbage, worked out from GSPro's shots).
 *   FO Furthest Out · CTP Closest to Pin · LP Longest Putt. $1 a player, leader takes the pot, a tie carries it over.
 * Admin > Garbage: switch, who's in, pot carried in, hand-set winners for a hole, end the night (POST action 'garbage').
 * When on: Garbage pill + page (section #bbb), "Garb" column on Individual, Garbage tile on the Tonight card.
 * Code ids keep the old "bbb" names; inside, bi / ba / bo = FO / CTP / LP.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function d() { return window.data || {}; }
  function short(n) { var s = (d().shortNames || {})[n]; return s || n; }
  try { localStorage.removeItem('bbbCfg'); } catch (x) {}   // the Nov 24 preview kept its settings on the phone

  // ---- server state ----
  var G = null, gAt = 0, gBusy = false, gErr = '', PAST = {}, pastBusy = {}, timer = null, saveT = null, saving = false;
  function auth() { try { return (window.RL && RL.user && RL.user()) || null; } catch (x) { return null; } }
  function load(force) {
    if (gBusy || !window.RL || !RL.get) return;
    if (!force && Date.now() - gAt < 10000) return;
    gBusy = true;
    RL.get('garbage').then(function (j) { G = j.garbage || null; gErr = ''; }, function () { gErr = 'Couldn\'t reach the server.'; })
      .then(function () { gBusy = false; gAt = Date.now(); refresh(); });
  }
  function maybeLoad(want) {
    var b = d().garbage;
    if (!G) { if (want || (b && b.on)) load(true); return; }
    if (b && (b.rev || 0) > (G.rev || 0) && Date.now() - gAt > 3000) load(true);   // the board has seen a newer setting than we hold
    else if (G.on || want) load(false);
  }
  function vis(id) { var s = document.getElementById(id); return !!s && !s.classList.contains('hide'); }
  if (!timer) timer = setInterval(function () {   // while a Garbage night is running, keep up with it
    if (document.hidden || !G || !G.on || G.final || saving) return;
    if (vis('bbb') || vis('field') || vis('tonight') || vis('teams')) load(false);
  }, 15000);

  // server state -> what the page draws (bi / ba / bo = FO / CTP / LP)
  function adapt(g) {
    var all = (g.holes || []).map(function (h) {
      return { n: h.n, par: h.par, done: !!h.done, bi: h.fo, ba: h.ct, bo: h.lp, biD: h.foD, baD: h.ctD, boD: h.lpD, tag: h.tag || '', foX: h.foX || 0, push: !!h.push,
        note: h.note || '', src: h.src || '', foV: h.foV, ctV: h.ctV, lpV: h.lpV, wait: h.wait || [] };
    });
    var pts = {}; (g.players || []).forEach(function (p) { var x = (g.pts || {})[p] || {}; pts[p] = { bi: x.fo || 0, ba: x.ct || 0, bo: x.lp || 0, t: x.t || 0 }; });
    return { ps: g.players || [], total: g.total || all.length, all: all, holes: all.filter(function (h) { return h.done; }), pts: pts, order: (g.order || []).filter(function (p) { return pts[p]; }).concat((g.players || []).filter(function (p) { return (g.order || []).indexOf(p) < 0; })),
      left: g.left || 0, final: !!g.final, pot: g.pot || 0, carry: g.carry || 0, bonus: g.bonus || null, pushed: g.pushed || 0, label: g.label || '' };
  }
  window.bbbOn = function () { return !!(G && G.on && (G.players || []).length >= 2); };
  window.bbbState = function () { return adapt(G || {}); };
  function leaders(s) { var top = s.order.length ? s.pts[s.order[0]].t : 0; return s.order.filter(function (p) { return s.pts[p].t === top && top > 0; }); }

  // ---- Board: pill + "Garb" column on Individual ----
  function syncPill() { var b = document.getElementById('bbbpill'); if (b) b.classList.toggle('hide', !window.bbbOn()); }
  window.bbbSyncPill = syncPill;
  window.bbbAfterField = function () {
    maybeLoad(false);
    syncPill();
    var row = document.getElementById('bbbrow'), bc = document.getElementById('bbbcard'), on = window.bbbOn();
    if (row) row.classList.toggle('on', on);
    if (bc) bc.innerHTML = '';   // the Garbage status lives on the Tonight card
    var t = document.querySelector('#fieldcard table.fld');
    if (!on || !t || t.classList.contains('bbb') || document.body.classList.contains('bpast')) return;
    var s = adapt(G);
    t.classList.add('bbb');
    var cg = t.querySelector('colgroup'); if (cg) { var c = document.createElement('col'); c.className = 'c-m'; cg.appendChild(c); }
    var L = leaders(s), sel = document.getElementById('fieldsort');
    if (sel && !sel.querySelector('option[value="bbb"]')) sel.insertAdjacentHTML('beforeend', '<option value="bbb">Garbage points</option>');
    var sorted = sel && sel.value === 'bbb';
    [].forEach.call(t.querySelectorAll('tr'), function (tr, i) {
      if (i === 0) { var th = document.createElement('th'); th.className = 'n fs-h bbb-th' + (sorted ? ' sorted' : ''); th.setAttribute('data-fsort', 'bbb'); th.textContent = 'Garb'; th.title = 'Garbage points'; tr.appendChild(th); return; }
      var name = tr.getAttribute('data-fxrow'), td = document.createElement('td'); td.className = 'n' + (sorted ? ' b' : '');
      if (!name || !s.pts[name]) td.innerHTML = '<span class="bbb-out">–</span>';
      else td.innerHTML = L.indexOf(name) >= 0 ? '<span class="putw bbb-lead">' + s.pts[name].t + '</span>' : String(s.pts[name].t);
      tr.appendChild(td);
    });
  };

  // ---- Garbage page: leader strip, bars, three tiles, dot grid, rules folded away ----
  var selHole = null;
  function meName() { var u = auth(); return (u && u.name) || ''; }
  function ordn(n) { var sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + sfx; }
  function placeOf(s, p) { var t = s.pts[p].t, better = s.order.filter(function (q) { return s.pts[q].t > t; }).length, tie = s.order.filter(function (q) { return s.pts[q].t === t; }).length > 1; return (tie ? 'T' : '') + ordn(better + 1); }
  function tile3(k, cls, big, sub) { return '<div class="gb-t ' + cls + '"><span class="gb-k">' + k + '</span><b>' + big + '</b><small>' + sub + '</small></div>'; }
  function ft(yd) { var f = yd * 3; return f < 10 ? (Math.round(f * 10) / 10) + ' ft' : Math.round(f) + ' ft'; }
  function gridBlock(s, start, n) {
    var h = '<tr><th class="l">Hole</th>';
    for (var i = start; i < start + n; i++) { var a = s.all[i]; h += '<th' + (i === selHole ? ' class="sel"' : '') + '>' + (a.done ? '<button type="button" data-gbh="' + i + '" aria-label="Hole ' + a.n + ' details">' + a.n + '</button>' : a.n) + '</th>'; }
    h += '</tr>';
    s.ps.forEach(function (p) {
      h += '<tr><td class="l">' + e(short(p)) + '</td>';
      for (var i = start; i < start + n; i++) {
        var ho = s.all[i];
        if (!ho.done) { h += '<td class="m">' + (ho.wait.length && ho.wait.indexOf(p) < 0 ? '✓' : '·') + '</td>'; continue; }
        var lab = [ho.bi === p ? 'FO' + (ho.foX ? ' ×' + (ho.foX + 1) : '') : '', ho.ba === p ? 'CTP' : '', ho.bo === p ? 'LP' : ''].filter(Boolean).join(', ');
        h += '<td data-gbh="' + i + '"' + (i === selHole ? ' class="sel"' : '') + (lab ? ' aria-label="' + lab + '"' : '') + '><i class="gd' + (ho.bi === p ? ' fo' + (ho.foX ? ' dbl' : '') : '') + '"></i><i class="gd' + (ho.ba === p ? ' ct' : '') + '"></i><i class="gd' + (ho.bo === p ? ' lp' : '') + '"></i></td>';
      }
      h += '</tr>';
    });
    return '<table class="gb-g">' + h + '</table>';
  }
  var RULES = '<details class="gb-rules"><summary>How Garbage works</summary><p><b>Furthest Out (FO)</b>: first on the green from furthest away (the shot onto the green can\'t be a mulligan replay; penalty strokes are fine). Par 3: anyone on from the tee counts the same whatever the tee, and the closest takes it. If nobody is on from the tee, the point pushes to the next par 3; with no par 3 left it goes to the longest Furthest Out shot of the round.</p><p><b>Closest to Pin (CTP)</b>: closest to the pin once everyone is on, played from off the green.</p><p><b>Longest Putt (LP)</b>: fewest putts, longest first putt breaks ties. A chip-in takes CTP and LP.</p><p>A point that is still tied goes to nobody. A hole counts once every Garbage player has finished it. $1 a player; the leader at the end of the night takes the pot, a tie carries it to the next Garbage night. In the grid, the three dots in each box are FO, CTP, LP from left to right; a ringed FO dot is worth extra pushed points.</p></details>';
  function renderPage() {
    var el = document.getElementById('bbbbody'); if (!el) return;
    var past = document.body.classList.contains('bpast'), g = G;
    if (past) {   // a past night picked in the Night chip: the saved result, if Garbage was played
      var nsel = document.getElementById('bnsel'), nk = nsel ? nsel.value : '';
      if (!(nk in PAST)) {
        el.innerHTML = '<div class="card empty">Loading…</div>';
        if (!pastBusy[nk] && window.RL && RL.get) { pastBusy[nk] = true; RL.get('garbage', '&night=' + encodeURIComponent(nk)).then(function (j) { PAST[nk] = j.garbage || null; }, function () {}).then(function () { pastBusy[nk] = false; if (nk in PAST) renderPage(); else el.innerHTML = '<div class="card empty">Couldn\'t load that night.</div>'; }); }
        return;
      }
      g = PAST[nk];
      if (!g) { el.innerHTML = '<div class="card empty">No Garbage was played that night.</div>'; return; }
    } else {
      maybeLoad(true);
      if (!G) { el.innerHTML = '<div class="card empty">' + (gErr || 'Loading…') + '</div>'; return; }
      if (!window.bbbOn()) { el.innerHTML = '<div class="card empty">Garbage isn\'t on tonight.</div>' + RULES; return; }
    }
    var s = adapt(g), last = s.holes[s.holes.length - 1], me = meName(), L = leaders(s), top = L.length ? s.pts[L[0]].t : 0;
    if (selHole === null || !s.all[selHole] || !s.all[selHole].done) selHole = last ? s.all.indexOf(last) : -1;
    var mine = s.pts[me] ? placeOf(s, me) : '';
    var status = s.final ? '' : '<div class="gb-st"><span>' + (s.holes.length ? '<i class="gb-live"></i>' + s.holes.length + ' of ' + s.total + ' holes in' : 'Yet to start') + '</span><span>' + s.left + ' pts left</span><span>Pot <b>$' + s.pot + '</b>' + (s.carry ? ' <small>($' + s.carry + ' carried)</small>' : '') + '</span></div>';
    var strip;
    if (!s.holes.length) strip = '<div class="gb-lead"><div><span class="gb-k">Garbage tonight</span><b>' + s.ps.length + ' players</b><small>' + s.total * 3 + ' points up for grabs · $1 each</small></div><div class="gb-big">$' + s.pot + '<small>pot</small></div></div>';
    else {
      var second = s.order.filter(function (p) { return L.indexOf(p) < 0; })[0], gap = second ? top - s.pts[second].t : 0, who = L.map(function (p) { return p === me ? 'You' : e(short(p)); }).join(' & ');
      var sub = L.length > 1 ? 'Tied at the top' : second ? gap + ' clear of ' + e(short(second)) : '';
      if (mine && L.indexOf(me) < 0) sub += (sub ? ' · ' : '') + 'you\'re ' + mine;
      if (!L.length) strip = '<div class="gb-lead"><div><span class="gb-k">' + (s.final ? 'Garbage · final' : 'Garbage') + '</span><b>No points yet</b><small></small></div><div class="gb-big">$' + s.pot + '<small>pot</small></div></div>';
      else if (s.final) strip = '<div class="gb-lead fin"><div><span class="gb-k">Garbage · final</span><b>' + (L.length > 1 ? 'Tie: ' + who : who + (who === 'You' ? ' win $' : ' wins $') + s.pot) + '</b><small>' + (L.length > 1 ? '$' + s.pot + ' carries to the next Garbage night' : (second ? e(short(second)) + ' 2nd with ' + s.pts[second].t : '')) + '</small></div><div class="gb-big">' + top + '<small>points</small></div></div>';
      else strip = '<div class="gb-lead"><div><span class="gb-k">Leading</span><b>' + who + '</b><small>' + sub + '</small></div><div class="gb-big">' + top + '<small>points</small></div></div>';
    }
    var mx = Math.max(1, top);
    var rows = s.order.map(function (p) {
      var x = s.pts[p], seg = [['fo', x.bi], ['ct', x.ba], ['lp', x.bo]].map(function (q) { return q[1] ? '<i class="' + q[0] + '" style="flex:' + q[1] + '">' + q[1] + '</i>' : ''; }).join('');
      return '<div class="gb-r' + (p === me ? ' me' : '') + '" aria-label="' + e(p) + ': ' + x.bi + ' Furthest Out, ' + x.ba + ' Closest to Pin, ' + x.bo + ' Longest Putt, ' + x.t + ' total"><span class="gb-p">' + placeOf(s, p).replace(/(st|nd|rd|th)$/, '') + '</span><span class="gb-n">' + e(short(p)) + '</span><span class="gb-barw"><span class="gb-bar" style="width:' + Math.round(x.t / mx * 100) + '%">' + seg + '</span></span><b' + (L.indexOf(p) >= 0 ? ' class="a"' : '') + '>' + x.t + '</b></div>';
    }).join('');
    var legend = '<span class="gb-leg"><i class="gd fo"></i>FO <i class="gd ct"></i>CTP <i class="gd lp"></i>LP</span>';
    // three tiles: latest hole while playing, the night's bests at the end
    var tiles = '';
    if (last) {
      if (s.final) {
        var best = function (k, hi) { var hs = s.holes.filter(function (h) { return h[k] !== null && h[k] !== undefined; }); if (!hs.length) return null; return hs.reduce(function (a, b) { return (hi ? b[k] > a[k] : b[k] < a[k]) ? b : a; }); };
        var bf = best('foV', true), bc = best('ctV', false), bl = best('lpV', true);
        tiles = '<div class="gb-h">' + (past ? 'Bests of the night' : 'Tonight\'s bests') + '</div><div class="gb-ts">' +
          (bf ? tile3('FO', 'fo', e(short(bf.bi)), Math.round(bf.foV) + ' yd · H' + bf.n) : tile3('FO', 'fo', '—', '')) +
          (bc ? tile3('CTP', 'ct', e(short(bc.ba)), (bc.ctV === 0 ? 'chip-in' : ft(bc.ctV)) + ' · H' + bc.n) : tile3('CTP', 'ct', '—', '')) +
          (bl ? tile3('LP', 'lp', e(short(bl.bo)), ft(bl.lpV) + ' · H' + bl.n) : tile3('LP', 'lp', '—', '')) + '</div>';
      } else {
        var tl = function (k, cls, lab) { if (!last[k]) return tile3(lab, cls, '—', k === 'bi' && last.push ? 'pushes to next par 3' : 'no winner'); return tile3(lab + (k === 'bi' && last.foX ? ' ×' + (last.foX + 1) : ''), cls, e(short(last[k])), e(String(last[k + 'D']).replace('chip-in from ', 'chip-in, ').replace('on from the tee, ', 'tee shot, '))); };
        tiles = '<div class="gb-h">Latest · hole ' + last.n + ' · par ' + last.par + '</div><div class="gb-ts">' + tl('bi', 'fo', 'FO') + tl('ba', 'ct', 'CTP') + tl('bo', 'lp', 'LP') + '</div>';
      }
    }
    var grid = '';
    for (var st = 0; st < s.all.length; st += 9) grid += gridBlock(s, st, Math.min(9, s.all.length - st));
    var sh = s.all[selHole], det = '';
    if (sh && sh.done) det = '<div class="gb-det"><b>Hole ' + sh.n + ' · par ' + sh.par + (sh.src === 'admin' ? ' · set by hand' : '') + '</b><span><i class="gd fo"></i>' + (sh.bi ? e(short(sh.bi)) + ', ' + e(sh.biD) + (sh.foX ? ' (' + (sh.foX + 1) + ' pts with the pushed point' + (sh.foX > 1 ? 's' : '') + ')' : '') : (sh.push ? 'nobody on from the tee: pushes to the next par 3' : 'no winner')) + '</span><span><i class="gd ct"></i>' + (sh.ba ? e(short(sh.ba)) + ', ' + e(sh.baD) : 'no winner') + '</span><span><i class="gd lp"></i>' + (sh.bo ? e(short(sh.bo)) + ', ' + e(sh.boD) : 'no winner') + '</span></div>';
    var notes = [];
    if (s.bonus) notes.push(s.bonus.p ? s.bonus.n + ' pushed par-3 point' + (s.bonus.n > 1 ? 's' : '') + ' went to ' + e(short(s.bonus.p)) + ' for the longest Furthest Out of the round (' + s.bonus.yd + ' yd on hole ' + s.bonus.hole + ').' : s.bonus.n + ' pushed par-3 point' + (s.bonus.n > 1 ? 's were' : ' was') + ' not awarded (tie for the longest shot).');
    else if (s.pushed) notes.push(s.pushed + ' par-3 point' + (s.pushed > 1 ? 's are' : ' is') + ' waiting for the next par 3.');
    s.all.forEach(function (h) {
      if (!h.done && h.note === 'noshots') notes.push('Hole ' + h.n + ' was entered by phone, so Ty sets its winners by hand.');
      if (h.done && h.note === 'mull' && h.src !== 'admin') notes.push('Hole ' + h.n + ': a mulligan was taken, so that player couldn\'t take Furthest Out there.');
    });
    el.innerHTML = (past ? '<div class="gb-st"><span>' + e(s.label) + '</span><span>Pot <b>$' + s.pot + '</b></span></div>' : status) + strip +
      '<div class="card gb-c"><div class="gb-ch"><span class="bbb-sh">Standings</span>' + legend + '</div>' + rows + '</div>' + tiles +
      '<div class="card gb-c"><div class="gb-ch"><span class="bbb-sh">Hole by hole</span><small>tap a hole for distances</small></div>' + grid + det +
      (notes.length ? '<div class="gb-notes">' + notes.map(function (n) { return '<div>' + n + '</div>'; }).join('') + '</div>' : '') + '</div>' + RULES;
  }
  window.renderBbb = renderPage;

  // ---- Admin > Garbage ----
  var pend = null, fix = { hole: '' };
  function post(op, extra, quiet) {
    var a = auth(), body = { action: 'garbage', op: op, token: a && a.token };
    for (var k in (extra || {})) body[k] = extra[k];
    saving = true;
    return RL.post(body).then(function (j) { G = j.garbage || G; gAt = Date.now(); gErr = ''; }, function (err) { gErr = (err && err.message) || 'That didn\'t save.'; load(true); })
      .then(function () { saving = false; refresh(); });
  }
  function queueSet() {   // switch / players / carry: shown at once, saved a moment later so quick taps go as one
    clearTimeout(saveT);
    saveT = setTimeout(function () { var p = pend; pend = null; if (p) post('set', p); }, 600);
  }
  function setLocal(ch) {
    pend = pend || {};
    for (var k in ch) { pend[k] = ch[k]; }
    if ('on' in ch) G.on = ch.on;
    if ('players' in ch) G.players = G.roster.filter(function (n) { return ch.players.indexOf(n) >= 0; });
    if ('carry' in ch) { G.carrySet = ch.carry !== null; if (ch.carry !== null) G.carry = ch.carry; }
    G.pot = G.players.length + (G.carry || 0);
    renderAdmin(); syncPill(); queueSet();
  }
  function renderAdmin() {
    var el = document.getElementById('adminbbbbody'); if (!el) return;
    maybeLoad(true);
    if (!G) { el.innerHTML = '<div class="card empty">' + (gErr || 'Loading…') + '</div>'; return; }
    var all = G.roster || [], sel = G.players || [], guests = {}, carry = Number(G.carry) || 0, s = G.on ? adapt(G) : null;
    ((d().entry && d().entry.players) || []).forEach(function (p) { if (p.guest) guests[p.name] = 1; });
    var h = (gErr ? '<div class="pv-note"><span>' + e(gErr) + '</span></div>' : '') +
      '<div class="card bbba"><div class="bbba-h"><div><b>' + (G.on ? 'On tonight' : 'Off tonight') + '</b><small>' + e(G.label || d().title || 'Tonight') + '</small></div>' +
      '<button type="button" class="bbb-sw' + (G.on ? ' on' : '') + '" id="bbbsw" role="switch" aria-checked="' + !!G.on + '" aria-label="Garbage on tonight"><span></span></button></div>' +
      (G.on ? '<div class="bbba-l"><span>Who\'s playing <small>from tonight\'s card</small></span></div>' +
        ((G.excluded || []).length ? '<div class="bbba-f" style="border:0;padding:0">' + e(G.excluded.join(', ')) + ' is left out of Garbage for now (remote play).</div>' : '') +
        (all.length && window.pkHtml ? pkHtml({
          shortcuts: [['All', 'data-bbball="1"'], ['None', 'data-bbball="0"']],
          items: all.map(function (n) { return { name: n, tag: guests[n] ? 'guest' : '' }; }),
          on: function (n) { return sel.indexOf(n) >= 0; },
          attr: function (n) { return 'data-bbbchip="' + e(n) + '"'; }
        }) : '<div class="empty">Nobody on Tonight yet.</div>') : '<div class="bbba-f">Turn it on to pick tonight\'s Garbage players. Everyone sees it once it\'s on.</div>') + '</div>';
    if (G.on) {
      h += '<div class="card bbba bbba-pot"><div class="bbba-ph"><div><small>Pot tonight</small><b>$' + (sel.length + carry) + '</b></div><span>' + sel.length + ' playing × $1' + (carry ? ' + $' + carry + ' carried' : '') + (sel.length < 2 ? ' · needs at least 2' : '') + '</span></div>' +
        '<label class="bbba-p bbba-carry"><span>Carried over' + (G.carrySet ? ' (set by hand)' : ' (automatic)') + '</span><span>$ <input type="number" min="0" step="1" inputmode="numeric" data-bbbcarry="1" value="' + carry + '"></span></label>' +
        (G.carrySet ? '<button type="button" class="bbba-link" data-bbbauto="1">Back to automatic</button>' : '') +
        '<div class="bbba-f">Leader at the end of the night takes the pot. A tie carries it to the next Garbage night on its own.</div></div>';
      if (s && s.all.length) {
        var fh = s.all.filter(function (x) { return String(x.n) === String(fix.hole); })[0] || s.all.filter(function (x) { return !x.done && x.note === 'noshots'; })[0] || s.all[0];
        fix.hole = String(fh.n);
        var opt = function (cur) { return '<option value="">GSPro\'s result</option>' + sel.map(function (p) { return '<option value="' + e(p) + '"' + (cur === p ? ' selected' : '') + '>' + e(p) + '</option>'; }).join('') + '<option value="-">Nobody</option>'; };
        var by = fh.src === 'admin';
        h += '<div class="card bbba"><div class="bbba-l"><span>Set a hole by hand</span></div>' +
          '<label class="bbba-p"><span>Hole</span><select data-bbbfix="hole">' + s.all.map(function (x) { return '<option value="' + x.n + '"' + (String(x.n) === fix.hole ? ' selected' : '') + '>' + x.n + (x.done ? (x.src === 'admin' ? ' · set by hand' : ' · scored') : x.note === 'noshots' ? ' · needs winners' : ' · waiting') + '</option>'; }).join('') + '</select></label>' +
          '<label class="bbba-p"><span>Furthest Out</span><select data-bbbfix="fo">' + opt(by ? fh.bi : '') + '</select></label>' +
          '<label class="bbba-p"><span>Closest to Pin</span><select data-bbbfix="ct">' + opt(by ? fh.ba : '') + '</select></label>' +
          '<label class="bbba-p"><span>Longest Putt</span><select data-bbbfix="lp">' + opt(by ? fh.bo : '') + '</select></label>' +
          '<button type="button" class="bbba-btn" data-bbbsave="1"' + (saving ? ' disabled' : '') + '>Save hole ' + e(fix.hole) + '</button>' +
          '<div class="bbba-f">' + (fh.done ? 'Now: FO ' + e(fh.bi || 'nobody') + ' · CTP ' + e(fh.ba || 'nobody') + ' · LP ' + e(fh.bo || 'nobody') + '. ' : '') + 'Leave a point on "GSPro\'s result" to keep what the sim worked out. A hole entered by phone needs all three set.</div></div>';
        if (!s.final || G.closed) h += '<div class="card bbba"><button type="button" class="bbba-btn' + (G.closed ? '' : ' warn') + '" data-bbbfinish="' + (G.closed ? '0' : '1') + '"' + (saving || (!G.closed && !s.holes.length) ? ' disabled' : '') + '>' + (G.closed ? 'Reopen tonight\'s Garbage' : 'End Garbage with the holes scored so far') + '</button><div class="bbba-f">' + (G.closed ? 'Ended early by you.' : 'It ends by itself when every hole is scored. Use this only if a hole can\'t be scored.') + '</div></div>';
      }
    }
    el.innerHTML = h;
  }
  window.renderAdminBbb = renderAdmin;
  window.bbbAdminInfo = function () { var n = G && G.on ? (G.players || []).length : 0; return { on: !!(G && G.on), n: n, pot: G && G.on ? n + (Number(G.carry) || 0) : 0 }; };
  function refresh() {
    syncPill();
    if (vis('adminbbb')) renderAdmin();
    if (typeof window.renderField === 'function' && !document.body.classList.contains('bpast')) window.renderField();
    if (typeof window.renderTonightCard === 'function') window.renderTonightCard(window.data);
    if (vis('bbb')) renderPage();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var x;
    if (t.closest('[data-gbh]')) { selHole = Number(t.closest('[data-gbh]').getAttribute('data-gbh')); renderPage(); return; }
    if (!G || !t.closest('#adminbbbbody')) return;
    if (t.closest('#bbbsw')) setLocal({ on: !G.on });
    else if ((x = t.closest('[data-bbbchip]'))) { var cn = x.getAttribute('data-bbbchip'), cur = G.players || []; setLocal({ players: cur.indexOf(cn) >= 0 ? cur.filter(function (n) { return n !== cn; }) : cur.concat([cn]) }); }
    else if ((x = t.closest('[data-bbball]'))) setLocal({ players: x.getAttribute('data-bbball') === '1' ? (G.roster || []).slice() : [] });
    else if (t.closest('[data-bbbauto]')) setLocal({ carry: null });
    else if (t.closest('[data-bbbsave]')) { var v = function (k) { var q = document.querySelector('[data-bbbfix="' + k + '"]'); return q ? q.value : ''; }; post('over', { hole: fix.hole, fo: v('fo'), ct: v('ct'), lp: v('lp') }); renderAdmin(); }
    else if ((x = t.closest('[data-bbbfinish]'))) { post('finish', { closed: x.getAttribute('data-bbbfinish') === '1' }); renderAdmin(); }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'bnsel') { setTimeout(renderPage, 50); setTimeout(renderPage, 1500); return; }
    if (!G) return;
    var cr = ev.target.closest && ev.target.closest('[data-bbbcarry]');
    if (cr) { setLocal({ carry: Math.max(0, Math.round(Number(cr.value) || 0)) }); return; }
    var fx = ev.target.closest && ev.target.closest('[data-bbbfix="hole"]');
    if (fx) { fix.hole = fx.value; renderAdmin(); }
  });
})();
