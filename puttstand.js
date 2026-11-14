/*
 * Season putt standings (Nov 14, 2026): Standings tab > Putts.
 * Data: d.puttStand from the server (apps-script/putt-standings.gs): each league member's counted rounds
 * (first 9 league rounds with putts, date order) plus cap, payout, nights left.
 * Shows: leader cards (Low / High by average, since players have different round counts), the table sorted by
 * total putts (Rds, Total, Avg with a trend arrow, Pace = avg x 9, sparkline of putts by round), an even comparison
 * over everyone's first N rounds, and the rules. Tap a player for their rounds.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(v) { return '$' + (Math.round(v * 100) % 100 ? v.toFixed(2) : String(Math.round(v))); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function same(a, b) { return Math.abs(a - b) < 1e-9; }
  function names(list) {
    var n = list.map(function (p) { return p.name; });
    return n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }
  var open = {};
  // Short names from the Players tab (column L) where set, so the table fits a phone (Ty, Nov 14).
  function shortName(n) { var sn = ((last && last.shortNames) || {})[n]; return sn || n; }
  var last = null;

  function spark(rounds, lo, hi) {
    if (rounds.length < 2) return '';
    var w = 64, h = 16, span = Math.max(1, hi - lo);
    var pts = rounds.map(function (r, i) {
      return [Math.round(i / (rounds.length - 1) * (w - 4) + 2), Math.round((h - 3) - (r.p - lo) / span * (h - 6))];
    });
    var l = pts[pts.length - 1];
    return '<svg class="ps-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
      '<polyline points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' +
      '<circle cx="' + l[0] + '" cy="' + l[1] + '" r="2"/></svg>';
  }
  // Last 2 rounds vs the rounds before them (needs 3+ rounds). Fewer putts = green ▼, more = red ▲.
  function trend(rounds) {
    if (rounds.length < 3) return '';
    var a = rounds.slice(-2), b = rounds.slice(0, -2);
    var d = a.reduce(function (s, r) { return s + r.p; }, 0) / 2 - b.reduce(function (s, r) { return s + r.p; }, 0) / b.length;
    if (Math.abs(d) < 0.5) return '<span class="ps-tr flat" title="Last 2 rounds about the same as before">•</span>';
    return '<span class="ps-tr ' + (d < 0 ? 'dn' : 'up') + '" title="Last 2 rounds vs earlier rounds">' + (d < 0 ? '▼' : '▲') + f1(Math.abs(d)) + '</span>';
  }

  function leaderCard(kind, list, others, s, final) {
    var low = kind === 'low';
    var head = (final ? (low ? 'Low putts winner' : 'High putts winner') : (low ? 'Low putts leader' : 'High putts leader'));
    if (!list.length) return '<div class="card ps-lead ' + kind + '"><div class="ps-lk">' + head + '</div><div class="ps-ln">–</div><div class="ps-ls">' + (others.length ? 'No clear leader yet' : 'No putts posted yet') + '</div></div>';
    var key = final ? 'total' : 'avg', v = list[0][key];
    var rest = others.filter(function (p) { return list.indexOf(p) < 0; });
    rest.sort(function (a, b) { return low ? a[key] - b[key] : b[key] - a[key]; });
    var gap = '';
    if (rest.length) {
      var nx = rest.filter(function (p) { return same(p[key], rest[0][key]); });
      var g = Math.abs(rest[0][key] - v);
      gap = final ? (g + ' putt' + (g === 1 ? '' : 's') + ' ahead of ' + e(names(nx))) : (f1(g) + ' a round ahead of ' + e(names(nx)));
    }
    var line = final ? (v + ' putts in ' + (list[0].n - (list[0].cut || 0)) + ' rounds') : (f1(v) + ' a round · pace ' + Math.round(v * s.cap));
    var amt = s.pay / list.length;
    return '<div class="card ps-lead ' + kind + '"><div class="ps-lk">' + head + '</div>' +
      '<div class="ps-ln">' + e(names(list)) + (list.length > 1 ? ' <span class="ps-tie">tied</span>' : '') + '</div>' +
      '<div class="ps-ls">' + line + '</div>' + (gap ? '<div class="ps-ls">' + gap + '</div>' : '') +
      '<div class="ps-la">' + money(amt) + (list.length > 1 ? ' each' : '') + '</div></div>';
  }

  window.renderPuttStand = function (d) {
    if (d) last = d;
    d = last;
    var box = document.getElementById('puttstand');
    if (!box || !d) return;
    var s = d.puttStand;
    if (!s || !s.players) {
      document.getElementById('putttable').innerHTML = '<div class="empty">Putt standings aren\'t available yet.</div>';
      return;
    }
    var ps = s.players.map(function (p) {
      var t = p.rounds.reduce(function (a, r) { return a + r.p; }, 0), n = p.rounds.length;
      return { name: p.name, rounds: p.rounds, extra: p.extra || 0, n: n, total: t, avg: n ? t / n : null };
    });
    var act = ps.filter(function (p) { return p.n; });
    var final = act.length > 0 && (s.nightsLeft === 0 || ps.every(function (p) { return p.n >= s.cap; }));
    // Season final (Ty, Nov 14): if anyone finished with fewer than 9 rounds, everyone is cut to that many,
    // keeping their first rounds and dropping their most recent ones.
    var cutN = final ? Math.min.apply(null, act.map(function (p) { return p.n; })) : 0;
    if (final && cutN < s.cap) act.forEach(function (p) {
      p.cut = p.n - cutN;
      p.total = p.rounds.slice(0, cutN).reduce(function (a, r) { return a + r.p; }, 0);
      p.avg = p.total / cutN;
    });

    // Leaders: by average while rounds differ (pace); by total once the season's putts are final (Ty's rule).
    var key = final ? 'total' : 'avg', lowL = [], highL = [];
    if (act.length) {
      var mn = Math.min.apply(null, act.map(function (p) { return p[key]; })), mx = Math.max.apply(null, act.map(function (p) { return p[key]; }));
      lowL = act.filter(function (p) { return same(p[key], mn); });
      highL = act.length > 1 ? act.filter(function (p) { return same(p[key], mx) && lowL.indexOf(p) < 0; }) : [];
    }
    document.getElementById('puttleaders').innerHTML = '<div class="ps-leads">' + leaderCard('low', lowL, act, s, final) + leaderCard('high', highL, act, s, final) + '</div>' +
      (!final && act.length ? '<div class="ps-note">Leaders are by average per round' + (act.some(function (p) { return p.n !== act[0].n; }) ? ', since players have played different numbers of rounds' : '') + (s.last ? ' (through ' + e(s.last) + ')' : '') + '.</div>' : '');

    // Table: total putts, low to high; players without a round at the bottom.
    var rows = act.slice().sort(function (a, b) { return a.total - b.total || a.avg - b.avg || (a.name < b.name ? -1 : 1); })
      .concat(ps.filter(function (p) { return !p.n; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }));
    var all = [];
    act.forEach(function (p) { p.rounds.forEach(function (r) { all.push(r.p); }); });
    var lo = all.length ? Math.min.apply(null, all) : 0, hi = all.length ? Math.max.apply(null, all) : 0;
    document.getElementById('putttable').innerHTML =
      '<table class="stand ps-t"><colgroup><col class="c-r"><col><col class="c-n"><col class="c-n"><col class="c-a"><col class="c-p"></colgroup>' +
      '<tr><th class="n">#</th><th>Player</th><th class="n">Rds</th><th class="n">Tot</th><th class="n">Avg</th><th class="n">Pace</th></tr>' +
      rows.map(function (p, i) {
        var r = i;
        if (p.n) { while (r > 0 && rows[r - 1].n && rows[r - 1].total === p.total) r--; }
        var isLow = lowL.indexOf(p) >= 0, isHigh = highL.indexOf(p) >= 0;
        var tag = isLow ? '<span class="pay">Low ' + money(s.pay / lowL.length) + '</span>' : isHigh ? '<span class="pay hi">High ' + money(s.pay / highL.length) + '</span>' : '';
        var pace = p.n ? Math.round(p.avg * s.cap) : '';
        var paceHtml = p.n ? (isLow ? '<span class="putw">' + pace + '</span>' : isHigh ? '<span class="putw hi">' + pace + '</span>' : String(pace)) : '–';
        var tr = '<tr class="ps-row' + (p.n ? '' : ' none') + (open[p.name] ? ' open' : '') + '" data-ps="' + e(p.name) + '">' +
          '<td class="n">' + (p.n ? r + 1 : '') + '</td>' +
          '<td class="ps-pl"><div class="ps-nm" title="' + e(p.name) + '">' + e(shortName(p.name)) + '</div>' + (tag ? '<div class="ps-tag">' + tag + '</div>' : '') + spark(p.rounds, lo, hi) + '</td>' +
          '<td class="n">' + (p.cut ? (p.n - p.cut) + '<span class="ps-cut">of ' + p.n + '</span>' : p.n + '<span class="ps-cap">/' + s.cap + '</span>') + '</td>' +
          '<td class="n b">' + (p.n ? p.total : '–') + '</td>' +
          '<td class="n">' + (p.n ? f1(p.avg) : '–') + trend(p.rounds) + '</td>' +
          '<td class="n">' + paceHtml + '</td></tr>';
        if (open[p.name]) {
          tr += '<tr class="ps-detail"><td></td><td colspan="5">' + (p.n ? p.rounds.map(function (x, k) {
            var drop = p.cut && k >= p.n - p.cut;
            return '<div class="ps-rd' + (drop ? ' muted' : '') + '"><span>' + (k + 1) + '. ' + e(x.d) + ' · ' + e(x.c) + (drop ? ' (dropped)' : '') + '</span><b>' + x.p + '</b></div>';
          }).join('') : '<div class="ps-rd"><span>No league rounds with putts yet.</span></div>') +
            (p.extra ? '<div class="ps-rd muted"><span>' + p.extra + ' later round' + (p.extra === 1 ? '' : 's') + ' not counted (past ' + s.cap + ')</span></div>' : '') + '</td></tr>';
        }
        return tr;
      }).join('') + '</table>' +
      (cutN && cutN < s.cap ? '<div class="paykey"><b>Season final:</b> not everyone reached ' + s.cap + ' rounds, so everyone is counted on their first ' + cutN + ' rounds; later rounds are dropped.</div>' : '') +
      '<div class="paykey">Sorted by total putts. <b>Avg</b> = putts per round; the arrow compares the last 2 rounds with earlier ones (▼ fewer putts, ▲ more). ' +
      '<b>Pace</b> = average × ' + s.cap + ', a projected ' + s.cap + '-round total, so players with different numbers of rounds compare fairly. ' +
      'Amber = low leader, red = high leader. Tap a player to see their rounds.</div>';

    // Even comparison: everyone's first N rounds, N = the fewest rounds anyone with a round has played.
    var ev = document.getElementById('putteven');
    if (act.length < 2 || final) { ev.classList.add('hide'); }
    else {
      ev.classList.remove('hide');
      var N = Math.min.apply(null, act.map(function (p) { return p.n; }));
      if (act.every(function (p) { return p.n === N; })) {
        ev.innerHTML = '<div class="pp-t">Even comparison</div><div class="paykey">Everyone with a round has played ' + N + ', so the table above is already an even comparison.</div>';
      } else {
        var fn = act.map(function (p) { return { name: p.name, t: p.rounds.slice(0, N).reduce(function (a, r) { return a + r.p; }, 0) }; });
        var top = function (dir) {
          var srt = fn.slice().sort(function (a, b) { return dir * (a.t - b.t) || (a.name < b.name ? -1 : 1); });
          var cut = srt.length > 3 ? srt[2].t : null;
          return srt.filter(function (x, i) { return i < 3 || x.t === cut; }).map(function (x) { return e(x.name) + ' <b>' + x.t + '</b>'; }).join(' · ');
        };
        ev.innerHTML = '<div class="pp-t">Even comparison: first ' + N + ' round' + (N === 1 ? '' : 's') + ' each</div>' +
          '<div class="ps-ev"><span class="ps-evk">Low</span><span>' + top(1) + '</span></div>' +
          '<div class="ps-ev"><span class="ps-evk hi">High</span><span>' + top(-1) + '</span></div>' +
          '<div class="paykey">Everyone compared on the same number of rounds: N is the fewest rounds played by anyone who has played. Rounds past N are left out here only.</div>';
      }
    }

    document.getElementById('puttrules').innerHTML = '<div class="pp-t">Season putting rules</div><ul class="ps-rules">' +
      '<li>Each player\'s total putts from their <b>first ' + s.cap + ' league rounds</b> of the season count. Rounds after the ' + s.cap + 'th don\'t count.</li>' +
      '<li><b>Fewest total putts wins ' + money(s.pay) + '</b>. <b>Most total putts wins ' + money(s.pay) + '</b>. Ties split the money.</li>' +
      '<li>Regular-season rounds count first. Tiebreaker week and playoff rounds count only for a player who missed regular-season rounds and is still short of ' + s.cap + '.</li>' +
      '<li>One round per night: playing two opponents on a makeup night is still one round.</li>' +
      '<li>Casual rounds never count.</li>' +
      '<li>Putts are strokes played from the green (a gimme counts as one putt), taken from GSPro or entered on the phone.</li>' +
      '<li>If anyone finishes the season with fewer than ' + s.cap + ' rounds, everyone is cut to that many rounds: each player keeps their first rounds and their most recent ones are dropped.</li>' +
      '<li>Week 1 (Nov 5) has no putts recorded, so counting starts Nov 12.</li>' +
      '<li>Until everyone has played the same number of rounds, leaders are shown by average putts per round.</li></ul>';
  };

  document.addEventListener('click', function (ev) {
    var r = ev.target.closest && ev.target.closest('tr.ps-row');
    if (!r) return;
    var n = r.getAttribute('data-ps');
    open[n] = !open[n];
    window.renderPuttStand();
  });
})();
