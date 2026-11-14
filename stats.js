/*
 * Stats > Stats (redesign Nov 14, 2026). Two views:
 *   Everyone: one category at a time (Driving, Approach, Short game, Putting, Strokes gained), every player in a table
 *             sortable by any column; Tonight (or the last round) or Season.
 *   Me:       one player (the signed-in player by default): every stat with the season value, league rank, last round
 *             and a trend line by round, plus strokes gained by category as bars.
 * Data: d.statFeed (apps-script/stats-feed.gs): one row per player per night from GSPro Log; columns in d.statFeed.cols.
 * Tonight's penalty / mulligan holes still come from d.agentStats.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function st(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) { return null; } }
  var D = null;

  // Metric definitions. v(a) -> number or null from an aggregate; better: 1 = higher is better, -1 = lower is better.
  function per9(x, h) { return h ? x / h * 9 : null; }
  var M = {
    fw:    { l: 'FW', t: 'Fairways', u: '%', v: function (a) { return a.fwn ? a.fw / a.fwn * 100 : null; }, b: 1, f: 0, n: function (a) { return a.fw + '/' + a.fwn; } },
    drive: { l: 'Drive', t: 'Avg drive', u: ' yd', v: function (a) { return a.drN ? a.drSum / a.drN : null; }, b: 1, f: 0 },
    ld:    { l: 'LD', t: 'Longest drive', u: ' yd', v: function (a) { return a.ld || null; }, b: 1, f: 0, max: true },
    pen:   { l: 'Pen', t: 'Penalties', u: '', v: function (a) { return a.holes ? a.pen : null; }, b: -1, f: 0, tot: true },
    mull:  { l: 'Mull', t: 'Mulligans', u: '', v: function (a) { return a.holes ? a.mull : null; }, b: -1, f: 0, tot: true },
    gir:   { l: 'GIR', t: 'Greens in reg', u: '%', v: function (a) { return a.holes ? a.gir / a.holes * 100 : null; }, b: 1, f: 0, n: function (a) { return a.gir + '/' + a.holes; } },
    apyd:  { l: 'Appr', t: 'Approach distance', u: ' yd', v: function (a) { return a.apN ? a.apYd / a.apN : null; }, b: 0, f: 0, n: function (a) { return a.apN + ' shots'; } },
    prox:  { l: 'Prox', t: 'Proximity', u: ' ft', v: function (a) { return a.apN ? a.apFt / a.apN : null; }, b: -1, f: 0 },
    scr:   { l: 'Scr', t: 'Scrambling', u: '%', v: function (a) { return a.scrC ? a.scrS / a.scrC * 100 : null; }, b: 1, f: 0, n: function (a) { return a.scrS + '/' + a.scrC; } },
    sand:  { l: 'Sand', t: 'Sand saves', u: '%', v: function (a) { return a.sandC ? a.sandS / a.sandC * 100 : null; }, b: 1, f: 0, n: function (a) { return a.sandS + '/' + a.sandC; } },
    putts: { l: 'Putts', t: 'Putts per 9', u: '', v: function (a) { return per9(a.putts, a.holes); }, b: -1, f: 1 },
    three: { l: '3-putt', t: '3-putt holes', u: '%', v: function (a) { return a.holes ? a.three / a.holes * 100 : null; }, b: -1, f: 0, n: function (a) { return a.three + '/' + a.holes; } },
    ott:   { l: 'OTT', t: 'SG: Off the tee', u: '', v: function (a) { return per9(a.ott, a.sgH); }, b: 1, f: 2, sg: true },
    app:   { l: 'APP', t: 'SG: Approach', u: '', v: function (a) { return per9(a.app, a.sgH); }, b: 1, f: 2, sg: true },
    arg:   { l: 'ARG', t: 'SG: Around the green', u: '', v: function (a) { return per9(a.arg, a.sgH); }, b: 1, f: 2, sg: true },
    putt:  { l: 'PUTT', t: 'SG: Putting', u: '', v: function (a) { return per9(a.putt, a.sgH); }, b: 1, f: 2, sg: true },
    sgt:   { l: 'Total', t: 'SG: Total', u: '', v: function (a) { return per9(a.ott + a.app + a.arg + a.putt, a.sgH); }, b: 1, f: 2, sg: true }
  };
  var CATS = [
    { id: 'drive', l: 'Driving', m: ['fw', 'drive', 'ld', 'pen', 'mull'],
      key: '<b>FW</b> fairways hit on par 4s and 5s. <b>Drive</b> average drive that finished in the fairway; <b>LD</b> the longest. <b>Pen</b> penalty strokes, <b>Mull</b> mulligans (totals).' },
    { id: 'appr', l: 'Approach', m: ['gir', 'apyd', 'prox'],
      key: '<b>GIR</b> greens in regulation. <b>Appr</b> average distance to the pin before an approach shot; <b>Prox</b> average distance to the pin after it, in feet (PGA Tour "Proximity to Hole"). Approach = a shot from more than about 30 yards off the green (40 yards from the pin) that finishes on or around the green or in the hole; par 3 tee shots count, par 4/5 tee shots don\'t.' },
    { id: 'short', l: 'Short game', m: ['scr', 'sand', 'arg'],
      key: '<b>Scr</b> scrambling: missed the green in regulation and still made par or better. <b>Sand</b> up and down from a greenside bunker. <b>ARG</b> strokes gained around the green per 9 holes.' },
    { id: 'putt', l: 'Putting', m: ['putts', 'three', 'putt'],
      key: '<b>Putts</b> per 9 holes. <b>3-putt</b> share of holes with 3 or more putts. <b>PUTT</b> strokes gained putting per 9 holes.' },
    { id: 'sg', l: 'SG', m: ['ott', 'app', 'arg', 'putt', 'sgt'],
      key: 'Strokes gained per 9 holes against the average PGA Tour player (ShotLink baseline). 0 = Tour average; negative = strokes lost to a Tour pro. <b>OTT</b> tee shots on par 4s and 5s, <b>APP</b> approach shots, <b>ARG</b> within about 30 yards of the green, <b>PUTT</b> on the green. Starts with rounds after Nov 14.' }
  ];

  function rowsByPlayer(nightFilter) {
    var f = D.statFeed, out = {};
    if (!f || !f.rows) return out;
    var ci = {}; f.cols.forEach(function (c, i) { ci[c] = i; });
    f.rows.forEach(function (r) {
      if (nightFilter && r[ci.n] !== nightFilter) return;
      var p = r[ci.p], a = out[p];
      if (!a) { a = out[p] = { p: p, nights: 0 }; f.cols.forEach(function (c) { if (c !== 'p' && c !== 'n') a[c] = 0; }); }
      a.nights++;
      f.cols.forEach(function (c) { if (c === 'p' || c === 'n') return; if (c === 'ld') a.ld = Math.max(a.ld, r[ci.ld] || 0); else a[c] += Number(r[ci[c]]) || 0; });
    });
    return out;
  }
  function perNight(player) {
    var f = D.statFeed, out = [];
    if (!f || !f.rows) return out;
    (f.nights || []).forEach(function (n) { var a = rowsByPlayer(n)[player]; if (a) out.push({ n: n, a: a }); });
    return out;
  }
  function fmt(m, v) { if (v === null || v === undefined || isNaN(v)) return '–'; var s = m.f ? v.toFixed(m.f) : String(Math.round(v)); if (m.sg && v > 0) s = '+' + s; return s; }
  function short(n) { var sn = (D.shortNames || {})[n]; return sn || n; }
  function me() { var u = window.RL && RL.user(); return u ? u.name : ''; }
  function nightLabel(k) { return (D.statFeed && D.statFeed.labels && D.statFeed.labels[k]) || k; }
  function lastNight() { var f = D.statFeed; if (!f || !f.nights || !f.nights.length) return ''; return f.nights.indexOf(f.tonight) >= 0 ? f.tonight : f.nights[f.nights.length - 1]; }
  function rankOf(list, m, who) {
    var vals = list.map(function (a) { return { p: a.p, v: m.v(a) }; }).filter(function (x) { return x.v !== null; });
    var me0 = vals.filter(function (x) { return x.p === who; })[0];
    if (!me0 || !m.b) return null;
    var better = vals.filter(function (x) { return m.b > 0 ? x.v > me0.v + 1e-9 : x.v < me0.v - 1e-9; }).length;
    return { r: better + 1, of: vals.length };
  }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function spark(vals) {
    var pts = vals.filter(function (v) { return v !== null; });
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo || 1, w = 70, h = 18, k = 0, n = pts.length;
    var xy = pts.map(function (v) { var x = Math.round(k++ / (n - 1) * (w - 4) + 2); return [x, Math.round((h - 3) - (v - lo) / span * (h - 6))]; });
    var l = xy[xy.length - 1];
    return '<svg class="sx-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + xy.map(function (p) { return p.join(','); }).join(' ') + '"/><circle cx="' + l[0] + '" cy="' + l[1] + '" r="2"/></svg>';
  }

  var S = { view: st('sxView') || 'all', scope: st('sxScope') || 'season', cat: st('sxCat') || 'drive', sort: {}, who: '' };
  try { S.sort = JSON.parse(st('sxSort') || '{}') || {}; } catch (x) { S.sort = {}; }

  function renderAll(box) {
    var ln = lastNight(), tonightHas = D.statFeed && D.statFeed.tonight === ln;
    var scopeNight = S.scope === 'night' ? ln : '';
    var data = rowsByPlayer(scopeNight), list = Object.keys(data).map(function (k) { return data[k]; });
    var cat = CATS.filter(function (c) { return c.id === S.cat; })[0] || CATS[0];
    var sk = S.sort[cat.id] || cat.m[0], sm = M[sk];
    var dir = sm.b === 0 ? -1 : sm.b;   // approach distance: longest first
    list.sort(function (x, y) {
      var a = sm.v(x), b = sm.v(y);
      if (a === null && b === null) return x.p < y.p ? -1 : 1;
      if (a === null) return 1; if (b === null) return -1;
      return dir > 0 ? b - a : a - b;
    });
    var u = me();
    var html = '<div class="sx-chips" role="tablist">' + CATS.map(function (c) {
      return '<button type="button" data-sxcat="' + c.id + '" class="' + (c.id === cat.id ? 'on' : '') + '">' + c.l + '</button>';
    }).join('') + '</div>';
    html += '<div class="sx-scope seg" role="group"><button type="button" data-sxscope="night" class="' + (S.scope === 'night' ? 'on' : '') + '">' + (tonightHas ? 'Tonight' : (ln ? nightLabel(ln) : 'Last round')) + '</button>' +
      '<button type="button" data-sxscope="season" class="' + (S.scope !== 'night' ? 'on' : '') + '">Season</button></div>';
    if (!list.length) return box.innerHTML = html + '<div class="card empty">' + (S.scope === 'night' ? 'No stats for this round yet. They fill in as GSPro sends holes.' : 'No stats yet. They build up as GSPro sends holes.') + '</div>';
    var prev = null, rank = 0;
    html += '<div class="card sx-card"><table class="stand sx-t' + (cat.m.length > 4 ? ' sx-5' : '') + '"><colgroup><col class="c-r"><col>' + cat.m.map(function () { return '<col class="c-m">'; }).join('') + '</colgroup><tr><th class="n">#</th><th>Player</th>' +
      cat.m.map(function (k) { return '<th class="n sx-h' + (k === sk ? ' on' : '') + '" data-sxsort="' + k + '">' + M[k].l + (k === sk ? (dir > 0 ? ' ▾' : ' ▴') : '') + '</th>'; }).join('') + '</tr>' +
      list.map(function (a, i) {
        var v = sm.v(a);
        if (v === null) rank = ''; else if (prev === null || Math.abs(v - prev) > 1e-9) { rank = i + 1; prev = v; }
        return '<tr class="' + (a.p === u ? 'sx-me' : '') + '"><td class="n">' + rank + '</td><td class="sx-pl" title="' + e(a.p) + '">' + e(short(a.p)) +
          '<small>' + (S.scope === 'night' ? a.holes + ' holes' : a.nights + ' rd' + (a.nights === 1 ? '' : 's')) + '</small></td>' +
          cat.m.map(function (k) { var m = M[k], x = m.v(a); return '<td class="n' + (k === sk ? ' b' : '') + (m.sg && x !== null ? (x >= 0 ? ' sx-pos' : ' sx-neg') : '') + '">' + fmt(m, x) + (m.u === '%' && x !== null ? '<span class="sx-u">%</span>' : '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table>';
    html += '<div class="paykey">' + cat.key + ' Tap a column to sort.</div>';
    // Tonight's penalty / mulligan holes (Driving only)
    var ag = D.agentStats;
    if (cat.id === 'drive' && S.scope === 'night' && tonightHas && ag && ag.players) {
      var hl = function (l) { return (l || []).map(function (h) { return h.hole + (h.n > 1 ? ' (' + h.n + ')' : ''); }).join(', '); };
      html += ag.players.filter(function (s) { return s.pen || s.mull; }).map(function (s) {
        return '<div class="paykey"><b>' + e(short(s.player)) + '</b>' + (s.pen ? ' · Penalties on ' + hl(s.penHoles) : '') + (s.mull ? ' · Mulligans on ' + hl(s.mullHoles) : '') + '</div>';
      }).join('');
    }
    box.innerHTML = html + '</div>';
  }

  function renderMe(box) {
    var season = rowsByPlayer(''), list = Object.keys(season).map(function (k) { return season[k]; });
    var names = list.map(function (a) { return a.p; }).sort();
    var who = S.who || me();
    if (names.indexOf(who) < 0) who = names[0] || '';
    var html = '<div class="card picker"><label for="sxwho">Player</label><select id="sxwho">' + names.map(function (n) { return '<option' + (n === who ? ' selected' : '') + '>' + e(n) + '</option>'; }).join('') + '</select></div>';
    if (!who) return box.innerHTML = html + '<div class="card empty">No stats yet. They build up as GSPro sends holes.</div>';
    var a = season[who], nights = perNight(who), last = nights.length ? nights[nights.length - 1] : null;
    html += '<div class="sx-sum">' + e(who) + ' · ' + a.nights + ' round' + (a.nights === 1 ? '' : 's') + ' · ' + a.holes + ' holes' + (last ? ' · last round ' + e(nightLabel(last.n)) : '') + '</div>';
    // Strokes gained bars
    var sgKeys = ['ott', 'app', 'arg', 'putt'];
    if (a.sgH) {
      var vals = sgKeys.map(function (k) { return M[k].v(a); }), mx = Math.max.apply(null, vals.map(function (v) { return Math.abs(v); }).concat([0.5]));
      html += '<div class="card sx-sg"><div class="pp-t">Strokes gained per 9 holes <span class="sx-tot ' + (M.sgt.v(a) >= 0 ? 'sx-pos' : 'sx-neg') + '">' + fmt(M.sgt, M.sgt.v(a)) + '</span></div>' +
        sgKeys.map(function (k, i) {
          var v = vals[i], w = Math.round(Math.abs(v) / mx * 50);
          return '<div class="sx-bar"><span class="sx-bl">' + M[k].t.replace('SG: ', '') + '</span><span class="sx-bt"><i class="' + (v >= 0 ? 'p' : 'n') + '" style="' + (v >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w + '%"></i></span><b class="' + (v >= 0 ? 'sx-pos' : 'sx-neg') + '">' + fmt(M[k], v) + '</b></div>';
        }).join('') + '<div class="paykey">Against the average PGA Tour player (0). Bars left = strokes lost.</div></div>';
    } else {
      html += '<div class="card sx-sg"><div class="pp-t">Strokes gained</div><div class="paykey">Starts with your next round once the GSPro agent update is in.</div></div>';
    }
    CATS.forEach(function (c) {
      if (c.id === 'sg') return;
      var ks = c.m.filter(function (k) { return !M[k].sg; });
      html += '<div class="card sx-mine"><div class="pp-t">' + c.l + '</div>' + ks.map(function (k) {
        var m = M[k], v = m.v(a), rk = rankOf(list, m, who), tr = nights.map(function (x) { return m.v(x.a); });
        var lv = last ? m.v(last.a) : null;
        return '<div class="sx-row"><div class="sx-rl">' + m.t + (m.n && v !== null ? '<small>' + m.n(a) + '</small>' : '') + '</div>' +
          '<div class="sx-rv">' + fmt(m, v) + (v !== null ? m.u : '') + (rk ? '<small>' + ord(rk.r) + ' of ' + rk.of + '</small>' : '') + '</div>' +
          '<div class="sx-rt">' + spark(tr) + (nights.length > 1 && lv !== null ? '<small>last ' + fmt(m, lv) + (m.u === '%' ? '%' : '') + '</small>' : '') + '</div></div>';
      }).join('') + '</div>';
    });
    html += '<div class="paykey sx-foot">Rank is among everyone with that stat this season. The line shows the stat round by round, oldest to newest.</div>';
    box.innerHTML = html;
  }

  window.renderStats = function (d) {
    if (d) D = d;
    var box = document.getElementById('sxbody');
    if (!box || !D) return;
    document.querySelectorAll('[data-sxview]').forEach(function (b) { var on = b.getAttribute('data-sxview') === S.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (S.view === 'me') renderMe(box); else renderAll(box);
  };

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var b;
    if ((b = t.closest('[data-sxview]'))) { S.view = b.getAttribute('data-sxview'); st('sxView', S.view); }
    else if ((b = t.closest('[data-sxcat]'))) { S.cat = b.getAttribute('data-sxcat'); st('sxCat', S.cat); }
    else if ((b = t.closest('[data-sxscope]'))) { S.scope = b.getAttribute('data-sxscope'); st('sxScope', S.scope); }
    else if ((b = t.closest('[data-sxsort]'))) { S.sort[S.cat] = b.getAttribute('data-sxsort'); st('sxSort', JSON.stringify(S.sort)); }
    else return;
    window.renderStats();
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'sxwho') { S.who = ev.target.value; window.renderStats(); }
  });
})();
