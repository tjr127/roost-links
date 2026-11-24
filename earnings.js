/*
 * Season > Earnings (Nov 24, 2026). What each league member has won and paid in this season.
 * Worked out on the page from posted nights (?api=rounds list, ?api=boardpast&night= per league night):
 *   Low net     $5 a player (guests too), lowest net takes the pot, ties split.
 *   Team game   $5 a player, winning team splits the pot; ties: lowest combined net, then combined putts.
 *               Needs the night's Team Log snapshot (kept from Nov 19, 2026) or a TEAM_FIX entry below.
 *   Putting pot $1 a player from Nov 12, Low/High alternating, a tie carries the pot to the next league night.
 *   Season      $70 entry per member (regular season + playoffs prize money, paid at the end).
 * Not in any feed yet, so listed by hand in EXTRA: CTP game money (from the CTP Log tab). Garbage joins once it is scored for real.
 * Members only (data.standings); guests' buy-ins and wins still count in the pots.
 */
(function () {
  var BUY = { net: 5, team: 5, putt: 1, season: 70 }, PUTT_START = '2026-11-12', SEASON_PAY = [180, 130, 80], PLAYOFF_POOL = 450, SEASON_PUTTS = 120;
  var GAMES = [['net', 'Low net'], ['team', 'Team game'], ['putt', 'Putting pot (nightly)'], ['garb', 'Garbage'], ['ctp', 'CTP game'], ['sputt', 'Season putts'], ['season', 'Season & playoffs']];
  var SEASON_SETTLED = false;   // the $70 entry is counted in Net only once the season and playoff prizes are paid (and added below)
  var TEAM_FIX = {};   // night -> { lowWins, teams: [{ players: 'A/B', score }] } for nights with no Team Log snapshot
  var EXTRA = [{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Clint","won":0,"paid":15},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Donnie","won":20,"paid":9},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Jeff","won":7,"paid":12},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"KOB","won":41,"paid":20},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Nick","won":0,"paid":3},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Schertzer","won":0,"paid":4},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Stonesniffer","won":7,"paid":1},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Sunderman","won":0,"paid":4},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Ty","won":16,"paid":19},{"n":"2026-11-20","l":"Fri Nov 20 \u00b7 CTP game","g":"ctp","p":"Walty","won":0,"paid":4}];
  var st = { nights: null, by: {}, busy: false, sort: 'net', open: '', err: false };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); }
  function usd(v) { v = Math.abs(v); return '$' + (Math.round(v * 100) % 100 ? v.toFixed(2) : String(Math.round(v))); }
  function net$(v) { return '<span class="' + (v > 0.004 ? 'ern-up' : v < -0.004 ? 'ern-dn' : 'ern-0') + '">' + (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + usd(v) + '</span>'; }
  function me() { try { var u = window.RL && RL.user && RL.user(); return (u && u.name) || ''; } catch (x) { return ''; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) { return null; } }

  function load() {
    if (st.busy || !window.RL || !RL.get) return;
    st.busy = true;
    RL.get('rounds').then(function (j) {
      st.nights = (j.nights || []).filter(function (x) { return x.type === 'League'; }).sort(function (a, b) { return a.night < b.night ? -1 : 1; });
      return Promise.all(st.nights.map(function (x, i) {
        var c = null; try { c = JSON.parse(ls('earn:' + x.night) || 'null'); } catch (z) {}
        var newest = i >= st.nights.length - 2;   // older nights never change; the last two are re-read every 10 minutes
        if (c && c.d && (!newest || Date.now() - c.at < 600000)) { st.by[x.night] = c.d; return null; }
        if (c && c.d) st.by[x.night] = c.d;
        return RL.get('boardpast', '&night=' + encodeURIComponent(x.night)).then(function (d) { if (d && d.field) { st.by[x.night] = d; ls('earn:' + x.night, JSON.stringify({ d: d, at: Date.now() })); } }, function () {});
      }));
    }, function () { st.err = true; st.nights = st.nights || []; }).then(function () { st.busy = false; st.at = Date.now(); render(); });
  }

  function compute() {
    var d = window.data || {}, members = (d.standings || []).map(function (x) { return x.player; }).filter(Boolean);
    var L = [], carry = 0, pIdx = 0, noTeam = [];
    function add(n, l, g, p, won, paid) { if (won || paid) L.push({ n: n, l: l, g: g, p: p, won: won || 0, paid: paid || 0 }); }
    (st.nights || []).forEach(function (x) {
      var b = st.by[x.night], f = (b && b.field) || []; if (!f.length) return;
      var names = f.map(function (r) { return r.player; }), n = names.length, by = {}; f.forEach(function (r) { by[r.player] = r; });
      // low net
      var nets = f.filter(function (r) { return num(r.net) !== null; }), low = Math.min.apply(null, nets.map(function (r) { return num(r.net); }));
      var nw = nets.filter(function (r) { return num(r.net) === low; }).map(function (r) { return r.player; });
      names.forEach(function (p) { add(x.night, x.label, 'net', p, nw.indexOf(p) >= 0 ? BUY.net * n / nw.length : 0, BUY.net); });
      // team game
      var tm = (b && b.team) || TEAM_FIX[x.night];
      if (tm && tm.teams && tm.teams.length) {
        var sc = tm.teams.map(function (t) { return num(t.score); }).filter(function (v) { return v !== null; }), best = tm.lowWins === false ? Math.max.apply(null, sc) : Math.min.apply(null, sc);
        var top = tm.teams.filter(function (t) { return num(t.score) === best; });
        ['net', 'putts'].forEach(function (k) {
          if (top.length < 2) return;
          var v = top.map(function (t) { var s = 0, ok = true; String(t.players).split('/').forEach(function (p) { var q = by[p.trim()], z = q ? num(q[k]) : null; if (z === null) ok = false; else s += z; }); return ok ? s : null; });
          if (v.some(function (z) { return z === null; })) return;
          var m = Math.min.apply(null, v); top = top.filter(function (t, i) { return v[i] === m; });
        });
        var share = {}; top.forEach(function (t) { var ps = String(t.players).split('/').map(function (p) { return p.trim(); }); ps.forEach(function (p) { share[p] = (share[p] || 0) + BUY.team * n / top.length / ps.length; }); });
        names.forEach(function (p) { add(x.night, x.label, 'team', p, share[p] || 0, BUY.team); });
      } else noTeam.push(x);
      // nightly putting pot
      var pf = f.filter(function (r) { return num(r.putts) !== null; });
      if (x.night >= PUTT_START && pf.length) {
        var high = pIdx % 2 === 1; pIdx++;
        var pot = carry + BUY.putt * n, pv = pf.map(function (r) { return num(r.putts); }), bestP = high ? Math.max.apply(null, pv) : Math.min.apply(null, pv);
        var pw = pf.filter(function (r) { return num(r.putts) === bestP; }).map(function (r) { return r.player; });
        names.forEach(function (p) { add(x.night, x.label, 'putt', p, pw.length === 1 && pw[0] === p ? pot : 0, BUY.putt); });
        carry = pw.length === 1 ? 0 : pot;
      }
    });
    EXTRA.forEach(function (x) { add(x.n, x.l, x.g, x.p, x.won, x.paid); });
    if (SEASON_SETTLED) members.forEach(function (p) { add('', 'Season entry', 'season', p, 0, BUY.season); });
    var T = {}; members.forEach(function (p) { T[p] = { p: p, won: 0, paid: 0, g: {}, rows: [] }; });
    L.forEach(function (r) { var t = T[r.p]; if (!t) return; t.won += r.won; t.paid += r.paid; var g = t.g[r.g] = t.g[r.g] || { won: 0, paid: 0 }; g.won += r.won; g.paid += r.paid; t.rows.push(r); });
    return { members: members, T: T, carry: carry, noTeam: noTeam };
  }
  function seasonProj(p) {   // regular-season money if it ended today (ties on points share the places they cover)
    var s = ((window.data || {}).standings || []).filter(function (x) { return num(x.pts) !== null; }), mine = s.filter(function (x) { return x.player === p; })[0]; if (!mine) return null;
    var mp = num(mine.pts), above = s.filter(function (x) { return num(x.pts) > mp; }).length, tied = s.filter(function (x) { return num(x.pts) === mp; }).length, pot = 0;
    for (var i = above; i < above + tied; i++) pot += SEASON_PAY[i] || 0;
    return { place: (tied > 1 ? 'T' : '') + (above + 1), amt: pot / tied };
  }

  function render() {
    var el = document.getElementById('earnbody'); if (!el) return;
    if (!st.nights) { el.innerHTML = '<div class="card empty">Adding up the season…</div>'; return; }
    var c = compute(), y = me(), rows = c.members.map(function (p) { return c.T[p]; });
    rows.sort(function (a, b) { return st.sort === 'won' ? b.won - a.won || (b.won - b.paid) - (a.won - a.paid) : (b.won - b.paid) - (a.won - a.paid) || b.won - a.won || a.p.localeCompare(b.p); });
    if (st.open && c.T[st.open]) { el.innerHTML = detail(c, c.T[st.open]); return; }
    var hero = '', my = c.T[y];
    if (my) {
      var rk = rows.slice().sort(function (a, b) { return (b.won - b.paid) - (a.won - a.paid); }), pos = rk.filter(function (r) { return r.won - r.paid > my.won - my.paid; }).length + 1, nv = my.won - my.paid;
      var nights = {}; my.rows.forEach(function (r) { if (r.n) { nights[r.n] = nights[r.n] || { l: r.l, v: 0 }; nights[r.n].v += r.won - r.paid; } });
      var bn = Object.keys(nights).map(function (k) { return nights[k]; }).sort(function (a, b) { return b.v - a.v; })[0];
      hero = '<div class="gb-lead ern-hero' + (nv >= 0 ? ' fin' : ' dn') + '"><div><span class="gb-k">Your season · ' + e(y) + '</span><small>Won ' + usd(my.won) + ' · paid in ' + usd(my.paid) + '</small><small>' + pos + ' of ' + rows.length + (bn && bn.v > 0 ? ' · best night ' + e(String(bn.l).split(' · ')[0]) + ' (+' + usd(bn.v) + ')' : '') + '</small></div><div class="gb-big">' + (nv > 0 ? '+' : nv < 0 ? '−' : '') + usd(nv) + '<small>net</small></div></div>';
    }
    var seg = '<span class="ern-seg" role="group" aria-label="Sort by"><button type="button" data-earnsort="net"' + (st.sort === 'net' ? ' class="on"' : '') + '>Net</button><button type="button" data-earnsort="won"' + (st.sort === 'won' ? ' class="on"' : '') + '>Won</button></span>';
    var tbl = '<table class="ern-t"><tr><th class="l p">#</th><th class="l">Player</th><th>Won</th><th>Paid in</th><th>Net</th></tr>' + rows.map(function (r, i) {
      return '<tr' + (r.p === y ? ' class="me"' : '') + '><td class="l p">' + (i + 1) + '</td><td class="l"><button type="button" data-earn="' + e(r.p) + '">' + e(r.p) + ' <i>›</i></button></td><td>' + usd(r.won) + '</td><td class="m">' + usd(r.paid) + '</td><td class="b">' + net$(r.won - r.paid) + '</td></tr>';
    }).join('') + '</table>';
    var left = '<div class="card ern-left"><div class="bbb-sh">Still to be won</div>' + (c.carry ? '<div><span>Putting pot carried over</span><b>' + usd(c.carry) + '</b></div>' : '') +
      '<div><span>Season putts (Low + High)</span><b>' + usd(SEASON_PUTTS) + '</b></div><div><span>Regular season (1st / 2nd / 3rd)</span><b>' + usd(SEASON_PAY[0] + SEASON_PAY[1] + SEASON_PAY[2]) + '</b></div><div><span>Playoffs</span><b>' + usd(PLAYOFF_POOL) + '</b></div></div>';
    var note = '<div class="ern-note">Net = money won minus money paid in. Counts low net, team game, nightly putting pot, CTP game (through Nov 20). The $70 season entry is counted when the season and playoff prizes are paid. Garbage joins once it is scored for real.' +
      (c.noTeam.length ? ' Team game results weren\'t saved for ' + c.noTeam.map(function (x) { return e(String(x.label).split(' · ')[0]); }).join(' and ') + ', so the team game isn\'t counted on ' + (c.noTeam.length > 1 ? 'those nights' : 'that night') + '.' : '') + ' Tap a player for the breakdown.' + (st.err ? ' Couldn\'t reach the server just now; showing what\'s saved on this phone.' : '') + '</div>';
    el.innerHTML = hero + '<div class="ern-h"><span class="bbb-sh">All players</span>' + seg + '</div><div class="card ern-c">' + tbl + '</div>' + left + note;
  }
  function detail(c, t) {
    var nv = t.won - t.paid;
    var g = '<table class="ern-t"><tr><th class="l">By game</th><th>Won</th><th>Paid in</th><th>Net</th></tr>' + GAMES.map(function (k) {
      var x = t.g[k[0]]; return '<tr><td class="l g">' + k[1] + '</td>' + (x ? '<td>' + (x.won ? usd(x.won) : '–') + '</td><td class="m">' + (x.paid ? usd(x.paid) : '–') + '</td><td class="b">' + net$(x.won - x.paid) + '</td>' : '<td class="m">–</td><td class="m">–</td><td class="m">–</td>') + '</tr>';
    }).join('') + '<tr class="tot"><td class="l">Total</td><td>' + usd(t.won) + '</td><td class="m">' + usd(t.paid) + '</td><td class="b">' + net$(nv) + '</td></tr></table>';
    var by = {}, keys = [];
    t.rows.forEach(function (r) { var k = r.n + '|' + r.l; if (!by[k]) { by[k] = { n: r.n, l: r.l, v: 0, parts: [] }; keys.push(k); } by[k].v += r.won - r.paid; var lab = { net: 'Low net', team: 'Team', putt: 'Putting', garb: 'Garbage', ctp: 'CTP game', season: 'Regular season and playoffs buy-in' }[r.g] || r.g, d = r.won - r.paid; by[k].parts.push(r.g === 'season' ? lab : lab + ' ' + (d > 0 ? '+' : d < 0 ? '−' : '') + usd(d)); });
    var nights = keys.map(function (k) { return by[k]; }).sort(function (a, b) { return (b.n || '0') < (a.n || '0') ? -1 : 1; }).map(function (x) {
      return '<div class="card ern-n"><div><b>' + e(x.l) + '</b><b class="num">' + net$(x.v) + '</b></div><small>' + x.parts.map(e).join(' · ') + '</small></div>';
    }).join('');
    var pr = seasonProj(t.p), proj = pr ? '<div class="card ern-left ern-proj"><div class="bbb-sh">If the season ended today · not counted yet</div><div><span>Regular season: ' + e(pr.place) + '</span><b class="' + (pr.amt ? 'ern-up' : 'ern-0') + '">' + usd(pr.amt) + '</b></div></div>' : '';
    return '<div class="ern-top"><button type="button" class="bbb-back" data-earn="">‹ All players</button><b>' + e(t.p) + '</b><b class="num">' + net$(nv) + '</b></div><div class="card ern-c">' + g + '</div><div class="gb-h">By night</div>' + nights + proj;
  }
  window.renderEarnings = function () { render(); if (!st.nights || Date.now() - (st.at || 0) > 300000) load(); };
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-earn],[data-earnsort]'); if (!t) return;
    if (t.hasAttribute('data-earnsort')) st.sort = t.getAttribute('data-earnsort'); else { st.open = t.getAttribute('data-earn'); window.scrollTo(0, 0); }
    render();
  });
})();
