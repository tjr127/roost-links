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

  // Putting pot for the night the card is about.
  function potTile(d, next) {
    var pc = d.putts; if (!pc || pc.carry === undefined) return '';
    var mode = pc.mode, carry = pc.carry, exact = null;
    if (!next) { if (pc.tonight) exact = pc.pot; }
    else if (pc.tonight && (d.field || []).length) {           // Tonight still shows the last night: the next one flips
      carry = pc.result ? (pc.result.tie ? pc.pot : 0) : pc.pot;
      mode = pc.mode === 'High' ? 'Low' : 'High';
    }
    var big = exact !== null ? '$' + exact : (carry ? '$' + carry + ' + $1 each' : '$1 each');
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

  function liveTiles(d, y) {
    var out = [], T = d.teeTimes;
    if (y) {
      var m = (d.matches || []).filter(function (x) { return x.a === y || x.b === y; })[0];
      if (m) {
        var left = m.a === y, my = num(left ? m.ap : m.bp), op = num(left ? m.bp : m.ap), opp = left ? m.b : m.a, thru = left ? m.aThru : m.bThru;
        var where = thru ? (thru === 'F' ? 'Finished' : e(thru)) : 'Not started';
        var lead = my === null || op === null ? '' : my > op ? 'You lead by ' + (my - op) : my < op ? e(opp) + ' leads by ' + (op - my) : 'Level';
        out.push(tile('match', 'Your match', (my === null ? '–' : my) + ' – ' + (op === null ? '–' : op) + ' vs ' + e(opp), where + (lead ? ' · ' + lead : ''), my !== null && op !== null && my > op ? 'win' : ''));
      } else out.push(tile('match', 'Your match', d.roundType === 'Casual' ? 'Casual round' : 'No match tonight', ''));
      var c = T && T.confirmed, grp = c ? ((c.early || []).indexOf(y) >= 0 ? 'Early' : (c.late || []).indexOf(y) >= 0 ? 'Late' : '') : '';
      var card = (d.cards || []).filter(function (x) { return x.name === y; })[0], tees = card && card.tees ? e(card.tees) + ' tees' : '';
      if (grp) out.push(tile('tee', 'Tee time', grp + ' · ' + e((T.times || {})[grp] || ''), tees));
      else if (tees) out.push(tile('tee', 'Tees', tees, card.hcp !== undefined && card.hcp !== '' ? 'Course handicap ' + e(card.hcp) : ''));
    }
    var td = d.teamDetail, teams = (td && td.teams) || [];
    if (!teams.length || !(d.teams || []).length) out.push(tile('team', 'Team game', 'To be determined', 'on the night'));
    else {
      var mine = y ? teams.filter(function (t) { return (t.players || []).some(function (p) { return p.name === y; }); })[0] : null;
      var game = e(((td.scoring ? td.scoring + ' ' : '') + (td.game || '')).trim());
      if (mine && window.tdOrder) {
        var r = tdOrder(td).rank[mine.name], gap = r && window.tdGapText ? tdGapText(r) : '';
        var mates = mine.players.map(function (p) { return p.name; }).filter(function (n) { return n !== y; });
        out.push(tile('team', 'Team game', (r ? e(tdPlaceText(r)) : '–') + (gap ? ' · ' + e(gap) : ''), (mates.length ? 'With ' + mates.map(e).join(', ') + ' · ' : '') + game, r && r.place === 1 ? 'win' : ''));
      } else out.push(tile('team', 'Team game', game || 'Team game', teams.length + ' teams'));
    }
    out.push(potTile(d, false));
    return out;
  }

  window.renderTonightCard = function (d) {
    var box = document.getElementById('tncard');
    if (!box) return;
    if (!d) { box.innerHTML = ''; return; }
    var y = user(), live = d.live !== false, T = d.teeTimes, next = !live && T && T.night;
    if (!live && !next) { box.innerHTML = ''; return; }
    var kicker = live ? 'Tonight' : (T.casual ? 'Next round' : 'Next league night');
    var title = live ? e(d.title || '') : e(String(T.label || '').replace(/^(\w{3})\w*day,/, '$1')) + (T.course ? ' · ' + e(T.course) + (T.tees && T.tees.nine ? ', ' + e(T.tees.nine) + ' 9' : '') : '');
    var tiles = (live ? liveTiles(d, y) : nextTiles(d, y)).filter(Boolean);
    if (!y) tiles.unshift(tile('signin', 'Your night', 'Sign in', 'to see your match and tee time', 'amb'));
    var open = st('tnOpen') !== '0';
    box.innerHTML = '<div class="card tn' + (open ? ' open' : '') + '"><button type="button" class="tn-h" data-tn="toggle" aria-expanded="' + open + '"><span class="tn-hh"><span class="tn-kick">' + kicker + '</span><span class="tn-title">' + title + '</span></span><span class="tn-chev" aria-hidden="true">›</span></button>' +
      '<div class="tn-g">' + tiles.join('') + '</div></div>';
  };

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-tn]'); if (!b) return;
    var k = b.getAttribute('data-tn');
    if (k === 'toggle') { st('tnOpen', st('tnOpen') === '0' ? '1' : '0'); var c = b.closest('.tn'), on = st('tnOpen') !== '0'; c.classList.toggle('open', on); b.setAttribute('aria-expanded', on); return; }
    if (k === 'signin') { if (window.RL && RL.signIn) RL.signIn(); return; }
    var tab = { match: 'tonight', team: 'teams', pot: 'field', tee: 'schedule' }[k];
    if (tab && window.showTab) { showTab(tab); if (k !== 'tee') { var el = document.querySelector(k === 'match' ? '.match.mine' : k === 'pot' ? '#puttbanner' : '#teamlist'); if (el && el.scrollIntoView) try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (x) {} } else window.scrollTo(0, 0); }
  });
})();
