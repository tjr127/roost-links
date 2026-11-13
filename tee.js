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
  var pend = {};        // name -> choice saved optimistically
  var tpend = {};       // name -> tees saved optimistically
  var forName = '';     // admin: whose pick the buttons set
  var edit = null;      // admin: { night, early: [], late: [] } once Ty moves someone
  var note = { text: '', err: false };

  function t() { return window.data && window.data.teeTimes; }
  function e(s) { return esc(s); }
  function choiceOf(tt, n) {
    if (Object.prototype.hasOwnProperty.call(pend, n)) return pend[n];
    var p = tt.players.filter(function (x) { return x.name === n; })[0];
    return p ? p.choice : '';
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
    if (Object.prototype.hasOwnProperty.call(tpend, n)) return tpend[n];
    var T = tt.tees, p = T && T.players && T.players[n];
    return p ? (p.pick || p.def || '') : '';
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
          '<span class="tt-tn">' + (x.color ? '<i class="tp-dot" style="background:' + e(x.color.toLowerCase()) + '"></i>' : '') + e(x.tee) + '</span>' +
          '<small>' + (x.yards ? Number(x.yards).toLocaleString('en-US') + ' yds' : e(x.color)) + (ch !== '' && ch !== undefined ? ' · CH ' + (ch < 0 ? '+' + (-ch) : ch) : '') + '</small></button>';
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

  // Nov 13: the Schedule tab shows everyone (Ty included) the player view; Ty's admin controls live in Admin > Schedule.
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
    var league = tt.players.map(function (p) { return p.name; });
    var sched = scheduled(tt);
    var conf = tt.confirmed;
    if (edit && edit.night !== tt.night) edit = null;
    if (conf) edit = null;

    var status = conf ? 'Groups set by ' + e(conf.by) + (conf.at ? ' · ' + e(conf.at) : '')
      : tt.state === 'before' ? 'Sign-up opens ' + e(tt.opens)
      : tt.state === 'open' ? 'Pick by ' + e(tt.closes)
      : 'Sign-up closed · groups being set';

    var who = admin ? (league.indexOf(forName) >= 0 ? forName : (league.indexOf(me) >= 0 ? me : league[0])) : me;
    var canPick = !!a && !conf && (admin || (tt.state === 'open' && league.indexOf(me) >= 0));
    var html = '<div class="card tt"><div class="tt-head"><div class="tt-title">' + e(tt.label) + ' · Tee times</div>' +
      '<div class="tt-status' + (conf ? ' done' : '') + '">' + status + '</div></div>';

    if (canPick) {
      html += '<div class="tt-pick">' +
        (admin ? '<label class="tt-for">Pick for <select id="ttfor">' + league.map(function (n) {
          return '<option value="' + e(n) + '"' + (n === who ? ' selected' : '') + '>' + e(n) + (sched[n] ? '' : ' (bye)') + '</option>';
        }).join('') + '</select></label>' : '<div class="tt-you">Your pick</div>') +
        '<div class="tt-btns">' + ORDER.map(function (c) {
          return '<button type="button" data-tee="' + c + '" class="' + (choiceOf(tt, who) === c ? 'on ' : '') + (c === 'Out' ? 'out' : '') + '">' +
            LABEL[c] + (tt.times[c] ? '<small>' + e(tt.times[c]) + '</small>' : '') + '</button>';
        }).join('') + '</div>' +
        (!sched[who] ? '<div class="tt-byenote">' + (who === me ? 'You have' : e(who) + ' has') + ' a bye this week. Pick a time only if ' + (who === me ? 'you\'re' : e(who) + ' is') + ' coming to play.</div>' : '') +
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
      if (by[c]) by[c].push(n); else if (sched[n]) none.push(n);
      if (!sched[n]) byes.push(n + (c ? ' (' + LABEL[c].toLowerCase() + ')' : ''));
    });
    html += '<div class="tt-sum">' + ORDER.map(function (c) {
      return '<div class="tt-col ' + c.toLowerCase() + '"><div class="tt-k">' + LABEL[c] + ' <span class="tt-n">' + by[c].length + '</span></div>' +
        '<div class="tt-names">' + (by[c].length ? by[c].map(e).join(', ') : '<span class="tt-none">—</span>') + '</div></div>';
    }).join('') + '</div>' +
      (none.length && !conf ? '<div class="tt-noreply"><b>No reply yet:</b> ' + none.map(e).join(', ') + '</div>' : '') +
      (byes.length ? '<div class="tt-noreply"><b>Bye this week:</b> ' + byes.map(e).join(', ') + '</div>' : '');

    // Groups
    if (conf) {
      html += groupBlock(tt, conf.early, conf.late, 'Groups');
      if (admin) html += '<button type="button" class="rl-link tt-small" id="ttreopen">Reopen sign-up</button>';
    } else if (by.Early.length + by.Late.length + by.Either.length) {
      if (admin) {
        var sd = edit || savedDraft(tt);
        var g = normalize(tt, sd || tt.suggested);
        if (sd) edit = g;
        var chip = function (n, to) { return '<button type="button" class="tt-chip" data-move="' + e(n) + '" data-to="' + to + '">' + e(n) + teeTag(tt, n) + (choiceOf(tt, n) === 'Either' ? ' <i>either</i>' : '') + '</button>'; };
        var split = splitPairs(tt, g.early, g.late);
        html += '<div class="tt-groups"><div class="tt-gtitle">' + (edit ? 'Your groups' : 'Suggested groups') + '</div><div class="tt-gsub">Tap a name to move it to the other group.</div>' +
          '<div class="tt-g"><b>Early · ' + e(tt.times.Early) + '</b> <span class="tt-n">' + g.early.length + '</span><div class="tt-chips">' + g.early.map(function (n) { return chip(n, 'late'); }).join('') + '</div></div>' +
          '<div class="tt-g"><b>Late · ' + e(tt.times.Late) + '</b> <span class="tt-n">' + g.late.length + '</span><div class="tt-chips">' + g.late.map(function (n) { return chip(n, 'early'); }).join('') + '</div></div>' +
          (split.length ? '<div class="tt-warn">Head-to-head split: ' + split.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
          '<button type="button" class="en-save tt-confirm" id="ttconfirm">Confirm groups</button>' +
          (edit ? '<button type="button" class="rl-link tt-small" id="ttreset">Back to suggested</button>' : '') +
          '<div class="tt-gsub">Confirming locks everyone\'s tee time and tees and sends the groups alert. If you don\'t, this is confirmed for you at ' + e(tt.closes.replace(/^.* at /, '')) + '.</div></div>';
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
  function setNote(text, err) { note = { text: text, err: !!err }; renderTee(); }

  document.addEventListener('click', function (ev) {
    var tt = t();
    if (!tt || !ev.target.closest('#teecard, #adminteecard')) return;
    var b = ev.target.closest('[data-tee]');
    if (b) {
      var a = RL.user();
      var sel = document.getElementById('ttfor');
      var who = a && a.admin && sel ? sel.value : a && a.name;
      var c = b.getAttribute('data-tee');
      pend[who] = c;
      setNote('Saving ' + who + ': ' + LABEL[c] + '…');
      post({ action: 'tee', name: who, choice: c }).then(function () {
        tt.players.forEach(function (p) { if (p.name === who) p.choice = c; });
        delete pend[who];
        setNote('Saved ' + who + ': ' + LABEL[c] + ' ✓');
        load();
      }, function (er) {
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
      var tv = tb.getAttribute('data-ttee');
      tpend[w] = tv;
      setNote('Saving ' + w + ': ' + tv + ' tees…');
      post({ action: 'tee', name: w, tees: tv }).then(function () {
        var P = tt.tees && tt.tees.players && tt.tees.players[w];
        if (P) P.pick = tv;
        delete tpend[w];
        setNote('Saved ' + w + ': ' + tv + ' tees ✓');
        load();
      }, function (er) {
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
      g.early = g.early.filter(function (x) { return x !== n; });
      g.late = g.late.filter(function (x) { return x !== n; });
      g[to].push(n);
      edit = g;
      saveDraft(tt, g);
      renderTee();
      return;
    }
    if (ev.target.id === 'ttreset') { edit = null; saveDraft(tt, null); renderTee(); return; }
    if (ev.target.id === 'ttsignin') { RL.signIn(); return; }
    if (ev.target.id === 'ttconfirm') {
      var gg = JSON.parse(cardEl().dataset.groups || '{}');
      var wt = function (l) { return l.map(function (n) { var x = teesOf(tt, n); return n + (x ? ' (' + x + ')' : ''); }).join(', '); };
      if (!confirm('Confirm groups?\n\nEarly (' + gg.early.length + '): ' + wt(gg.early) + '\nLate (' + gg.late.length + '): ' + wt(gg.late) + '\n\nTee times and tees will be locked and everyone gets the alert.')) return;
      setNote('Confirming groups…');
      post({ action: 'teeConfirm', night: tt.night, early: gg.early, late: gg.late }).then(function () {
        tt.confirmed = { early: gg.early, late: gg.late, by: RL.user().name, at: 'just now' };
        edit = null; setLocalDraft(tt.night, null); tt.draft = null; setNote('Groups confirmed ✓'); load();
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
