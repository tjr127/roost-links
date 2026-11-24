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
  function tonightNames() { return (d().cards || []).map(function (c) { return c.name; }); }
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
    return { ps: ps, total: total, holes: holes, pts: pts, order: order, left: (total - holes.length) * 3, final: holes.length === total, anyScores: anyScores };
  }
  function leaders(s) { var top = s.order.length ? s.pts[s.order[0]].t : 0; return s.order.filter(function (p) { return s.pts[p].t === top && top > 0; }); }

  // ---- Individual board: card + column ----
  function card(s) {
    var L = leaders(s), last = s.holes[s.holes.length - 1], st = s.final ? 'final' : s.holes.length ? 'live' : 'pre';
    var head = st === 'final' ? 'BBB · final' : st === 'live' ? 'BBB · live' : 'BBB tonight';
    var body;
    if (st === 'pre') body = '<b>' + s.ps.length + ' players</b><span class="bbb-s">' + s.total * 3 + ' pts up for grabs</span>';
    else {
      var rest = s.order.filter(function (p) { return L.indexOf(p) < 0; }).slice(0, 2).map(function (p) { return e(short(p)) + ' ' + s.pts[p].t; }).join(' · ');
      var hl = '';
      if (st === 'final') { var mb = s.order.slice().sort(function (a, b) { return s.pts[b].bi - s.pts[a].bi; })[0]; hl = 'Most Bingos: ' + e(short(mb)) + ' (' + s.pts[mb].bi + ')'; }
      else if (last) hl = 'H' + last.n + ': ' + (last.tag === 'chip' ? e(short(last.ba)) + ' chip-in ×2' : last.tag === 'p3' ? e(short(last.bi)) + ' par-3 ×2' : 'Bango ' + e(short(last.ba)));
      body = '<b>' + e(L.map(short).join(' & ')) + ' <span class="bbb-n">' + (L.length ? s.pts[L[0]].t : 0) + '</span></b>' + (rest ? '<span class="bbb-s">' + rest + '</span>' : '') + '<span class="bbb-h">' + hl + '</span>';
    }
    return '<button type="button" class="card bbbc ' + st + '" id="bbbopen"><span class="bbb-k">' + head + (st === 'live' ? '<i>thru ' + s.holes.length + '</i>' : '') + '</span>' + body + '</button>';
  }
  window.bbbAfterField = function () {
    var row = document.getElementById('bbbrow'), bc = document.getElementById('bbbcard'), on = window.bbbOn();
    if (!row || !bc) return;
    row.classList.toggle('on', on);
    var t = document.querySelector('#fieldcard table.fld');
    if (!on) { bc.innerHTML = ''; return; }
    var s = compute(); bc.innerHTML = card(s);
    if (!t || t.classList.contains('bbb')) return;
    t.classList.add('bbb');
    var cg = t.querySelector('colgroup'); if (cg) { var c = document.createElement('col'); c.className = 'c-m'; cg.appendChild(c); }
    var L = leaders(s);
    [].forEach.call(t.querySelectorAll('tr'), function (tr, i) {
      if (i === 0) { var th = document.createElement('th'); th.className = 'n bbb-th'; th.textContent = 'BBB'; tr.appendChild(th); return; }
      var name = tr.getAttribute('data-fxrow'), td = document.createElement('td'); td.className = 'n';
      if (!name || !s.pts[name]) td.innerHTML = '<span class="bbb-out">–</span>';
      else td.innerHTML = L.indexOf(name) >= 0 ? '<span class="putw bbb-lead">' + s.pts[name].t + '</span>' : String(s.pts[name].t);
      tr.appendChild(td);
    });
  };

  // ---- BBB page ----
  function renderPage() {
    var el = document.getElementById('bbbbody'); if (!el) return;
    if (!window.bbbOn()) { el.innerHTML = '<div class="card empty">Bingo Bango Bongo isn\'t on tonight.</div>'; return; }
    var s = compute(), last = s.holes[s.holes.length - 1];
    var mk = function (h, k) { var p = h[k]; if (!p) return '<td class="bbb-out">—</td>'; var star = (h.tag === 'p3' && (k === 'bi' || k === 'ba')) ? ' ★' : (h.tag === 'chip' && (k === 'ba' || k === 'bo')) ? ' ⛳' : ''; return '<td' + (star ? ' class="bbb-x"' : '') + '>' + e(short(p)) + star + '</td>'; };
    var best = function (k, lbl) { var hs = s.holes.filter(function (h) { return h[k]; }); if (!hs.length) return ''; var h = hs[hash(k + hs.length) % hs.length]; return '<div>' + lbl + ': <b>' + e(short(h[k])) + '</b>, ' + e(h[k + 'D']) + ' (H' + h.n + ')</div>'; };
    el.innerHTML =
      '<div class="bbb-top"><button type="button" class="bbb-back" id="bbbback">‹ Board</button><b class="bbb-title">Bingo Bango Bongo</b><span>' + (s.final ? 'Final' : s.holes.length ? 'Thru ' + s.holes.length : 'Not started') + '</span></div>' +
      '<div class="bbb-demo">Demo points — real points come once the GSPro agent sends BBB data.</div>' +
      '<div class="card"><div class="bbb-sh">Standings' + (s.final ? '' : ' · ' + s.left + ' pts left') + '</div><table class="bbbt"><colgroup><col style="width:9%"><col><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup>' +
      '<tr><th>#</th><th class="l">Player</th><th>Bingo</th><th>Bango</th><th>Bongo</th><th class="a">Tot</th></tr>' +
      s.order.map(function (p, i) { var x = s.pts[p]; return '<tr><td class="m">' + (i + 1) + '</td><td class="l">' + e(p) + '</td><td>' + x.bi + '</td><td>' + x.ba + '</td><td>' + x.bo + '</td><td class="a">' + x.t + '</td></tr>'; }).join('') + '</table></div>' +
      (last ? '<div class="card bbb-last"><div class="bbb-sh a">Latest · Hole ' + last.n + ' · par ' + last.par + '</div>' +
        '<div><b>Bingo</b>' + (last.bi ? e(short(last.bi)) + ' — ' + (last.par === 3 ? 'on from the tee, ' : 'on from ') + e(last.biD) : 'nobody on from the tee') + '</div>' +
        '<div><b>Bango</b>' + e(short(last.ba)) + ' — ' + e(last.baD) + '</div><div><b>Bongo</b>' + e(short(last.bo)) + ' — ' + e(last.boD) + '</div></div>' : '') +
      '<div class="card"><div class="bbb-sh">Hole by hole</div><table class="bbbt hh"><colgroup><col style="width:15%"><col style="width:13%"><col><col><col></colgroup><tr><th class="l">Hole</th><th>Par</th><th>Bi</th><th>Ba</th><th>Bo</th></tr>' +
      s.holes.map(function (h) { return '<tr><td class="l">' + h.n + '</td><td class="m">' + h.par + '</td>' + mk(h, 'bi') + mk(h, 'ba') + mk(h, 'bo') + '</tr>'; }).join('') +
      (s.final ? '' : '<tr><td class="l m">' + (s.holes.length + 1) + '</td><td class="m">·</td><td class="m">·</td><td class="m">·</td><td class="m">·</td></tr>') + '</table>' +
      '<div class="bbb-key">★ par-3 tee shot takes Bingo + Bango · ⛳ chip-in takes Bango + Bongo · — nobody on from the tee</div></div>' +
      (s.holes.length ? '<div class="card bbb-best"><div class="bbb-sh">Tonight\'s bests</div>' + best('bi', 'Longest Bingo') + best('ba', 'Tightest Bango') + best('bo', 'Longest Bongo') + '</div>' : '') +
      '<div class="bbb-rules"><b>Rules</b> · Bingo: first on the green from furthest away (the shot onto the green can\'t be a mulligan replay; penalty strokes are fine). Par 3: anyone on from the tee counts the same whatever the tee; closest takes Bingo and Bango. Bango: closest to the pin once everyone is on, played from off the green. Bongo: fewest putts, longest first putt breaks ties. A chip-in takes Bango and Bongo.</div>';
  }
  window.renderBbb = renderPage;

  // ---- Admin > BBB ----
  function renderAdmin() {
    var el = document.getElementById('adminbbbbody'); if (!el) return;
    var c = cfg(), all = tonightNames(), sel = inPlayers(), guests = {};
    ((d().entry && d().entry.players) || []).forEach(function (p) { if (p.guest) guests[p.name] = 1; });
    el.innerHTML = '<div class="card bbba"><div class="bbba-h"><div><b>Bingo Bango Bongo</b><small>' + e(d().title || 'Tonight') + '</small></div>' +
      '<button type="button" class="bbb-sw' + (c.on ? ' on' : '') + '" id="bbbsw" role="switch" aria-checked="' + !!c.on + '" aria-label="Bingo Bango Bongo on tonight"><span></span></button></div>' +
      (c.on ? '<div class="bbba-l"><span>Who\'s playing (from Tonight)</span><span><button type="button" data-bbball="1">All</button> · <button type="button" data-bbball="0">None</button></span></div>' +
        (all.length ? all.map(function (n) { return '<label class="bbba-p"><input type="checkbox" data-bbbp="' + e(n) + '"' + (sel.indexOf(n) >= 0 ? ' checked' : '') + '>' + e(n) + (guests[n] ? ' <i>guest</i>' : '') + '</label>'; }).join('') : '<div class="empty">Nobody on Tonight yet.</div>') +
        '<div class="bbba-f">' + sel.length + ' playing' + (sel.length < 2 ? ' · needs at least 2' : '') + '. Preview: saved on this phone only, with demo points.</div>' : '<div class="bbba-f">Off. Turn it on to pick tonight\'s BBB players.</div>') + '</div>';
  }
  window.renderAdminBbb = renderAdmin;
  function refresh() { renderAdmin(); if (typeof window.renderField === 'function') window.renderField(); renderPage(); }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var c;
    if (t.closest('#bbbsw')) { c = cfg(); c.on = !c.on; save(c); refresh(); }
    else if (t.closest('[data-bbball]')) { c = cfg(); c.players = t.closest('[data-bbball]').getAttribute('data-bbball') === '1' ? tonightNames() : []; save(c); refresh(); }
    else if (t.closest('#bbbopen')) { if (window.showTab) showTab('bbb'); renderPage(); window.scrollTo(0, 0); }
    else if (t.closest('#bbbback')) { if (window.showTab) showTab('field'); }
  });
  document.addEventListener('change', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-bbbp]'); if (!b) return;
    var c = cfg(), cur = inPlayers(), n = b.getAttribute('data-bbbp');
    c.players = b.checked ? cur.concat([n]) : cur.filter(function (x) { return x !== n; }); save(c); refresh();
  });
})();
