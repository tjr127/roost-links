/*
 * "Tonight" card at the top of the Board (Nov 23, 2026). For the signed-in player: your match, tee time, team and the
 * putting pot, each a shortcut to its screen. Collapsible (remembered per phone, localStorage tnOpen).
 *   - Tonight's date is today  -> "Tonight": live match score, team place, pot.
 *   - otherwise                -> "Next league night" from the tee-times feed (d.teeTimes: night, pairs, picks, tees).
 * Team game before the night: "To be determined on the night" (Ty, Nov 23).
 * Everything comes from the board feed; nothing is saved to the sheet.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function st(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) { return null; } }
  function num(s) { var n = parseFloat(s); return isNaN(n) ? null : n; }
  function user() { var a = window.RL && RL.user && RL.user(); return a ? a.name : ''; }
  function tile(key, label, big, sub, cls) {
    return '<button type="button" class="tn-t" data-tn="' + key + '"><span class="tn-k">' + label + '</span><span class="tn-b' + (cls ? ' ' + cls : '') + '">' + big + '</span>' + (sub ? '<span class="tn-s">' + sub + '</span>' : '') + '</button>';
  }
  function ch(T, name) { var p = T && T.tees && T.tees.players && T.tees.players[name]; if (!p || !p.chs) return null; var v = p.chs[p.pick || p.def]; return typeof v === 'number' ? v : num(v); }
  function teeName(T, name) { var p = T && T.tees && T.tees.players && T.tees.players[name]; return p ? (p.pick || p.def || '') : ''; }

  // Nov 24: "won" only once EVERYONE on Tonight has finished (both tee-time groups); until then "leading".
  function cardFin(c) { if (!c || !window.tpCard) return false; var q = tpCard(c); return q.holes > 0 && q.played >= q.holes; }
  function allFin(d) { var cs = d.cards || []; return cs.length > 0 && cs.every(cardFin); }
  function lateOut(d) {   // the early group is done but someone in the late group isn't
    var c = d.teeTimes && d.teeTimes.confirmed; if (!c) return false;
    var by = {}; (d.cards || []).forEach(function (x) { by[x.name] = x; });
    var early = (c.early || []).filter(function (n) { return by[n]; }), late = (c.late || []).filter(function (n) { return by[n]; });
    return early.length && late.length && early.every(function (n) { return cardFin(by[n]); }) && !late.every(function (n) { return cardFin(by[n]); });
  }
  function names(a) { return a.length <= 2 ? a.map(e).join(' &amp; ') : e(a[0]) + ' +' + (a.length - 1); }
  function place(list, y, key, hi) {   // "T2" style place of y in list by key
    var v = list.filter(function (x) { return num(x[key]) !== null; });
    var me = v.filter(function (x) { return x.player === y; })[0]; if (!me) return '';
    var mv = num(me[key]), better = v.filter(function (x) { return hi ? num(x[key]) > mv : num(x[key]) < mv; }).length, tie = v.filter(function (x) { return num(x[key]) === mv; }).length > 1;
    return (tie ? 'T' : '') + (better + 1);
  }
  function ord(p) { var n = parseInt(String(p).replace('T', ''), 10); if (isNaN(n)) return p; var sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return (String(p).charAt(0) === 'T' ? 'T' : '') + n + sfx; }

  // Live / final putting tile: your putts, who leads or won.
  function potLive(d, y, done) {
    var pc = d.putts; if (!pc || !pc.tonight) return potTile(d, false);
    var hi = pc.mode === 'High', fld = (d.field || []).filter(function (x) { return num(x.putts) !== null; });
    var finished = fld.filter(function (x) { return cardFin((d.cards || []).filter(function (c) { return c.name === x.player; })[0]) || d.posted; });
    var best = finished.length ? finished.reduce(function (m, x) { var v = num(x.putts); return m === null ? v : hi ? Math.max(m, v) : Math.min(m, v); }, null) : null;
    var lead = finished.filter(function (x) { return num(x.putts) === best; }).map(function (x) { return x.player; });
    var me = fld.filter(function (x) { return x.player === y; })[0], mine = me ? num(me.putts) : null;
    var res = pc.result || null, mode = hi ? 'HIGH' : 'LOW';
    if (done) {
      var won = lead.indexOf(y) >= 0 && lead.length === 1, tie = lead.length > 1 || (res && res.tie);
      var big = mine !== null ? mine + ' putts' : '$' + pc.pot;
      var sub = tie ? 'Tie (' + names(lead) + ') · $' + pc.pot + ' pushes' : won ? 'You won $' + pc.pot + ' · ' + mode : (lead.length ? e(lead[0]) + ' won $' + pc.pot + ' with ' + best : mode + ' putts');
      return tile('pot', 'Putting pot', big, sub, won ? 'win' : '');
    }
    var sub2 = (mine !== null ? 'You ' + mine + ' · ' : '') + (lead.length ? (lead.indexOf(y) >= 0 && lead.length === 1 ? 'you lead' : 'leading: ' + names(lead) + ' ' + best) : 'nobody finished yet');
    return tile('pot', 'Putting pot', '$<span data-fxnum="pot2" data-v="' + pc.pot + '">' + pc.pot + '</span> · ' + mode, sub2);
  }
  // Low net: rank by net to par so players on different holes compare fairly; final = posted/total net.
  function netTile(d, y, done) {
    var rows = (d.cards || []).map(function (c) {
      var q = window.tpCard ? tpCard(c) : null, fr = (d.field || []).filter(function (x) { return x.player === c.name; })[0];
      var nd = q && q.nn ? q.sn - q.pn : null;
      return { player: c.name, nd: nd, net: fr ? fr.net : '', thru: q ? q.played : 0 };
    }).filter(function (r) { return r.nd !== null; });
    if (!rows.length) return '';
    var key = done ? 'net' : 'nd', p = y ? place(rows, y, key, false) : '';
    var bestV = Math.min.apply(null, rows.map(function (r) { return num(r[key]); }).filter(function (v) { return v !== null; }));
    var lead = rows.filter(function (r) { return num(r[key]) === bestV; }).map(function (r) { return r.player; });
    var me = rows.filter(function (r) { return r.player === y; })[0];
    var tp = function (v) { return v === 0 ? 'E' : v > 0 ? '+' + v : '−' + (-v); };
    var big = me ? (p ? ord(p) + ' · ' : '') + (done ? e(me.net) + ' net' : tp(me.nd) + ' net') : (done ? bestV + ' net' : tp(bestV));
    var sub = done ? (lead.indexOf(y) >= 0 ? (lead.length > 1 ? 'Tied for low net' : 'Low net of the night') : names(lead) + ' won with ' + bestV)
      : (lead.indexOf(y) >= 0 && lead.length === 1 ? 'You lead' : 'Leading: ' + names(lead) + ' ' + tp(bestV)) + (me ? ' · thru ' + me.thru : '');
    return tile('net', 'Low net', big, sub, done && lead.indexOf(y) >= 0 ? 'win' : '');
  }
  function bbbTile(y, done, d) {
    if (!window.bbbOn || !bbbOn() || !window.bbbState) return '';
    var s = bbbState(), top = s.order.length ? s.pts[s.order[0]].t : 0, lead = s.order.filter(function (p) { return s.pts[p].t === top && top > 0; });
    var mine = s.pts[y], p = '';
    if (mine) { var better = s.order.filter(function (q) { return s.pts[q].t > mine.t; }).length, tie = s.order.filter(function (q) { return s.pts[q].t === mine.t; }).length > 1; p = (tie ? 'T' : '') + (better + 1); }
    var fin = done && s.final, youLead = lead.indexOf(y) >= 0;
    var big = mine ? ord(p) + ' · ' + mine.t + (mine.t === 1 ? ' pt' : ' pts') : (lead.length ? names(lead) + ' ' + top : 'Not started');
    var sub = !s.holes.length ? s.ps.length + ' playing · ' + s.total * 3 + ' pts' : fin ? (youLead ? (lead.length > 1 ? 'Tied for the win' : 'You won BBB') : names(lead) + ' won with ' + top)
      : (youLead && lead.length === 1 ? 'You lead' : 'Leading: ' + names(lead) + ' ' + top) + ' · ' + s.left + ' pts left';
    return tile('bbb', 'BBB', big, sub, fin && youLead ? 'win' : '');
  }

  // Putting pot for the night the card is about.
  function potTile(d, next) {
    var pc = d.putts; if (!pc || pc.carry === undefined) return '';
    var mode = pc.mode, carry = pc.carry, exact = null;
    if (!next) { if (pc.tonight) exact = pc.pot; }
    else if (pc.tonight && (d.field || []).length) {           // Tonight still shows the last night: the next one flips
      carry = pc.result ? (pc.result.tie ? pc.pot : 0) : pc.pot;
      mode = pc.mode === 'High' ? 'Low' : 'High';
    }
    var big = exact !== null ? '$<span data-fxnum="pot2" data-v="' + exact + '">' + exact + '</span>' : (carry ? '$' + carry + ' + $1 each' : '$1 each');
    return tile('pot', 'Putting pot', big, (mode === 'High' ? 'HIGH' : 'LOW') + ' putts wins', 'win');
  }

  function nextTiles(d, y) {
    var T = d.teeTimes, out = [];
    if (y) {
      var opps = (T.pairs || []).filter(function (p) { return p[0] === y || p[1] === y; }).map(function (p) { return p[0] === y ? p[1] : p[0]; });
      if (!opps.length) out.push(tile('match', 'Your match', 'Bye this week', 'No match scheduled'));
      else {
        var mine = ch(T, y);
        var strokes = opps.map(function (o) {
          var oc = ch(T, o); if (mine === null || oc === null) return '';
          var n = oc - mine; return n > 0 ? e(o) + ' gets ' + n : n < 0 ? 'You get ' + (-n) + (opps.length > 1 ? ' from ' + e(o) : '') : 'Even' + (opps.length > 1 ? ' with ' + e(o) : ', no strokes');
        }).filter(Boolean).join(' · ');
        out.push(tile('match', 'Your match', 'vs ' + opps.map(e).join(' &amp; '), strokes));
      }
      var me = (T.players || []).filter(function (p) { return p.name === y; })[0], c = T.confirmed, tees = teeName(T, y), teesTxt = tees ? e(tees) + ' tees' : '';
      var grp = c ? ((c.early || []).indexOf(y) >= 0 ? 'Early' : (c.late || []).indexOf(y) >= 0 ? 'Late' : '') : '';
      if (grp) out.push(tile('tee', 'Tee time', grp + ' · ' + e((T.times || {})[grp] || ''), teesTxt));
      else if (me && me.choice) out.push(tile('tee', 'Tee time', e(me.choice), (c ? 'Groups are set' : 'Not confirmed yet') + (teesTxt ? ' · ' + teesTxt : '')));
      else if (T.state === 'before') out.push(tile('tee', 'Tee time', 'Not open yet', 'Sign-up opens ' + e(T.opens || 'Wednesday')));
      else out.push(tile('tee', 'Tee time', 'Pick a time', T.closes ? 'Closes ' + e(T.closes) : '', 'amb'));
    }
    out.push(tile('team', 'Team game', 'To be determined', 'on the night'));
    out.push(potTile(d, true));
    return out;
  }

  function liveTiles(d, y, done) {
    var out = [], T = d.teeTimes, scoreT = '', teeT = '';
    if (y) {
      var m = (d.matches || []).filter(function (x) { return x.a === y || x.b === y; })[0];
      if (m) {
        var left = m.a === y, my = num(left ? m.ap : m.bp), op = num(left ? m.bp : m.ap), opp = left ? m.b : m.a, thru = left ? m.aThru : m.bThru;
        var where = thru ? (thru === 'F' ? 'Finished' : e(thru)) : 'Not started';
        var lead = my === null || op === null ? '' : my > op ? 'You lead by ' + (my - op) : my < op ? e(opp) + ' leads by ' + (op - my) : 'Level';
        if (done && my !== null && op !== null) out.push(tile('match', 'Your match', (my > op ? 'Won ' : my < op ? 'Lost ' : 'Halved ') + my + ' – ' + op, 'vs ' + e(opp), my > op ? 'win' : my < op ? 'loss' : ''));
        else out.push(tile('match', 'Your match', (my === null ? '–' : my) + ' – ' + (op === null ? '–' : op) + ' vs ' + e(opp), where + (lead ? ' · ' + lead : ''), my !== null && op !== null && my > op ? 'win' : ''));
      } else out.push(tile('match', 'Your match', d.roundType === 'Casual' ? 'Casual round' : 'No match tonight', ''));
      // Nov 24: your round so far, to par the Tour way (gross and net). Posted nights use the posted totals.
      var mc = (d.cards || []).filter(function (x) { return x.name === y; })[0], fr = (d.field || []).filter(function (x) { return x.player === y; })[0];
      if (mc && window.tpCard) {
        var q = tpCard(mc), fin = q.holes > 0 && q.played >= q.holes;
        if (q.played) {
          var gt = fr && num(fr.gross) !== null ? num(fr.gross) : q.sg, nt = fr && num(fr.net) !== null ? num(fr.net) : null;
          var nd = (d.posted || fin) && nt !== null ? nt - q.pg : (q.nn ? q.sn - q.pn : null);
          var big = tpHtml(gt - q.pg, gt, fin) + ' <span class="tn-u">gross</span>' + (nd !== null ? ' · ' + tpHtml(nd, nt !== null ? nt : q.sn, fin) + ' <span class="tn-u">net</span>' : '');
          scoreT = tile('score', 'Your score', big, fin ? 'Finished' : 'Thru ' + q.played);
        }
      }
      var c = T && T.confirmed, grp = c ? ((c.early || []).indexOf(y) >= 0 ? 'Early' : (c.late || []).indexOf(y) >= 0 ? 'Late' : '') : '';
      var card = (d.cards || []).filter(function (x) { return x.name === y; })[0], tees = card && card.tees ? e(card.tees) + ' tees' : '';
      if (grp) teeT = tile('tee', 'Tee time', grp + ' · ' + e((T.times || {})[grp] || ''), tees);
      else if (tees) teeT = tile('tee', 'Tees', tees, card.hcp !== undefined && card.hcp !== '' ? 'Course handicap ' + e(card.hcp) : '');
    }
    var td = d.teamDetail, teams = (td && td.teams) || [];
    if (!teams.length || !(d.teams || []).length) out.push(tile('team', 'Team game', 'To be determined', 'on the night'));
    else {
      var mine = y ? teams.filter(function (t) { return (t.players || []).some(function (p) { return p.name === y; }); })[0] : null;
      var game = e(((td.scoring ? td.scoring + ' ' : '') + (td.game || '')).trim());
      if (mine && window.tdOrder) {
        var r = tdOrder(td).rank[mine.name], gap = r && window.tdGapText ? tdGapText(r) : '';
        var mates = mine.players.map(function (p) { return p.name; }).filter(function (n) { return n !== y; });
        out.push(tile('team', 'Team game', (r ? e(tdPlaceText(r)) : '–') + (gap && !done ? ' · ' + e(gap) : done ? ' of ' + teams.length : ''), (mates.length ? 'With ' + mates.map(e).join(', ') + ' · ' : '') + game, r && r.place === 1 ? 'win' : ''));
      } else out.push(tile('team', 'Team game', game || 'Team game', teams.length + ' teams'));
    }
    // Nov 24 (Ty): match, team, BBB (or your score), putting pot, low net, then your score / tee time to fill the grid.
    var bb = bbbTile(y, done, d);
    out.push(bb || scoreT);
    out.push(potLive(d, y, done));
    out.push(netTile(d, y, done));
    out.push(bb ? scoreT : (done ? '' : teeT) || '');
    if (!done && !y) out.push(teeT);
    return out;
  }

  window.renderTonightCard = function (d) {
    var box = document.getElementById('tncard');
    if (!box) return;
    if (!d) { box.innerHTML = ''; return; }
    var y = user(), live = d.live !== false, T = d.teeTimes;
    // After the night (Nov 24): your results stay up until the next night's sign-up opens; also once everyone is done tonight.
    var had = (d.field || []).length > 0, after = had && (live ? allFin(d) : !(T && T.night && T.state && T.state !== 'before'));
    var next = !live && !after && T && T.night;
    if (!live && !next && !after) { box.innerHTML = ''; return; }
    var kicker = after ? 'Your night · final' : live ? (had && lateOut(d) ? 'Tonight · late group out' : 'Tonight') : (T.casual ? 'Next round' : 'Next league night');
    var title = live || after ? e(d.title || '') : e(String(T.label || '').replace(/^(\w{3})\w*day,/, '$1')) + (T.course ? ' · ' + e(T.course) + (T.tees && T.tees.nine ? ', ' + e(T.tees.nine) + ' 9' : '') : '');
    var tiles = (live || after ? liveTiles(d, y, after) : nextTiles(d, y)).filter(Boolean);
    if (!y) tiles.unshift(tile('signin', 'Your night', 'Sign in', 'to see your match and tee time', 'amb'));
    var open = st('tnOpen') !== '0';
    box.innerHTML = '<div class="card tn' + (open ? ' open' : '') + (after ? ' tn-after' : '') + '"><button type="button" class="tn-h" data-tn="toggle" aria-expanded="' + open + '"><span class="tn-hh"><span class="tn-kick">' + (live && !after ? '<span class="tn-live" aria-hidden="true"></span>' : '') + kicker + '</span><span class="tn-title">' + title + '</span></span><span class="tn-chev" aria-hidden="true">›</span></button>' +
      '<div class="tn-g">' + tiles.join('') + '</div></div>';
  };

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-tn]'); if (!b) return;
    var k = b.getAttribute('data-tn');
    if (k === 'toggle') { st('tnOpen', st('tnOpen') === '0' ? '1' : '0'); var c = b.closest('.tn'), on = st('tnOpen') !== '0'; c.classList.toggle('open', on); b.setAttribute('aria-expanded', on); return; }
    if (k === 'signin') { if (window.RL && RL.signIn) RL.signIn(); return; }
    if (k === 'bbb') { if (window.showTab) showTab('bbb'); if (window.renderBbb) renderBbb(); window.scrollTo(0, 0); return; }
    var tab = { match: 'tonight', team: 'teams', pot: 'field', tee: 'schedule', score: 'field', net: 'field' }[k];
    if (tab && window.showTab) { showTab(tab); if (k !== 'tee') { var el = document.querySelector(k === 'match' ? '.match.mine' : k === 'pot' || k === 'net' || k === 'score' ? '#fieldcard' : '#teamlist'); if (el && el.scrollIntoView) try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (x) {} } else window.scrollTo(0, 0); }
  });
})();
