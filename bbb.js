/*
 * Bingo Bango Bongo side game (Nov 24, 2026) — GUI preview. See claude/bbb-side-game.md.
 * Admin > BBB: switch + which of tonight's players are in. Saved on THIS device only for now
 * (localStorage bbbCfg) until the server side exists.
 * When on: Individual board shows the putting card and a BBB card side by side, a BBB column,
 * and the card opens the BBB page (section #bbb).
 * Points are DEMO data (made up per hole from the names) until GolfScoreAgent sends real BBB data.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cfg() { try { return JSON.parse(localStorage.getItem('bbbCfg') || 'null') || { on: false, players: null }; } catch (x) { return { on: false, players: null }; } }
  function save(c) { try { localStorage.setItem('bbbCfg', JSON.stringify(c)); } catch (x) {} }
  function d() { return window.data || {}; }
  function short(n) { var s = (d().shortNames || {})[n]; return s || n; }
  // Ty, Nov 24: Jeff Holl plays remotely (GSPro online); his shots may not reach our round file, so he's left out of
  // BBB until further notice. He can't be picked in Admin > BBB. Team game, low net and putting still include him.
  var BBB_EXCLUDE = /^jeff( holl)?$/i;
  function tonightNames() { return (d().cards || []).map(function (c) { return c.name; }).filter(function (n) { return !BBB_EXCLUDE.test(String(n).trim()); }); }
  function inPlayers() {
    var c = cfg(), all = tonightNames();
    return c.players ? all.filter(function (n) { return c.players.indexOf(n) >= 0; }) : all;
  }
  window.bbbOn = function () { return cfg().on && inPlayers().length >= 2; };

  // ---- demo scoring ----
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function holesOf(name) { var c = (d().cards || []).filter(function (x) { return x.name === name; })[0]; return (c && c.holes) || []; }
  function done(h) { return h && h.g !== '' && h.g !== null && h.g !== undefined; }
  function compute() {
    var ps = inPlayers(), total = 0, live = true;
    ps.forEach(function (p) { total = Math.max(total, holesOf(p).length); });
    if (!total) total = 9;
    var cards = ps.map(holesOf), anyScores = cards.some(function (hs) { return hs.some(done); });
    var holes = [];
    for (var i = 0; i < total; i++) {
      var fin = anyScores ? cards.every(function (hs) { return done(hs[i]); }) : i < 7;   // no scores tonight: show 7 demo holes
      if (!fin) break;
      var h0 = (cards[0] || [])[i] || {}, par = Number(h0.par || h0.p) || [4, 5, 3, 4, 4, 3, 4, 5, 4][i % 9];
      var pick = function (k) { return ps[hash(ps.join() + i + k) % ps.length]; };
      var r = hash('r' + i + ps.join());
      var bi = (par === 3 && r % 5 === 0) ? null : pick('bi'), ba = pick('ba'), bo = pick('bo'), tag = '';
      if (par === 3 && bi && r % 3 === 0) { ba = bi; tag = 'p3'; }
      else if (r % 7 === 1) { bo = ba; tag = 'chip'; }
      holes.push({ n: i + 1, par: par, bi: bi, ba: ba, bo: bo, tag: tag,
        biD: par === 3 ? (5 + r % 30) + ' ft' : (90 + r % 140) + ' yd', baD: tag === 'chip' ? 'chip-in from ' + (8 + r % 25) + ' yd' : (2 + r % 18) + ' ft', boD: tag === 'chip' ? 'chip-in bonus' : (12 + r % 35) + ' ft ' + (r % 4 ? '1' : '2') + '-putt' });
    }
    var pts = {}; ps.forEach(function (p) { pts[p] = { bi: 0, ba: 0, bo: 0, t: 0 }; });
    holes.forEach(function (h) { ['bi', 'ba', 'bo'].forEach(function (k) { if (h[k] && pts[h[k]]) { pts[h[k]][k]++; pts[h[k]].t++; } }); });
    var order = ps.slice().sort(function (a, b) { return pts[b].t - pts[a].t || a.localeCompare(b); });
    // Ty, Nov 24: $1 a BBB player; the leader at the end of the night takes the pot; a tie carries it to next week.
    var carry = Number(cfg().carry) || 0, pot = ps.length * 1 + carry;
    return { ps: ps, total: total, holes: holes, pts: pts, order: order, left: (total - holes.length) * 3, final: holes.length === total, anyScores: anyScores, pot: pot, carry: carry };
  }
  window.bbbState = function () { return compute(); };
  function leaders(s) { var top = s.order.length ? s.pts[s.order[0]].t : 0; return s.order.filter(function (p) { return s.pts[p].t === top && top > 0; }); }

  // ---- Individual board: card + column ----
  function card(s) {
    var L = leaders(s), last = s.holes[s.holes.length - 1], st = s.final ? 'final' : s.holes.length ? 'live' : 'pre';
    var head = st === 'final' ? 'Garbage · final' : st === 'live' ? 'Garbage · live' : 'Garbage tonight';
    var body;
    if (st === 'pre') body = '<b>' + s.ps.length + ' players</b><span class="bbb-s">' + s.total * 3 + ' pts up for grabs</span>';
    else {
      var rest = s.order.filter(function (p) { return L.indexOf(p) < 0; }).slice(0, 2).map(function (p) { return e(short(p)) + ' ' + s.pts[p].t; }).join(' · ');
      var hl = '';
      if (st === 'final') { var mb = s.order.slice().sort(function (a, b) { return s.pts[b].bi - s.pts[a].bi; })[0]; hl = 'Most Furthest Outs: ' + e(short(mb)) + ' (' + s.pts[mb].bi + ')'; }
      else if (last) hl = 'H' + last.n + ': ' + (last.tag === 'chip' ? e(short(last.ba)) + ' chip-in ×2' : last.tag === 'p3' ? e(short(last.bi)) + ' par-3 ×2' : 'CTP ' + e(short(last.ba)));
      body = '<b>' + e(L.map(short).join(' & ')) + ' <span class="bbb-n">' + (L.length ? s.pts[L[0]].t : 0) + '</span></b>' + (rest ? '<span class="bbb-s">' + rest + '</span>' : '') + '<span class="bbb-h">' + hl + '</span>';
    }
    return '<button type="button" class="card bbbc ' + st + '" id="bbbopen"><span class="bbb-k">' + head + (st === 'live' ? '<i>thru ' + s.holes.length + '</i>' : '') + '</span>' + body + '</button>';
  }
  // Nov 24 (Ty): a BBB pill right of Individual on the Board while BBB is on; opens the BBB page.
  function syncPill() { var b = document.getElementById('bbbpill'); if (b) b.classList.toggle('hide', !window.bbbOn()); }
  window.bbbSyncPill = syncPill;
  window.bbbAfterField = function () {
    syncPill();
    var row = document.getElementById('bbbrow'), bc = document.getElementById('bbbcard'), on = window.bbbOn();
    if (!row || !bc) return;
    row.classList.toggle('on', on);
    var t = document.querySelector('#fieldcard table.fld');
    if (!on) { bc.innerHTML = ''; return; }
    var s = compute(); bc.innerHTML = '';   // Nov 24: the BBB status lives on the Tonight card now
    if (!t || t.classList.contains('bbb')) return;
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

  // ---- Garbage page (redesigned Nov 24: leader strip, bars, three tiles, dot grid, rules folded away) ----
  var selHole = null;
  function meName() { try { var u = window.RL && RL.user && RL.user(); return (u && u.name) || ''; } catch (x) { return ''; } }
  function ordn(n) { var sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + sfx; }
  function placeOf(s, p) { var t = s.pts[p].t, better = s.order.filter(function (q) { return s.pts[q].t > t; }).length, tie = s.order.filter(function (q) { return s.pts[q].t === t; }).length > 1; return (tie ? 'T' : '') + ordn(better + 1); }
  function tile3(k, cls, big, sub) { return '<div class="gb-t ' + cls + '"><span class="gb-k">' + k + '</span><b>' + big + '</b><small>' + sub + '</small></div>'; }
  function gridBlock(s, start, n) {
    var h = '<tr><th class="l">Hole</th>';
    for (var i = start; i < start + n; i++) h += '<th' + (i === selHole ? ' class="sel"' : '') + '>' + (i < s.holes.length ? '<button type="button" data-gbh="' + i + '" aria-label="Hole ' + (i + 1) + ' details">' + (i + 1) + '</button>' : (i + 1)) + '</th>';
    h += '</tr>';
    s.ps.forEach(function (p) {
      h += '<tr><td class="l">' + e(short(p)) + '</td>';
      for (var i = start; i < start + n; i++) {
        var ho = s.holes[i];
        if (!ho) { h += '<td class="m">·</td>'; continue; }
        var lab = [ho.bi === p ? 'FO' : '', ho.ba === p ? 'CTP' : '', ho.bo === p ? 'LP' : ''].filter(Boolean).join(', ');
        h += '<td data-gbh="' + i + '"' + (i === selHole ? ' class="sel"' : '') + (lab ? ' aria-label="' + lab + '"' : '') + '><i class="gd' + (ho.bi === p ? ' fo' : '') + '"></i><i class="gd' + (ho.ba === p ? ' ct' : '') + '"></i><i class="gd' + (ho.bo === p ? ' lp' : '') + '"></i></td>';
      }
      h += '</tr>';
    });
    return '<table class="gb-g">' + h + '</table>';
  }
  function renderPage() {
    var el = document.getElementById('bbbbody'); if (!el) return;
    if (!window.bbbOn()) { el.innerHTML = '<div class="card empty">Garbage isn\'t on tonight.</div>'; return; }
    // A past night picked in the Night chip: nothing is saved yet (history comes with real scoring).
    if (document.body.classList.contains('bpast')) { el.innerHTML = '<div class="card empty">No Garbage results saved for this night.<br><small>Past nights will show here once real Garbage scoring is on.</small></div>'; return; }
    var s = compute(), last = s.holes[s.holes.length - 1], me = meName(), L = leaders(s), top = L.length ? s.pts[L[0]].t : 0;
    if (selHole === null || selHole >= s.holes.length) selHole = s.holes.length - 1;
    var mine = s.pts[me] ? placeOf(s, me) : '';
    // status line + leader strip
    var status = s.final ? '' : '<div class="gb-st"><span>' + (s.holes.length ? '<i class="gb-live"></i>Thru ' + s.holes.length + ' of ' + s.total : 'Not started') + '</span><span>' + s.left + ' pts left</span><span>Pot <b>$' + s.pot + '</b>' + (s.carry ? ' <small>($' + s.carry + ' carried)</small>' : '') + '</span></div>';
    var strip;
    if (!s.holes.length) strip = '<div class="gb-lead"><div><span class="gb-k">Garbage tonight</span><b>' + s.ps.length + ' players</b><small>' + s.total * 3 + ' points up for grabs · $1 each</small></div><div class="gb-big">$' + s.pot + '<small>pot</small></div></div>';
    else {
      var second = s.order.filter(function (p) { return L.indexOf(p) < 0; })[0], gap = second ? top - s.pts[second].t : 0, who = L.map(function (p) { return p === me ? 'You' : e(short(p)); }).join(' & ');
      var sub = L.length > 1 ? 'Tied at the top' : second ? gap + ' clear of ' + e(short(second)) : '';
      if (mine && L.indexOf(me) < 0) sub += (sub ? ' · ' : '') + 'you\'re ' + mine;
      if (s.final) strip = '<div class="gb-lead fin"><div><span class="gb-k">Garbage · final</span><b>' + (L.length > 1 ? 'Tie: ' + who : who + (who === 'You' ? ' win $' : ' wins $') + s.pot) + '</b><small>' + (L.length > 1 ? '$' + s.pot + ' carries to next week' : (second ? e(short(second)) + ' 2nd with ' + s.pts[second].t : '')) + '</small></div><div class="gb-big">' + top + '<small>points</small></div></div>';
      else strip = '<div class="gb-lead"><div><span class="gb-k">Leading</span><b>' + who + '</b><small>' + sub + '</small></div><div class="gb-big">' + top + '<small>points</small></div></div>';
    }
    // standings with FO / CTP / LP bars
    var mx = Math.max(1, top);
    var rows = s.order.map(function (p, i) {
      var x = s.pts[p], seg = [['fo', x.bi], ['ct', x.ba], ['lp', x.bo]].map(function (g) { return g[1] ? '<i class="' + g[0] + '" style="flex:' + g[1] + '">' + g[1] + '</i>' : ''; }).join('');
      return '<div class="gb-r' + (p === me ? ' me' : '') + '" aria-label="' + e(p) + ': ' + x.bi + ' Furthest Out, ' + x.ba + ' Closest to Pin, ' + x.bo + ' Longest Putt, ' + x.t + ' total"><span class="gb-p">' + placeOf(s, p).replace(/(st|nd|rd|th)$/, '') + '</span><span class="gb-n">' + e(short(p)) + '</span><span class="gb-barw"><span class="gb-bar" style="width:' + Math.round(x.t / mx * 100) + '%">' + seg + '</span></span><b' + (L.indexOf(p) >= 0 ? ' class="a"' : '') + '>' + x.t + '</b></div>';
    }).join('');
    var legend = '<span class="gb-leg"><i class="gd fo"></i>FO <i class="gd ct"></i>CTP <i class="gd lp"></i>LP</span>';
    // three tiles: latest hole while playing, the night's bests at the end
    var tiles = '';
    if (last) {
      var bestH = function (k) { var hs = s.holes.filter(function (h) { return h[k]; }); return hs.length ? hs[hash(k + hs.length) % hs.length] : null; };
      var T = s.final ? { h: 'Tonight\'s bests', bi: bestH('bi'), ba: bestH('ba'), bo: bestH('bo') } : { h: 'Latest · hole ' + last.n + ' · par ' + last.par, bi: last, ba: last, bo: last };
      var tl = function (k, cls, lab, ho) { if (!ho || !ho[k]) return tile3(lab, cls, '—', k === 'bi' ? 'nobody on from the tee' : ''); return tile3(lab, cls, e(short(ho[k])), e(String(ho[k + 'D']).replace('chip-in from ', 'chip-in, ')) + (s.final ? ' · H' + ho.n : '')); };
      tiles = '<div class="gb-h">' + T.h + '</div><div class="gb-ts">' + tl('bi', 'fo', 'FO', T.bi) + tl('ba', 'ct', 'CTP', T.ba) + tl('bo', 'lp', 'LP', T.bo) + '</div>';
    }
    // hole-by-hole dot grid (+ details of the tapped hole)
    var grid = '';
    for (var st = 0; st < s.total; st += 9) grid += gridBlock(s, st, Math.min(9, s.total - st));
    var sh = s.holes[selHole], det = sh ? '<div class="gb-det"><b>Hole ' + sh.n + ' · par ' + sh.par + '</b><span><i class="gd fo"></i>' + (sh.bi ? e(short(sh.bi)) + ', ' + e(sh.biD) : 'nobody') + '</span><span><i class="gd ct"></i>' + e(short(sh.ba)) + ', ' + e(sh.baD) + '</span><span><i class="gd lp"></i>' + e(short(sh.bo)) + ', ' + e(sh.boD) + '</span></div>' : '';
    el.innerHTML = status + strip +
      '<div class="card gb-c"><div class="gb-ch"><span class="bbb-sh">Standings</span>' + legend + '</div>' + rows + '</div>' + tiles +
      '<div class="card gb-c"><div class="gb-ch"><span class="bbb-sh">Hole by hole</span><small>tap a hole for distances</small></div>' + grid + det + '</div>' +
      '<details class="gb-rules"><summary>How Garbage works</summary><p><b>Furthest Out (FO)</b>: first on the green from furthest away (the shot onto the green can\'t be a mulligan replay; penalty strokes are fine). Par 3: anyone on from the tee counts the same whatever the tee; closest takes FO and CTP.</p><p><b>Closest to Pin (CTP)</b>: closest to the pin once everyone is on, played from off the green.</p><p><b>Longest Putt (LP)</b>: fewest putts, longest first putt breaks ties. A chip-in takes CTP and LP.</p><p>$1 a player; the leader at the end of the night takes the pot, a tie carries it to next week. In the grid, the three dots in each box are FO, CTP, LP from left to right.</p></details>' +
      '<div class="gb-demo">Demo points until the GSPro agent sends Garbage data.</div>';
  }
  window.renderBbb = renderPage;

  // ---- Admin > BBB ----
  function renderAdmin() {
    var el = document.getElementById('adminbbbbody'); if (!el) return;
    var c = cfg(), all = tonightNames(), sel = inPlayers(), guests = {};
    ((d().entry && d().entry.players) || []).forEach(function (p) { if (p.guest) guests[p.name] = 1; });
    el.innerHTML = '<div class="card bbba"><div class="bbba-h"><div><b>Garbage</b><small>' + e(d().title || 'Tonight') + '</small></div>' +
      '<button type="button" class="bbb-sw' + (c.on ? ' on' : '') + '" id="bbbsw" role="switch" aria-checked="' + !!c.on + '" aria-label="Garbage on tonight"><span></span></button></div>' +
      (c.on ? '<div class="bbba-l"><span>Who\'s playing (from Tonight)</span><span><button type="button" data-bbball="1">All</button> · <button type="button" data-bbball="0">None</button></span></div>' +
        ((d().cards || []).some(function (c) { return BBB_EXCLUDE.test(String(c.name).trim()); }) ? '<div class="bbba-f" style="border:0;padding:0">Jeff is left out of Garbage for now (remote play).</div>' : '') +
        (all.length ? all.map(function (n) { return '<label class="bbba-p"><input type="checkbox" data-bbbp="' + e(n) + '"' + (sel.indexOf(n) >= 0 ? ' checked' : '') + '>' + e(n) + (guests[n] ? ' <i>guest</i>' : '') + '</label>'; }).join('') : '<div class="empty">Nobody on Tonight yet.</div>') +
        '<label class="bbba-p" style="justify-content:space-between">Carried over from last week <span>$ <input type="number" min="0" step="1" inputmode="numeric" data-bbbcarry="1" value="' + (Number(c.carry) || 0) + '" style="width:64px;height:36px;font-size:15px;background:#101412;color:inherit;border:1px solid #2c3530;border-radius:8px;padding:0 8px"></span></label>' +
        '<div class="bbba-f">' + sel.length + ' playing · pot $' + (sel.length + (Number(c.carry) || 0)) + ' ($1 each' + (Number(c.carry) ? ' + carry' : '') + ')' + (sel.length < 2 ? ' · needs at least 2' : '') + '. Preview: saved on this phone only, with demo points.</div>' : '<div class="bbba-f">Off. Turn it on to pick tonight\'s BBB players.</div>') + '</div>';
  }
  window.renderAdminBbb = renderAdmin;
  function refresh() { syncPill(); renderAdmin(); if (typeof window.renderField === 'function') window.renderField(); renderPage(); }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var c;
    if (t.closest('#bbbsw')) { c = cfg(); c.on = !c.on; save(c); refresh(); }
    else if (t.closest('[data-bbball]')) { c = cfg(); c.players = t.closest('[data-bbball]').getAttribute('data-bbball') === '1' ? tonightNames() : []; save(c); refresh(); }
    else if (t.closest('#bbbopen')) { if (window.showTab) showTab('bbb'); renderPage(); window.scrollTo(0, 0); }
    else if (t.closest('[data-gbh]')) { selHole = Number(t.closest('[data-gbh]').getAttribute('data-gbh')); renderPage(); }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'bnsel') { setTimeout(renderPage, 50); setTimeout(renderPage, 1500); return; }
    var cr = ev.target.closest && ev.target.closest('[data-bbbcarry]');
    if (cr) { var cc = cfg(); cc.carry = Math.max(0, Math.round(Number(cr.value) || 0)); save(cc); refresh(); return; }
    var b = ev.target.closest && ev.target.closest('[data-bbbp]'); if (!b) return;
    var c = cfg(), cur = inPlayers(), n = b.getAttribute('data-bbbp');
    c.players = b.checked ? cur.concat([n]) : cur.filter(function (x) { return x !== n; }); save(c); refresh();
  });
})();
