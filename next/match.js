/*
 * Head-to-head match summaries (added Nov 12, 2026).
 * Under every match card: a one-line state of play with what the trailing player needs, in net-score terms
 * (Stableford: net bogey 1, par 2, birdie 3, eagle 4), plus some ribbing. Tapping the card shows a
 * hole-by-hole target for the player chasing. Early/late group labels come from confirmed tee times.
 * Works from data.cards (hole scores, strokes, Stableford) and data.matches; nothing extra from the server.
 */
(function () {
  var open = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(v) { var x = parseFloat(v); return isNaN(x) ? null : x; }
  function pl(k, w) { return k + ' ' + w + (k === 1 ? '' : 's'); }

  // Same pick every refresh, so the jokes don't change every minute.
  function pick(list, seed) {
    var h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return list[h % list.length];
  }
  function fill(t, v) { return t.replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? '' : esc(v[k]); }); }

  var JOKES = {
    passed: ['{C} has already passed {L}. Victory lap, sponsored by {L}.', '{C} is already ahead. {L} can start opening his wallet.', 'Already over the top. {C} just has to not set the sim on fire.'],
    level: ['Dead level. First one to blink buys.', 'All square with {R} to go. Squeaky bum time.'],
    bogeys: ['Net bogeys get it done. {L} is sweating through his shirt.', '{C} just has to not fall apart. Low bar, but it\'s {C}.', 'Bogey golf wins it. {L} should not be celebrating yet.'],
    pars: ['Doable. {L} might want to stop celebrating.', 'Steady golf wins it. Has {C} ever played steady golf?', 'Very gettable. {L}, keep the receipt.'],
    birdies: ['{C} needs to go low. Lower than usual. Much lower.', 'Birdies required. Time to find the magic, or a mulligan.', 'Needs to get hot. {L} is already picking a drink.'],
    eagles: ['Needs eagles. Start lighting candles.', 'Possible the way winning the lottery is possible.', '{C} needs a miracle and maybe a new set of clubs.'],
    dead: ['Mathematically dead. {L} wins and {C} buys the next round.', 'Stick a fork in {C}. {L} is ordering on {C}\'s tab.'],
    final: ['{W} wins by {D}. {Lo} buys.', '{W} takes it by {D}. {Lo}, the bar is that way.', '{W} by {D}. {Lo} will be telling everyone about his lip-outs.'],
    blowout: ['{W} by {D}. That wasn\'t a match, that was a mugging.', '{W} by {D}. Somebody check on {Lo}.'],
    tie: ['All square. Nobody buys, everybody drinks.', 'Dead heat. Both of you are buying.'],
    close: ['Anybody\'s match.', 'Tight as a drum.', 'Coin flip from here.'],
    gap: ['{T} needs to wake up.', '{T}, the course is the other way.', '{T} is leaking oil.'],
    rout: ['{T}, it\'s not too late to fake an injury.', '{T} is playing for pride now. Not much of it left.', 'Somebody get {T} a drink. A strong one.'],
    waiting: ['{N} is still at the bar.', '{N} hasn\'t even found his glove yet.', 'The target\'s up. {N}, no pressure.']
  };
  function joke(tier, v, seed) { return fill(pick(JOKES[tier], seed + tier), v); }

  function teeGroup(name) {
    var d = window.data, tt = d && d.teeTimes;
    if (!d || !d.live || !tt || !tt.confirmed) return '';
    var today = new Date(), k = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
    if (tt.night !== k) return '';
    var t = tt.times || {};
    if ((tt.confirmed.early || []).indexOf(name) >= 0) return 'early group, ' + (t.Early || '6:00 PM');
    if ((tt.confirmed.late || []).indexOf(name) >= 0) return 'late group, ' + (t.Late || '8:00 PM');
    return '';
  }

  function player(name) {
    var c = ((window.data && window.data.cards) || []).filter(function (x) { return x.name === name; })[0];
    if (!c) return null;
    var pts = 0, played = [], left = [];
    c.holes.forEach(function (h) {
      if (h.g === '' || h.g == null) left.push(h);
      else { played.push(h); pts += n(h.p) || 0; }
    });
    return { name: name, card: c, pts: pts, played: played, left: left, done: played.length > 0 && left.length === 0, started: played.length > 0 };
  }

  // Least net golf that scores `need` points over `r` holes, in words.
  function needWords(need, r) {
    if (need <= r) return need === r ? 'net bogeys the rest of the way' : 'net bogeys or better on ' + need + ' of ' + r;
    if (need <= 2 * r) return need === 2 * r ? 'net par on every hole' : 'net par on ' + (need - r) + ' of ' + r + ', bogeys on the rest';
    if (need <= 3 * r) return need === 3 * r ? 'net birdies on every hole' : 'net par on every hole plus ' + pl(need - 2 * r, 'birdie');
    return 'better than a net birdie on every hole';
  }
  function tierOf(need, r) {
    if (need <= 0) return 'passed';
    if (need <= r) return 'bogeys';
    if (need <= 2 * r) return 'pars';
    if (need <= 3 * r) return 'birdies';
    if (need <= 5 * r) return 'eagles';
    return 'dead';
  }

  // Hole-by-hole plan: net par everywhere, then bogeys on the hardest holes or birdies on the easiest
  // (by stroke index) until the points add up to `need`.
  function plan(p, need) {
    var hs = p.left.map(function (h) { return { h: h, pts: 2 }; });
    var diff = need - 2 * hs.length;
    var byHard = hs.slice().sort(function (a, b) { return n(a.h.idx) - n(b.h.idx); });
    var byEasy = byHard.slice().reverse();
    var i;
    for (i = 0; diff < 0 && i < byHard.length * 2; i++) { var x = byHard[i % byHard.length]; if (x.pts > 0) { x.pts--; diff++; } }
    for (i = 0; diff > 0 && i < byEasy.length * 3; i++) { var y = byEasy[i % byEasy.length]; if (y.pts < 5) { y.pts++; diff--; } }
    var WORD = ['anything', 'net bogey', 'net par', 'net birdie', 'net eagle', 'net albatross'];
    var rows = hs.map(function (x) {
      var par = n(x.h.par) || 0, s = n(x.h.s) || 0, gross = par + s + 2 - x.pts;
      return '<tr><td>' + x.h.hole + '</td><td>' + par + '</td><td>' + (s ? '<span class="mdots">' + new Array(s + 1).join('•') + '</span>' : '') + '</td>' +
        '<td class="b">' + (x.pts === 0 ? '–' : gross + (gross > 1 ? ' or better' : '')) + '</td><td>' + WORD[x.pts] + '</td></tr>';
    }).join('');
    return '<table class="mplan"><tr><th>Hole</th><th>Par</th><th>Strk</th><th>Gross</th><th>Net</th></tr>' + rows + '</table>';
  }

  function story(x) {
    var A = player(x.a), B = player(x.b);
    if (!A || !B) return null;
    var seed = x.a + '|' + x.b;
    var line = '', target = null;

    if (A.done && B.done) {
      var d = A.pts - B.pts;
      if (!d) return { line: joke('tie', {}, seed) };
      var W = d > 0 ? A : B, Lo = d > 0 ? B : A, D = Math.abs(d);
      return { line: joke(D >= 8 ? 'blowout' : 'final', { W: W.name, Lo: Lo.name, D: D }, seed) };
    }

    if (A.done || B.done) {
      var F = A.done ? A : B, G = A.done ? B : A, R = G.left.length;
      var tie = F.pts - G.pts, win = tie + 1;
      var grp = !G.started ? teeGroup(G.name) : '';
      var where = G.started ? ' has ' + G.pts + ' thru ' + G.played.length : (grp ? ' (' + grp + ')' : '') + ' hasn\'t teed off';
      var lead = '<b>' + esc(F.name) + ' posted ' + F.pts + '.</b> ' + esc(G.name) + where + '. ';
      if (tie < 0) line = lead + esc(G.name) + ' is already ' + (G.pts - F.pts) + ' clear. ' + joke('passed', { C: G.name, L: F.name }, seed);
      else if (tie === 0 && G.started) line = lead + 'Level, so any point from here wins. ' + joke('level', { R: R }, seed);
      else {
        var t = tierOf(win, R);
        line = lead + 'Needs <b>' + win + ' over ' + pl(R, 'hole') + '</b> to win (' + tie + ' to tie)' +
          (t === 'dead' ? '. ' : ': ' + needWords(win, R) + '. ') + joke(t, { C: G.name, L: F.name }, seed);
        if (t !== 'dead') target = { p: G, need: win, note: 'To win against ' + F.name + '\'s ' + F.pts + '. One point less ties.' };
      }
      return { line: line, target: target };
    }

    if (A.started && B.started) {
      var common = A.played.filter(function (h) { return B.played.some(function (k) { return k.hole === h.hole; }); }).map(function (h) { return h.hole; });
      function sumOn(p) { return p.played.reduce(function (t, h) { return t + (common.indexOf(h.hole) >= 0 ? (n(h.p) || 0) : 0); }, 0); }
      var a = sumOn(A), b = sumOn(B), m = Math.abs(a - b), k = common.length;
      var same = A.played.length === B.played.length;
      var thru = same ? 'thru ' + k + ' each' : 'through the ' + pl(k, 'hole') + ' both have played';
      if (!m) line = '<b>All square ' + thru + '.</b> ' + joke('close', {}, seed);
      else {
        var up = a > b ? A : B, dn = a > b ? B : A;
        line = '<b>' + esc(up.name) + ' +' + m + ' ' + thru + '.</b> ' + joke(m <= 2 ? 'close' : m <= 5 ? 'gap' : 'rout', { T: dn.name }, seed);
        var proj = up.pts + 2 * up.left.length, need = proj - dn.pts + 1;
        if (dn.left.length && need > 0 && need <= 5 * dn.left.length)
          target = { p: dn, need: need, note: 'To win if ' + up.name + ' plays net par in (' + proj + '). One point less ties.' };
      }
      return { line: line, target: target };
    }

    if (A.started || B.started) {
      var S = A.started ? A : B, N = A.started ? B : A;
      var g2 = teeGroup(N.name), projS = S.pts + 2 * S.left.length;
      line = '<b>' + esc(S.name) + ' has ' + S.pts + ' thru ' + S.played.length + '.</b> ' + esc(N.name) + (g2 ? ' (' + g2 + ')' : '') + ' hasn\'t teed off. ' + joke('waiting', { N: N.name }, seed);
      target = { p: N, need: projS + 1, note: 'To win if ' + S.name + ' plays net par in (' + projS + '). One point less ties.' };
      return { line: line, target: target };
    }

    var ga = teeGroup(x.a), gb = teeGroup(x.b);
    if (ga || gb) return { line: esc(x.a) + (ga ? ' (' + ga + ')' : '') + ' vs ' + esc(x.b) + (gb ? ' (' + gb + ')' : '') + '.' };
    return null;
  }

  // Called by render() for each match card.
  window.matchStory = function (x) {
    var s;
    try { s = story(x); } catch (e) { s = null; }
    if (!s) return '';
    var key = x.a + '|' + x.b, can = !!s.target;
    return '<div class="mstory' + (can ? ' tap' : '') + '"' + (can ? ' data-mkey="' + esc(key) + '"' : '') + '>' + s.line +
      (can ? '<span class="mmore">' + (open[key] ? 'Hide hole-by-hole ▴' : 'What ' + esc(s.target.p.name) + ' needs, hole by hole ▾') + '</span>' : '') + '</div>' +
      (can && open[key] ? '<div class="mtarget"><div class="mnote">' + esc(s.target.note) + '</div>' + plan(s.target.p, s.target.need) + '</div>' : '');
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-mkey]');
    if (!el) return;
    var k = el.getAttribute('data-mkey');
    open[k] = !open[k];
    if (window.data && typeof window.render === 'function') window.render(window.data);
  });
})();
