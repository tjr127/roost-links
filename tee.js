/*
 * Tee times card at the top of the Schedule tab.
 * League members pick Early / Late / Either / Can't play for the next league night while sign-up is open
 * (the day before at 8 AM until 3 PM on the night). Ty (admin) can set anyone's pick until he confirms the groups,
 * and confirms the groups here. After that the picks are locked (Ty can reopen).
 * Since Nov 12 players also pick their tees here (data.teeTimes.tees; saved with action tee + tees), defaulting to their
 * Players-tab tees. Confirming (by Ty, or automatically at 3 PM) locks tees too.
 * Data: data.teeTimes from getBoardData; saves via the app API (actions tee, teeConfirm, teeReopen).
 */
(function () {
  var LABEL = { Early: 'Early', Late: 'Late', Either: 'Either', Out: 'Can\'t play' };
  var ORDER = ['Early', 'Late', 'Either', 'Out'];
  // Optimistic picks: name -> { v, id, state: 'saving' | 'saved', at }.
  // Nov 13 fix: a pick stays here until a board refresh shows the same value (or 2 minutes pass). Before, it was
  // dropped as soon as the save returned, and a refresh carrying an older board (the server's shared cache can hand
  // out the copy from before the save) flipped the button back while the note still said "Saved".
  var pend = {};        // name -> time pick
  var tpend = {};       // name -> tees pick
  var seq = 0;
  var chain = {};       // one save at a time per player and kind, so two quick taps reach the sheet in order
  var PEND_MS = 120000;
  // Only a board that arrived after the save returned (a different teeTimes object) can confirm it.
  function pendVal(map, n, server, tt) {
    var q = map[n];
    if (!q) return undefined;
    if (q.state === 'saved' && ((tt !== q.ref && server === q.v) || Date.now() - q.at > PEND_MS)) { delete map[n]; return undefined; }
    return q.v;
  }
  function queue(key, fn) {
    var run = (chain[key] || Promise.resolve()).then(fn, fn);
    chain[key] = run.then(function () {}, function () {});
    return run;
  }
  var forName = '';     // admin: whose pick the buttons set
  var edit = null;      // admin: { night, early: [], late: [] } once Ty moves someone
  var cedit = null;     // admin: changes to already-confirmed groups, not saved until "Save changes"
  // Admin (Nov 13): everyone not in a group (bye, no reply, can't play) with Early / Late buttons, so Ty can put
  // anyone in a group at any time.
  // Nov 18 (Ty): active guests are listed too (tagged "guest"); adding one puts them on that night's card.
  function addBlock(tt, g, sched) {
    var names = tt.players.map(function (p) { return p.name; });
    (tt.guests || []).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    var out = names.filter(function (n) { return g.early.indexOf(n) < 0 && g.late.indexOf(n) < 0; });
    if (!out.length) return '';
    return '<div class="tt-add"><div class="tt-gsub">Not in a group. Tap Early or Late to add them.</div>' + out.map(function (n) {
      var c = choiceOf(tt, n);
      var why = c === 'Out' ? 'can\'t play' : isGuest(tt, n) ? 'guest' : !sched[n] ? 'bye' : c ? LABEL[c].toLowerCase() : 'no reply';
      return '<div class="tt-addrow"><span class="tt-addn">' + e(n) + ' <i class="tt-why' + (c === 'Out' ? ' out' : '') + '">' + why + '</i></span>' +
        '<span class="tt-addb"><button type="button" data-add="' + e(n) + '" data-to="early">Early</button><button type="button" data-add="' + e(n) + '" data-to="late">Late</button></span></div>';
    }).join('') + '</div>';
  }
  var note = { text: '', err: false };

  function t() { return window.data && window.data.teeTimes; }
  function isGuest(tt, n) { return (tt.guests || []).indexOf(n) >= 0; }
  function e(s) { return esc(s); }
  function choiceOf(tt, n) {
    var p = tt.players.filter(function (x) { return x.name === n; })[0];
    var server = p ? p.choice : '';
    var v = pendVal(pend, n, server, tt);
    return v !== undefined ? v : server;
  }
  // Players with a match that night (regular, one-way, or a makeup moved to that night). Everyone else has a bye.
  // Nights with no matches on the Matches tab (tiebreaker, playoffs) treat every member as scheduled.
  function scheduled(tt) {
    var s = {};
    tt.pairs.forEach(function (p) { s[p[0]] = true; s[p[1]] = true; });
    if (!Object.keys(s).length) tt.players.forEach(function (p) { s[p.name] = true; });
    return s;
  }
  function localDraft(night) { try { return JSON.parse(localStorage.getItem('teeDraft:' + night) || 'null'); } catch (x) { return null; } }
  function setLocalDraft(night, g) { try { if (g) localStorage.setItem('teeDraft:' + night, JSON.stringify({ early: g.early, late: g.late })); else localStorage.removeItem('teeDraft:' + night); } catch (x) {} }
  // Ty's saved arrangement (sheet first, this phone as a backup), or null.
  function savedDraft(tt) { return tt.draft || localDraft(tt.night); }
  // Keep a set of groups in step with current picks: drop players no longer playing, add new pickers to their side.
  function normalize(tt, g) {
    var nop = (tt.suggested && tt.suggested.nopick) || [];
    var playing = tt.players.map(function (p) { return p.name; }).filter(function (n) { var c = choiceOf(tt, n); return c === 'Early' || c === 'Late' || c === 'Either' || (!c && nop.indexOf(n) >= 0); });
    var early = (g.early || []).filter(function (n) { return playing.indexOf(n) >= 0; });
    var late = (g.late || []).filter(function (n) { return playing.indexOf(n) >= 0 && early.indexOf(n) < 0; });
    playing.forEach(function (n) {
      if (early.indexOf(n) >= 0 || late.indexOf(n) >= 0) return;
      var c = choiceOf(tt, n), s = tt.suggested;
      (c === 'Late' || (c !== 'Early' && s.late.indexOf(n) >= 0) ? late : early).push(n);
    });
    return { night: tt.night, early: early, late: late };
  }
  function saveDraft(tt, g) {
    setLocalDraft(tt.night, g);
    tt.draft = g ? { early: g.early, late: g.late } : null;
    post(g ? { action: 'teeDraft', night: tt.night, early: g.early, late: g.late } : { action: 'teeDraft', night: tt.night, clear: true }).catch(function () {});
  }
  // League-night tees (data.teeTimes.tees): the player's pick, else their Players-tab tees.
  function teesOf(tt, n) {
    var T = tt.tees, p = T && T.players && T.players[n];
    var server = p ? (p.pick || p.def || '') : '';
    var v = pendVal(tpend, n, server, tt);
    return v !== undefined ? v : server;
  }
  function teeTag(tt, n) { var x = teesOf(tt, n); return x ? ' <i class="tt-tee">' + e(x) + '</i>' : ''; }
  function teeRow(tt, who, can) {
    var T = tt.tees, p = T && T.players && T.players[who];
    if (!T || !p) return '';
    var cur = teesOf(tt, who), isDef = !Object.prototype.hasOwnProperty.call(tpend, who) && !p.pick;
    var nine = T.nine === 'Front' || T.nine === 'Back' ? T.nine + ' 9' : '18 holes';
    return '<div class="tt-tees"><div class="tt-you">' + (can ? 'Tees' : tt.confirmed ? 'Tees (locked)' : tt.state === 'before' ? 'Tees (pick from ' + e(tt.opens) + ')' : 'Tees (sign-up closed)') + ' <span class="tt-tsub">' + e(T.course) + ' · ' + e(nine) + '</span></div><div class="tt-tbtns">' +
      T.tees.filter(function (x) { return x.ok; }).map(function (x) {
        var ch = p.chs[x.tee];
        return '<button type="button"' + (can ? ' data-ttee="' + e(x.tee) + '"' : ' disabled') + ' class="' + (x.tee === cur ? 'on' : '') + '">' +
          '<span class="tt-tl"><span class="tt-tn">' + (x.color ? '<i class="tp-dot" style="background:' + e(x.color.toLowerCase()) + '"></i>' : '') + e(x.tee) + '</span>' +
          '<small>' + (x.yards ? Number(x.yards).toLocaleString('en-US') + ' yds' : e(x.color)) + '</small></span>' +
          // Nov 13 (Ty): the course handicap is what players pick tees by, so it's the big number, labelled HDCP.
          '<span class="tt-hc"><small>HDCP</small><b>' + (ch !== '' && ch !== undefined ? (ch < 0 ? '+' + (-ch) : ch) : '–') + '</b></span></button>';
      }).join('') + '</div>' + (isDef && cur ? '<div class="tt-byenote">' + e(cur) + ' is ' + (who === (RL.user() || {}).name ? 'your' : e(who) + '\'s') + ' usual tees. Tap another to change for this week.</div>' : '') + '</div>';
  }
  function noPick(tt, n) { return !!(tt && !choiceOf(tt, n) && tt.suggested && (tt.suggested.nopick || []).indexOf(n) >= 0); }
  function names(list, tt) { return list.length ? list.map(function (n) { return e(n) + (tt ? teeTag(tt, n) : '') + (noPick(tt, n) ? ' <span class="tt-np">(no pick)</span>' : ''); }).join(', ') : '<span class="tt-none">—</span>'; }
  function splitPairs(tt, early, late) {
    return tt.pairs.filter(function (p) {
      var a = early.indexOf(p[0]) >= 0 ? 'E' : late.indexOf(p[0]) >= 0 ? 'L' : '';
      var b = early.indexOf(p[1]) >= 0 ? 'E' : late.indexOf(p[1]) >= 0 ? 'L' : '';
      return a && b && a !== b;
    });
  }
  function groupBlock(tt, early, late, title, sub) {
    var split = splitPairs(tt, early, late);
    return '<div class="tt-groups"><div class="tt-gtitle">' + title + '</div>' + (sub ? '<div class="tt-gsub">' + sub + '</div>' : '') +
      '<div class="tt-g"><b>Early · ' + e(tt.times.Early) + '</b> <span class="tt-n">' + early.length + '</span><div>' + names(early, tt) + '</div></div>' +
      '<div class="tt-g"><b>Late · ' + e(tt.times.Late) + '</b> <span class="tt-n">' + late.length + '</span><div>' + names(late, tt) + '</div></div>' +
      (split.length ? '<div class="tt-warn">Head-to-head split: ' + split.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
      '</div>';
  }

  // ---- Member view (reworked Nov 24) ----
  // The Schedule tab's top card: your night (who you play, when sign-up closes), the time and tee pickers while you
  // still owe an answer, and one summary line with a Change button once you've answered. The roster and groups moved
  // into the Matchups card below it (index.html renderNightly, through window.teeGroups).
  // Tee colours as they read on the dark cards (plain CSS "blue" is too harsh); any other colour name is used as is.
  var DOT = { blue: '#3B6BE0', green: '#2E9E57', red: '#E0483B', gold: '#D9A520', yellow: '#E8CE3B', black: '#0B0D0C', white: '#FFFFFF', silver: '#C9D1CC' };
  var openPick = false;   // the member tapped Change, or just answered: keep the pickers open until Done
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nightDate(night) { var p = String(night || '').split('-'); return p.length === 3 ? new Date(+p[0], p[1] - 1, +p[2]) : null; }
  function shortTime(s) { var m = /^(\d+):(\d\d)/.exec(s || ''); return m ? (m[2] === '00' ? m[1] : m[1] + ':' + m[2]) : s; }
  function hcTxt(ch) { return ch === '' || ch === undefined || ch === null ? '–' : (ch < 0 ? '+' + (-ch) : String(ch)); }
  function chOf(tt, n) { var T = tt.tees, p = T && T.players && T.players[n], x = teesOf(tt, n); return p && x && p.chs[x] !== undefined ? p.chs[x] : ''; }
  // The groups to show for a night: confirmed, else Ty's saved arrangement, else the suggestion. null when the
  // tee-times card is for another night. Used by the Matchups card and My schedule.
  window.teeGroups = function (night) {
    var tt = t();
    if (!tt || tt.night !== night) return null;
    var conf = tt.confirmed, sched = scheduled(tt), g = { early: [], late: [] };
    var playing = tt.players.some(function (p) { var c = choiceOf(tt, p.name); return c === 'Early' || c === 'Late' || c === 'Either'; });
    if (conf) g = conf;
    else if (playing && (tt.draft || tt.suggested)) g = normalize(tt, tt.draft || tt.suggested);
    // With no saved arrangement from Ty, a pick made a moment ago shows in its own group right away (the
    // server's suggestion catches up on the next refresh).
    if (!conf && !tt.draft) tt.players.forEach(function (p) {
      var c = choiceOf(tt, p.name), to = c === 'Early' ? 'early' : c === 'Late' ? 'late' : '';
      if (!to || g[to].indexOf(p.name) >= 0) return;
      g = { early: g.early.filter(function (n) { return n !== p.name; }), late: g.late.filter(function (n) { return n !== p.name; }) };
      g[to].push(p.name);
    });
    var out = [], none = [];
    tt.players.forEach(function (p) {
      var c = choiceOf(tt, p.name), placed = g.early.indexOf(p.name) >= 0 || g.late.indexOf(p.name) >= 0;
      if (c === 'Out' && !placed) out.push(p.name);
      else if (!c && !placed && !conf && sched[p.name] && !isGuest(tt, p.name)) none.push(p.name);
    });
    return { early: g.early, late: g.late, times: tt.times, final: !!conf, out: out, none: none,
      choice: function (n) { return choiceOf(tt, n); }, nopick: function (n) { return !conf && noPick(tt, n); },
      tee: function (n) { return teesOf(tt, n); }, ch: function (n) { return chOf(tt, n); } };
  };
  function heroHead(tt, me, sched) {
    var T = tt.tees, d = nightDate(tt.night), casual = !!tt.casual;
    var course = (T && T.course) || tt.course || '', nine = T && (T.nine === 'Front' || T.nine === 'Back') ? T.nine + ' 9' : '';
    var when = casual || !d ? e(tt.label) : '<b' + (d.getDay() !== 4 ? ' class="off"' : '') + '>' + DOW[d.getDay()] + '</b> ' + MON[d.getMonth()] + ' ' + d.getDate();
    var opps = [];
    tt.pairs.forEach(function (p) { if (p[0] === me && opps.indexOf(p[1]) < 0) opps.push(p[1]); else if (p[1] === me && opps.indexOf(p[0]) < 0) opps.push(p[0]); });
    var inLeague = me && tt.players.some(function (p) { return p.name === me; });
    var title = opps.length ? 'You vs ' + opps.map(e).join(' &amp; ') : casual ? 'Casual round' : inLeague && !sched[me] && !isGuest(tt, me) ? 'Bye this week' : 'Tee times';
    var pill = function (who, n) { var x = teesOf(tt, n); return T && T.players && T.players[n] ? '<span>' + who + ' <b>HDCP ' + hcTxt(chOf(tt, n)) + '</b>' + (x ? ' · ' + e(x) : '') + '</span>' : ''; };
    var pills = inLeague ? pill('You', me) + opps.map(function (o) { return pill(e(o), o); }).join('') : '';
    // Nov 25 (Ty): Reschedule chip beside "You vs X", same as the ones in My schedule (index.html's rsTap handles the tap).
    var rs = '';
    if (opps.length && !casual && d) {
      var lab = MON[d.getMonth()] + ' ' + d.getDate();
      var mine = ((window.data && window.data.schedule) || []).filter(function (p) { return p.name === me; })[0];
      var wk = mine && mine.weeks.filter(function (x) { return x.status === 'upcoming' && (x.date === lab || (x.rs && x.rs.night === tt.night)); })[0];
      var r1 = wk && (wk.rs || ((wk.extras || []).filter(function (m) { return m.rs; })[0] || {}).rs);
      if (r1) rs = '<span role="button" tabindex="0" class="rs-btn" aria-label="Reschedule ' + e(lab) + '" data-rs="' + e(JSON.stringify({ night: r1.night, player: me, vs: opps.join(' and '), date: lab })) + '">' +
        '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg><span>Reschedule</span></span>';
    }
    return '<div class="sd-hh"><div class="sd-eye">' + when + (course ? ' · ' + e(course) : '') + (nine ? ' · ' + nine : '') + '</div><div class="sd-trow"><div class="sd-title">' + title + '</div>' + rs + '</div></div>' +
      (pills ? '<div class="sd-pills">' + pills + '</div>' : '');
  }
  function pickers(tt, me) {
    var T = tt.tees, p = T && T.players && T.players[me], cur = choiceOf(tt, me), tcur = teesOf(tt, me);
    var times = ['Early', 'Late', 'Either'].map(function (c) {
      var sub = c === 'Either' ? shortTime(tt.times.Early) + ' or ' + shortTime(tt.times.Late) : tt.times[c];
      return '<button type="button" data-tee="' + c + '" class="' + (cur === c ? 'on' : '') + '"' + (cur === c ? ' aria-pressed="true"' : '') + '><b>' + LABEL[c] + '</b><small>' + e(sub) + '</small></button>';
    }).join('');
    var tees = !T || !p ? '' : '<div class="sd-lab">Your tees <span>Big number = your handicap</span></div><div class="sd-tees">' +
      T.tees.filter(function (x) { return x.ok; }).map(function (x) {
        var ch = p.chs[x.tee];
        return '<button type="button" data-ttee="' + e(x.tee) + '" class="' + (x.tee === tcur ? 'on' : '') + '"' + (x.tee === tcur ? ' aria-pressed="true"' : '') + '>' +
          '<span class="sd-tl"><span class="sd-tn">' + (x.color ? '<i class="tp-dot" style="background:' + e(DOT[x.color.toLowerCase()] || x.color.toLowerCase()) + '"></i>' : '') + e(x.tee) + (x.tee === p.def ? '<em>usual</em>' : '') + '</span>' +
          '<small>' + (x.yards ? Number(x.yards).toLocaleString('en-US') + ' yds' : e(x.color)) + '</small></span><b>' + hcTxt(ch) + '</b></button>';
      }).join('') + '</div>';
    return '<div class="sd-lab">When can you play?</div><div class="sd-times">' + times + '</div>' +
      '<button type="button" data-tee="Out" class="sd-out' + (cur === 'Out' ? ' on' : '') + '"' + (cur === 'Out' ? ' aria-pressed="true"' : '') + '>Can\'t play this week</button>' +
      (note.text ? '<div class="tt-msg' + (note.err ? ' err' : '') + '" role="status">' + e(note.text) + '</div>' : '') + tees;
  }
  var CHECK = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  function statusRow(kind, main, sub, btn) {
    return '<div class="sd-row"><div class="sd-rl"><span class="sd-ico ' + kind + '">' + (kind === 'ok' ? CHECK : kind === 'out' ? '✕' : kind === 'lock' ? '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' : '–') + '</span>' +
      '<div><div class="sd-main">' + main + '</div>' + (sub ? '<div class="sd-sub">' + sub + '</div>' : '') + '</div></div>' + (btn || '') + '</div>';
  }
  function playerCard(tt, a) {
    var conf = tt.confirmed, casual = !!tt.casual, me = a ? a.name : '', sched = scheduled(tt);
    if (tt.state === 'before' && !conf) return '';   // Nov 13 (Ty): nothing for players until sign-up opens
    var inLeague = !!a && tt.players.some(function (p) { return p.name === me; });
    var my = inLeague ? choiceOf(tt, me) : '', myTees = inLeague ? teesOf(tt, me) : '';
    var teeLine = myTees ? e(myTees) + ' tees · HDCP ' + hcTxt(chOf(tt, me)) : '';
    var closes = casual ? 'Open until the first group tees off' : 'Closes ' + e(tt.closes);
    var head = heroHead(tt, me, sched), html = '', need = false;
    var G = window.teeGroups(tt.night), grp = !G ? '' : G.early.indexOf(me) >= 0 ? 'Early' : G.late.indexOf(me) >= 0 ? 'Late' : '';
    if (conf) {
      openPick = false;
      var by = 'Groups set by ' + e(conf.by) + (conf.at ? ' · ' + e(conf.at) : '');
      html = head + '<div class="sd-div"></div>' + (!inLeague ? statusRow('lock', 'Groups are set', by)
        : grp ? statusRow('lock', 'You\'re in: ' + grp + ' · ' + e(tt.times[grp]), (teeLine ? teeLine + ' · ' : '') + 'locked') + '<div class="sd-foot">' + by + '</div>'
        : statusRow('none', my === 'Out' ? 'You\'re out this week' : !sched[me] ? 'You have a bye this week' : 'You\'re not in a group this week', by));
    } else if (inLeague && tt.state === 'open') {
      var bye = !sched[me] && !isGuest(tt, me);
      need = !my && !bye;
      if (openPick || need) {
        html = '<div class="sd-top">' + (need ? '<span class="sd-need">Your answer needed</span>' : '<span class="sd-yp">Your pick</span>') + '<span class="sd-close">' + closes + '</span></div>' + head + '<div class="sd-div"></div>' +
          (bye ? '<div class="sd-foot">You have a bye this week. Pick a time only if you\'re coming to play.</div>' : '') + pickers(tt, me) +
          (need ? '<div class="sd-foot">Saves when you tap. Change it any time until sign-up closes.</div>' : '<button type="button" class="sd-btn wide" id="sddone">Done</button>');
      } else {
        var chg = '<button type="button" class="sd-btn" id="sdchange">' + (my ? 'Change' : 'Play anyway') + '</button>';
        var main = my === 'Out' ? 'You\'re out this week' : my === 'Either' ? 'You\'re in: Either time' : my ? 'You\'re in: ' + my + ' · ' + e(tt.times[my]) : 'No match for you this week';
        var sub = my === 'Out' ? '' : my ? teeLine + (my === 'Either' && grp ? ' · ' + grp + ' group so far' : '') : 'Coming to play anyway? Pick a time.';
        html = head + '<div class="sd-div"></div>' + statusRow(my === 'Out' ? 'out' : my ? 'ok' : 'none', main, sub, chg) +
          (note.text ? '<div class="tt-msg' + (note.err ? ' err' : '') + '" role="status">' + e(note.text) + '</div>' : '') +
          '<div class="sd-foot">' + (casual ? closes + '.' : 'You can change it until ' + e(tt.closes) + '.') + '</div>';
      }
    } else if (inLeague) {
      openPick = false;
      html = head + '<div class="sd-div"></div>' + statusRow(my && my !== 'Out' ? 'ok' : 'none',
        my === 'Out' ? 'You\'re out this week' : my ? 'You picked ' + LABEL[my] + (tt.times[my] ? ' · ' + e(tt.times[my]) : '') : 'No pick from you',
        (my && my !== 'Out' && teeLine ? teeLine + ' · ' : '') + (casual ? 'Closed · the first group has teed off' : 'Sign-up closed · groups being set'));
    } else {
      html = '<div class="sd-top"><span class="sd-yp">Tee times</span><span class="sd-close">' + (tt.state === 'open' ? closes : casual ? 'Closed' : 'Sign-up closed') + '</span></div>' + head +
        (!a && tt.state === 'open' ? '<button type="button" class="sd-btn wide amber" id="ttsignin">Sign in to pick your time</button>' : '');
    }
    return '<div class="card sd-hero' + (need ? ' need' : '') + '">' + html + '</div>';
  }

  // Nov 13: the Schedule tab shows everyone (Ty included) the player view; Ty's admin controls live in Admin > Schedule.
  // ---- Admin > Tee times (Nov 25): Answers / Groups views, Confirm pinned above the tab bar, Undo after a move ----
  // Answers: count tiles (with Waiting), one row per player who's scheduled or has answered; tap a row to answer or change
  // tees for them. Byes and guests with no answer fold into one row. Groups: Early / Late cards of move chips.
  var aview = 'answers', byeOpen = false, addOpen = false, lastMove = null, nudge = [];
  var CHEV = '<svg class="tta-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var CHEVD = '<svg class="tta-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var SWAP = '<svg class="tta-swap" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16"/><path d="M4 17l3 3 3-3"/><path d="M17 20V4"/><path d="M14 7l3-3 3 3"/></svg>';
  function adminGroups(tt) {
    var conf = tt.confirmed;
    if (conf) return cedit || { night: tt.night, early: conf.early.slice(), late: conf.late.slice() };
    var sd = edit || savedDraft(tt), g = normalize(tt, sd || tt.suggested);
    if (sd) edit = g;
    return g;
  }
  function adminCard(tt, a, status) {
    var casual = !!tt.casual, conf = tt.confirmed, sched = scheduled(tt), canPick = !conf;
    var league = tt.players.map(function (p) { return p.name; });
    var isBye = function (n) { return !sched[n] && !isGuest(tt, n); };
    var by = { Early: [], Late: [], Either: [], Out: [] }, none = [], rest = [];
    league.forEach(function (n) {
      var c = choiceOf(tt, n);
      if (by[c]) by[c].push(n); else if (sched[n] && !isGuest(tt, n)) none.push(n); else rest.push(n);
    });
    if (league.indexOf(forName) < 0 || !canPick) forName = '';
    var g = adminGroups(tt), split = splitPairs(tt, g.early, g.late);
    if (lastMove && (lastMove.night !== tt.night || g[lastMove.to].indexOf(lastMove.n) < 0)) lastMove = null;

    var html = '<div class="tta"><div class="tta-sub">' + e(tt.label) + ' · <span' + (conf ? ' class="done"' : '') + '>' + status + '</span></div>' +
      '<div class="seg2" role="group" aria-label="Tee times view">' +
      '<button type="button" data-ttview="answers" class="' + (aview === 'answers' ? 'on' : '') + '" aria-pressed="' + (aview === 'answers') + '">Answers</button>' +
      '<button type="button" data-ttview="groups" class="' + (aview === 'groups' ? 'on' : '') + '" aria-pressed="' + (aview === 'groups') + '">Groups</button></div>';
    if (note.text) html += '<div class="tt-msg' + (note.err ? ' err' : '') + '">' + e(note.text) + '</div>';

    if (aview === 'answers') {
      var row = function (n) {
        var c = choiceOf(tt, n), bye = isBye(n), open = canPick && forName === n;
        var tag = c ? LABEL[c] : isGuest(tt, n) ? 'Guest' : bye ? 'Bye' : 'No answer';
        var h = '<button type="button" class="tta-row' + (open ? ' open' : '') + '"' + (canPick ? ' data-ttwho="' + e(n) + '" aria-expanded="' + open + '"' : ' disabled') + '>' +
          '<span class="tta-n">' + e(n) + teeTag(tt, n) + (c && bye ? ' <i class="tt-why">bye</i>' : c && isGuest(tt, n) ? ' <i class="tt-why">guest</i>' : '') + '</span>' +
          '<span class="tta-a' + (c === 'Out' ? ' out' : !c ? ' none' : '') + '">' + tag + '</span>' + (canPick ? CHEV : '') + '</button>';
        if (open) h += '<div class="tta-pick"><input type="hidden" id="ttfor" value="' + e(n) + '"><div class="tt-btns">' + ORDER.map(function (k) {
            return '<button type="button" data-tee="' + k + '" class="' + (c === k ? 'on ' : '') + (k === 'Out' ? 'out' : '') + '"' + (c === k ? ' aria-pressed="true"' : '') + '>' +
              LABEL[k] + (tt.times[k] ? '<small>' + e(tt.times[k]) + '</small>' : '') + '</button>';
          }).join('') + '</div>' +
          (bye ? '<div class="tt-byenote">' + (n === a.name ? 'You have' : e(n) + ' has') + ' a bye this week. Pick a time only if ' + (n === a.name ? 'you\'re' : e(n) + ' is') + ' coming to play.</div>' : '') +
          teeRow(tt, n, true) + '</div>';
        return h;
      };
      var tile = function (k, v, cls) { return '<div class="tta-tile' + (cls ? ' ' + cls : '') + '"><b>' + v + '</b><span>' + k + '</span></div>'; };
      var rowsNow = by.Early.concat(by.Late, by.Either, by.Out, none);
      html += '<div class="tta-tiles">' + tile('Early', by.Early.length) + tile('Late', by.Late.length) + tile('Either', by.Either.length) +
        tile('Can\'t', by.Out.length, by.Out.length ? 'out' : '') + tile('Waiting', none.length, none.length && !conf ? 'wait' : '') + '</div>' +
        '<div class="card tta-list">' + (rowsNow.length ? rowsNow.map(row).join('') : '<div class="empty">No answers yet.</div>') +
        '<div class="tta-hint">' + (canPick ? 'Tap a player to answer or change tees for them.' : 'Groups are confirmed, so answers are locked. Reopen sign-up from Groups to change them.') + '</div></div>';
      nudge = none.slice();
      if (none.length && canPick && tt.state !== 'before') {
        html += '<div class="card tta-wait"><div><b>Waiting on ' + none.length + '</b><small>' + none.map(e).join(', ') + '</small></div>' +
          '<button type="button" class="pk-btn" data-ttnudge="1" data-gotab="adminmsg">Nudge</button></div>';
      }
      if (rest.length) {
        var nb = rest.filter(isBye).length, ng = rest.length - nb;
        var lab = nb && ng ? 'On a bye (' + nb + ') and ' + ng + (ng === 1 ? ' guest' : ' guests') : nb ? 'On a bye (' + nb + ')' : (ng === 1 ? 'Guest' : 'Guests') + ' (' + ng + ')';
        html += '<div class="card tta-list tta-more"><button type="button" class="tta-row tta-morebtn" data-ttopen="bye" aria-expanded="' + byeOpen + '">' +
          '<span class="tta-n">' + lab + '<small>' + rest.map(e).join(', ') + '</small></span>' + CHEVD + '</button>' + (byeOpen ? rest.map(row).join('') : '') + '</div>';
      }
    } else {
      var chip = function (n, to) {
        var sub = [teesOf(tt, n), choiceOf(tt, n) === 'Either' ? 'either' : ''].filter(Boolean).join(' · ');
        return '<button type="button" class="tt-chip tta-chip" data-move="' + e(n) + '" data-to="' + to + '" aria-label="Move ' + e(n) + ' to ' + (to === 'late' ? 'Late' : 'Early') + '">' +
          '<span><b>' + e(n) + '</b>' + (sub ? '<small>' + e(sub) + '</small>' : '') + '</span>' + SWAP + '</button>';
      };
      var grp = function (k, list, to) {
        return '<div class="card tta-g"><div class="tta-gh"><b>' + k + ' · ' + e(tt.times[k]) + '</b><span>' + list.length + (list.length === 1 ? ' player' : ' players') + '</span></div>' +
          '<div class="tta-chips">' + (list.length ? list.map(function (n) { return chip(n, to); }).join('') : '<span class="tt-none">Nobody yet</span>') + '</div></div>';
      };
      var all = league.slice(); (tt.guests || []).forEach(function (n) { if (all.indexOf(n) < 0) all.push(n); });
      var outN = all.filter(function (n) { return g.early.indexOf(n) < 0 && g.late.indexOf(n) < 0; }).length;
      html += '<div class="tta-gsub">' + (conf ? (cedit ? 'Groups (unsaved changes)' : 'Confirmed groups') : edit ? 'Your groups' : 'Suggested groups') + '. Tap a name to move it to the other group.</div>' +
        grp('Early', g.early, 'late') + grp('Late', g.late, 'early') +
        (split.length ? '<div class="tt-warn">Head-to-head split: ' + split.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
        (by.Out.length ? '<div class="tta-gsub">Can\'t play: ' + by.Out.map(e).join(', ') + '</div>' : '');
      if (outN) {
        html += '<div class="card tta-list tta-more"><button type="button" class="tta-row tta-morebtn" data-ttopen="add" aria-expanded="' + addOpen + '">' +
          '<span class="tta-n">Add someone else (' + outN + ')<small>On a bye, a guest, or not in a group</small></span>' + CHEVD + '</button>' + (addOpen ? addBlock(tt, g, sched) : '') + '</div>';
      }
      var bar = '';
      if (lastMove) bar += '<div class="tta-toast" role="status"><span>Moved ' + e(lastMove.n) + ' to ' + (lastMove.to === 'late' ? 'Late' : 'Early') + '</span><button type="button" data-ttundo="1">Undo</button></div>';
      if (!conf) {
        bar += '<button type="button" class="en-save tt-confirm" id="ttconfirm">Confirm groups</button>' +
          '<div class="pin-hint">' + (casual ? 'Locks everyone\'s tee time and tees. Casual round: no alert, and nothing is confirmed for you.'
            : 'Locks times and tees and sends the groups alert. If you don\'t, it confirms on its own at ' + e(String(tt.closes || '').replace(/^.* at /, '')) + '.') + '</div>' +
          (edit ? '<button type="button" class="rl-link tt-small" id="ttreset">Back to suggested</button>' : '');
      } else if (cedit) {
        bar += '<button type="button" class="en-save tt-confirm" id="ttconfirm">Save changes</button>' +
          '<div class="pin-hint">' + (casual ? 'Casual round: saving sends no alert.' : 'Saving sends everyone the updated groups alert.') + '</div>' +
          '<button type="button" class="rl-link tt-small" id="ttcancel">Cancel changes</button>';
      }
      if (bar) html += '<div class="pin-bar tta-bar">' + bar + '</div>';
      if (conf) html += '<button type="button" class="rl-link tt-small" id="ttreopen">Reopen sign-up</button>';
    }
    return { html: html + '</div>', groups: g };
  }
  // Status line for Admin home and the header dot (admin.js).
  window.teeAdminInfo = function () {
    var tt = t(); if (!tt) return null;
    var sched = scheduled(tt), c = { Early: 0, Late: 0, Either: 0, Out: 0 }, none = 0, g = { early: [], late: [] };
    tt.players.forEach(function (p) { var ch = choiceOf(tt, p.name); if (c[ch] !== undefined) c[ch]++; else if (sched[p.name] && !isGuest(tt, p.name)) none++; });
    try { g = tt.confirmed || normalize(tt, edit || savedDraft(tt) || tt.suggested); } catch (x) {}
    return { label: tt.label, state: tt.state, opens: tt.opens, closes: tt.closes, auto: String(tt.closes || '').replace(/^.* at /, ''), casual: !!tt.casual, confirmed: !!tt.confirmed,
      inn: c.Early + c.Late + c.Either, out: c.Out, none: none, early: (g.early || []).length, late: (g.late || []).length };
  };
  document.addEventListener('click', function (ev) {
    var v = ev.target.closest && ev.target.closest('[data-ttview]');
    if (v) { aview = v.getAttribute('data-ttview') === 'groups' ? 'groups' : 'answers'; note = { text: '', err: false }; if (window.TEE_ADMIN) window.renderTee(); }
    if (ev.target.closest && ev.target.closest('[data-ttnudge]') && window.msgPrefill) {
      var tt = t();
      window.msgPrefill(nudge, tt ? 'Tee times for ' + tt.label + ': pick Early, Late or Either in the app.' : '');
    }
  });

  function cardId() { return window.TEE_ADMIN ? 'adminteecard' : 'teecard'; }
  function cardEl() { return document.getElementById(cardId()); }
  window.renderTee = function () {
    var other = document.getElementById(window.TEE_ADMIN ? 'teecard' : 'adminteecard');
    if (other) { other.innerHTML = ''; delete other.dataset.groups; }
    var el = cardEl();
    if (!el) return;
    var tt = t();
    if (!tt) { el.innerHTML = window.TEE_ADMIN ? '<div class="card empty">No upcoming league night on the Season tab.</div>' : ''; return; }
    var a = RL.user(), admin = !!(a && a.admin) && !!window.TEE_ADMIN, me = a ? a.name : '';
    // Nov 24: the Schedule tab gets the member card; everything below is Ty's Admin > Schedule card.
    if (!window.TEE_ADMIN) { el.innerHTML = playerCard(tt, a); delete el.dataset.groups; return; }
    // Nov 13 (Ty): players don't see the card until sign-up opens (Wed 8 AM). Ty's Admin > Schedule still shows it.
    if (!admin && tt.state === 'before' && !tt.confirmed) { el.innerHTML = ''; return; }
    var casual = !!tt.casual;   // casual round on Tonight: open now, locks at the first score, guests included
    var league = tt.players.map(function (p) { return p.name; });
    var sched = scheduled(tt);
    var conf = tt.confirmed;
    if (edit && edit.night !== tt.night) edit = null;
    if (conf) edit = null;
    if (!conf || (cedit && cedit.night !== tt.night)) cedit = null;

    var status = conf ? 'Groups set by ' + e(conf.by) + (conf.at ? ' · ' + e(conf.at) : '')
      : tt.state === 'before' ? 'Sign-up opens ' + e(tt.opens)
      : tt.state === 'open' ? (casual ? 'Open until the first group tees off' : 'Pick by ' + e(tt.closes))
      : casual ? 'Closed · the first group has teed off'
      : 'Sign-up closed · groups being set';

    // Nov 25: Ty's Admin > Tee times page has its own layout (adminCard above); the rest of this function is the older shared card.
    if (admin) { var ac = adminCard(tt, a, status); el.innerHTML = ac.html; el.dataset.groups = JSON.stringify(ac.groups); return; }
    var who = admin ? (league.indexOf(forName) >= 0 ? forName : (league.indexOf(me) >= 0 ? me : league[0])) : me;
    var canPick = !!a && !conf && (admin || (tt.state === 'open' && league.indexOf(me) >= 0));
    var html = '<div class="card tt"><div class="tt-head"><div class="tt-title">' + e(tt.label) + ' · Tee times</div>' +
      '<div class="tt-status' + (conf ? ' done' : '') + '">' + status + '</div></div>';

    if (canPick) {
      html += '<div class="tt-pick">' +
        (admin ? '<label class="tt-for">Pick for <select id="ttfor">' + league.map(function (n) {
          return '<option value="' + e(n) + '"' + (n === who ? ' selected' : '') + '>' + e(n) + (isGuest(tt, n) ? ' (guest)' : sched[n] ? '' : ' (bye)') + '</option>';
        }).join('') + '</select></label>' : '<div class="tt-you">Your pick</div>') +
        '<div class="tt-btns">' + ORDER.map(function (c) {
          return '<button type="button" data-tee="' + c + '" class="' + (choiceOf(tt, who) === c ? 'on ' : '') + (c === 'Out' ? 'out' : '') + '">' +
            LABEL[c] + (tt.times[c] ? '<small>' + e(tt.times[c]) + '</small>' : '') + '</button>';
        }).join('') + '</div>' +
        (!sched[who] && !isGuest(tt, who) ? '<div class="tt-byenote">' + (who === me ? 'You have' : e(who) + ' has') + ' a bye this week. Pick a time only if ' + (who === me ? 'you\'re' : e(who) + ' is') + ' coming to play.</div>' : '') +
        teeRow(tt, who, true) +
        '</div>';
    } else if (a && league.indexOf(me) >= 0 && tt.tees) {
      html += '<div class="tt-pick">' + teeRow(tt, me, false) + '</div>';
    } else if (!a && !conf && tt.state === 'open') {
      html += '<div class="tt-pick"><button type="button" class="rl-link tt-signin" id="ttsignin">Sign in to pick your time</button></div>';
    }
    if (note.text) html += '<div class="tt-msg' + (note.err ? ' err' : '') + '">' + e(note.text) + '</div>';

    // Summary by choice
    var by = { Early: [], Late: [], Either: [], Out: [] }, none = [];
    var byes = [];
    league.forEach(function (n) {
      var c = choiceOf(tt, n);
      if (by[c]) by[c].push(n); else if (sched[n] && !isGuest(tt, n)) none.push(n);
      if (!sched[n] && !isGuest(tt, n)) byes.push(n + (c ? ' (' + LABEL[c].toLowerCase() + ')' : ''));
    });
    html += '<div class="tt-sum">' + ORDER.map(function (c) {
      return '<div class="tt-col ' + c.toLowerCase() + '"><div class="tt-k">' + LABEL[c] + ' <span class="tt-n">' + by[c].length + '</span></div>' +
        '<div class="tt-names">' + (by[c].length ? by[c].map(e).join(', ') : '<span class="tt-none">—</span>') + '</div></div>';
    }).join('') + '</div>' +
      (none.length && !conf ? '<div class="tt-noreply"><b>No reply yet:</b> ' + none.map(e).join(', ') + '</div>' : '') +
      (byes.length ? '<div class="tt-noreply"><b>Bye this week:</b> ' + byes.map(e).join(', ') + '</div>' : '');

    // Groups
    var chip = function (n, to) { return '<button type="button" class="tt-chip" data-move="' + e(n) + '" data-to="' + to + '">' + e(n) + teeTag(tt, n) + (choiceOf(tt, n) === 'Either' ? ' <i>either</i>' : '') + '</button>'; };
    if (conf && admin) {
      // Ty can still change confirmed groups: moves and adds stay on this phone until he saves (which re-sends the alert).
      var cg = cedit || { night: tt.night, early: conf.early.slice(), late: conf.late.slice() };
      var csplit = splitPairs(tt, cg.early, cg.late);
      html += '<div class="tt-groups"><div class="tt-gtitle">' + (cedit ? 'Groups (unsaved changes)' : 'Groups') + '</div><div class="tt-gsub">Tap a name to move it to the other group.</div>' +
        '<div class="tt-g"><b>Early · ' + e(tt.times.Early) + '</b> <span class="tt-n">' + cg.early.length + '</span><div class="tt-chips">' + cg.early.map(function (n) { return chip(n, 'late'); }).join('') + '</div></div>' +
        '<div class="tt-g"><b>Late · ' + e(tt.times.Late) + '</b> <span class="tt-n">' + cg.late.length + '</span><div class="tt-chips">' + cg.late.map(function (n) { return chip(n, 'early'); }).join('') + '</div></div>' +
        (csplit.length ? '<div class="tt-warn">Head-to-head split: ' + csplit.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
        addBlock(tt, cg, sched) +
        (cedit ? '<button type="button" class="en-save tt-confirm" id="ttconfirm">Save changes</button><button type="button" class="rl-link tt-small" id="ttcancel">Cancel changes</button>' +
          '<div class="tt-gsub">' + (casual ? 'Casual round: saving sends no alert.' : 'Saving sends everyone the updated groups alert.') + '</div>' : '') +
        '</div>';
      el.dataset.groups = JSON.stringify(cg);
      html += '<button type="button" class="rl-link tt-small" id="ttreopen">Reopen sign-up</button>';
    } else if (conf) {
      html += groupBlock(tt, conf.early, conf.late, 'Groups');
    } else if (admin || by.Early.length + by.Late.length + by.Either.length) {
      if (admin) {
        var sd = edit || savedDraft(tt);
        var g = normalize(tt, sd || tt.suggested);
        if (sd) edit = g;
        var split = splitPairs(tt, g.early, g.late);
        html += '<div class="tt-groups"><div class="tt-gtitle">' + (edit ? 'Your groups' : 'Suggested groups') + '</div><div class="tt-gsub">Tap a name to move it to the other group.</div>' +
          '<div class="tt-g"><b>Early · ' + e(tt.times.Early) + '</b> <span class="tt-n">' + g.early.length + '</span><div class="tt-chips">' + g.early.map(function (n) { return chip(n, 'late'); }).join('') + '</div></div>' +
          '<div class="tt-g"><b>Late · ' + e(tt.times.Late) + '</b> <span class="tt-n">' + g.late.length + '</span><div class="tt-chips">' + g.late.map(function (n) { return chip(n, 'early'); }).join('') + '</div></div>' +
          (split.length ? '<div class="tt-warn">Head-to-head split: ' + split.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
          addBlock(tt, g, sched) +
          '<button type="button" class="en-save tt-confirm" id="ttconfirm">Confirm groups</button>' +
          (edit ? '<button type="button" class="rl-link tt-small" id="ttreset">Back to suggested</button>' : '') +
          '<div class="tt-gsub">' + (casual ? 'Confirming locks everyone\'s tee time and tees. Casual round: no alert, and nothing is confirmed for you.'
            : 'Confirming locks everyone\'s tee time and tees and sends the groups alert. If you don\'t, this is confirmed for you at ' + e(tt.closes.replace(/^.* at /, '')) + '.') + '</div></div>';
        el.dataset.groups = JSON.stringify(g);
      } else {
        var dr = tt.draft ? normalize(tt, tt.draft) : null;
        html += dr ? groupBlock(tt, dr.early, dr.late, 'Groups so far', 'Ty hasn\'t confirmed these yet.')
          : groupBlock(tt, tt.suggested.early, tt.suggested.late, 'Suggested groups', 'Ty confirms the final groups.');
      }
    }
    html += '</div>';
    el.innerHTML = html;
  };

  function post(body) {
    var a = RL.user();
    body.token = a && a.token;
    return RL.post(body);
  }
  function setNote(text, err) {
    note = { text: text, err: !!err }; renderTee();
    if (!window.TEE_ADMIN && typeof window.renderNightly === 'function' && !document.getElementById('svnight').classList.contains('hide')) window.renderNightly();
  }

  document.addEventListener('click', function (ev) {
    var tt = t();
    if (!tt || !ev.target.closest('#teecard, #adminteecard')) return;
    var wr = ev.target.closest('[data-ttwho]');
    if (wr) { var wn = wr.getAttribute('data-ttwho'); forName = forName === wn ? '' : wn; note = { text: '', err: false }; renderTee(); return; }
    var op = ev.target.closest('[data-ttopen]');
    if (op) { if (op.getAttribute('data-ttopen') === 'bye') byeOpen = !byeOpen; else addOpen = !addOpen; renderTee(); return; }
    if (ev.target.closest('[data-ttundo]')) {
      if (!lastMove) return;
      var ug = JSON.parse(cardEl().dataset.groups || '{"early":[],"late":[]}'), un = lastMove.n, uf = lastMove.from;
      ug.early = ug.early.filter(function (x) { return x !== un; });
      ug.late = ug.late.filter(function (x) { return x !== un; });
      ug[uf].push(un); lastMove = null;
      if (tt.confirmed) cedit = { night: tt.night, early: ug.early, late: ug.late };
      else { edit = ug; saveDraft(tt, ug); }
      renderTee();
      return;
    }
    var b = ev.target.closest('[data-tee]');
    if (b) {
      var a = RL.user();
      var sel = document.getElementById('ttfor');
      var who = a && a.admin && sel ? sel.value : a && a.name;
      var c = b.getAttribute('data-tee'), id = ++seq;
      if (!window.TEE_ADMIN) openPick = true;
      pend[who] = { v: c, id: id, state: 'saving', at: Date.now() };
      setNote('Saving ' + who + ': ' + LABEL[c] + '…');
      queue('t|' + who, function () { return post({ action: 'tee', name: who, choice: c }); }).then(function () {
        var q = pend[who];
        if (!q || q.id !== id) return; // a newer tap for this player replaced it
        q.state = 'saved'; q.at = Date.now(); q.ref = t();
        setNote('Saved ' + who + ': ' + LABEL[c] + ' ✓');
        load();
      }, function (er) {
        var q = pend[who];
        if (!q || q.id !== id) return;
        delete pend[who];
        setNote(er.message || 'Couldn\'t save. Try again.', true);
        if (er.code === 'locked') load();
      });
      return;
    }
    var tb = ev.target.closest('[data-ttee]');
    if (tb) {
      var au = RL.user(), sl = document.getElementById('ttfor');
      var w = au && au.admin && sl ? sl.value : au && au.name;
      var tv = tb.getAttribute('data-ttee'), tid = ++seq;
      if (!window.TEE_ADMIN) openPick = true;
      tpend[w] = { v: tv, id: tid, state: 'saving', at: Date.now() };
      setNote('Saving ' + w + ': ' + tv + ' tees…');
      queue('s|' + w, function () { return post({ action: 'tee', name: w, tees: tv }); }).then(function () {
        var q = tpend[w];
        if (!q || q.id !== tid) return;
        q.state = 'saved'; q.at = Date.now(); q.ref = t();
        setNote('Saved ' + w + ': ' + tv + ' tees ✓');
        load();
      }, function (er) {
        var q = tpend[w];
        if (!q || q.id !== tid) return;
        delete tpend[w];
        setNote(er.message || 'Couldn\'t save. Try again.', true);
        if (er.code === 'locked') load();
      });
      return;
    }
    var m = ev.target.closest('[data-move]');
    if (m) {
      var g = JSON.parse(cardEl().dataset.groups || '{}');
      var n = m.getAttribute('data-move'), to = m.getAttribute('data-to');
      lastMove = { night: tt.night, n: n, to: to, from: to === 'late' ? 'early' : 'late' };
      g.early = g.early.filter(function (x) { return x !== n; });
      g.late = g.late.filter(function (x) { return x !== n; });
      g[to].push(n);
      if (tt.confirmed) cedit = { night: tt.night, early: g.early, late: g.late };
      else { edit = g; saveDraft(tt, g); }
      renderTee();
      return;
    }
    // Admin: put someone who isn't in a group into Early or Late.
    var ad = ev.target.closest('[data-add]');
    if (ad) {
      var an = ad.getAttribute('data-add'), ato = ad.getAttribute('data-to');
      var ag = JSON.parse(cardEl().dataset.groups || '{"early":[],"late":[]}');
      ag.early = ag.early.filter(function (x) { return x !== an; });
      ag.late = ag.late.filter(function (x) { return x !== an; });
      ag[ato].push(an);
      if (tt.confirmed) { cedit = { night: tt.night, early: ag.early, late: ag.late }; renderTee(); return; }
      // Before confirming: also set their pick to that time, so the suggestion, the 3 PM auto-close and the
      // groups alert all include them (the server lets Ty set anyone's pick until groups are confirmed).
      if (edit || savedDraft(tt)) { edit = { night: tt.night, early: ag.early, late: ag.late }; saveDraft(tt, edit); }
      var ach = ato === 'early' ? 'Early' : 'Late', aid = ++seq;
      pend[an] = { v: ach, id: aid, state: 'saving', at: Date.now() };
      setNote('Adding ' + an + ' to ' + ach + '…');
      queue('t|' + an, function () { return post({ action: 'tee', name: an, choice: ach }); }).then(function () {
        var q = pend[an];
        if (!q || q.id !== aid) return;
        q.state = 'saved'; q.at = Date.now(); q.ref = t();
        setNote('Added ' + an + ' to ' + ach + ' ✓');
        load();
      }, function (er) {
        var q = pend[an];
        if (q && q.id === aid) delete pend[an];
        setNote(er.message || 'Couldn\'t save. Try again.', true);
        if (er.code === 'locked') load();
      });
      return;
    }
    if (ev.target.id === 'sdchange') { openPick = true; note = { text: '', err: false }; renderTee(); return; }
    if (ev.target.id === 'sddone') { openPick = false; note = { text: '', err: false }; renderTee(); return; }
    if (ev.target.id === 'ttcancel') { cedit = null; lastMove = null; renderTee(); return; }
    if (ev.target.id === 'ttreset') { edit = null; lastMove = null; saveDraft(tt, null); renderTee(); return; }
    if (ev.target.id === 'ttsignin') { RL.signIn(); return; }
    if (ev.target.id === 'ttconfirm') {
      var gg = JSON.parse(cardEl().dataset.groups || '{}');
      var wt = function (l) { return l.map(function (n) { var x = teesOf(tt, n); return n + (x ? ' (' + x + ')' : ''); }).join(', '); };
      if (!confirm('Confirm groups?\n\nEarly (' + gg.early.length + '): ' + wt(gg.early) + '\nLate (' + gg.late.length + '): ' + wt(gg.late) + '\n\nTee times and tees will be locked' + (tt.casual ? '.' : ' and everyone gets the alert.'))) return;
      lastMove = null; setNote('Confirming groups…');
      post({ action: 'teeConfirm', night: tt.night, early: gg.early, late: gg.late }).then(function () {
        tt.confirmed = { early: gg.early, late: gg.late, by: RL.user().name, at: 'just now' };
        var was = !!cedit;
        edit = null; cedit = null; setLocalDraft(tt.night, null); tt.draft = null; setNote(was ? 'Groups saved ✓' : 'Groups confirmed ✓'); load();
      }, function (er) { setNote(er.message || 'Couldn\'t confirm. Try again.', true); });
      return;
    }
    if (ev.target.id === 'ttreopen') {
      if (!confirm('Reopen sign-up? Players can change their picks again until you confirm.')) return;
      post({ action: 'teeReopen', night: tt.night }).then(function () {
        tt.confirmed = null; setNote('Sign-up reopened'); load();
      }, function (er) { setNote(er.message || 'Couldn\'t reopen.', true); });
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'ttfor') { forName = ev.target.value; note = { text: '', err: false }; renderTee(); }
  });

  // Draw the card whenever the Schedule tab redraws.
  var base = window.renderSchedule;
  window.renderSchedule = function () { base(); renderTee(); };
})();
