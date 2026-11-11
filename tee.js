/*
 * Tee times card at the top of the Schedule tab.
 * League members pick Early / Late / Either / Can't play for the next league night while sign-up is open
 * (the day before at 8 AM until 3 PM on the night). Ty (admin) can set anyone's pick until he confirms the groups,
 * and confirms the groups here. After that the picks are locked (Ty can reopen).
 * Data: data.teeTimes from getBoardData; saves via the app API (actions tee, teeConfirm, teeReopen).
 */
(function () {
  var LABEL = { Early: 'Early', Late: 'Late', Either: 'Either', Out: 'Can\'t play' };
  var ORDER = ['Early', 'Late', 'Either', 'Out'];
  var pend = {};        // name -> choice saved optimistically
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
  function names(list) { return list.length ? list.map(e).join(', ') : '<span class="tt-none">—</span>'; }
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
      '<div class="tt-g"><b>Early · ' + e(tt.times.Early) + '</b> <span class="tt-n">' + early.length + '</span><div>' + names(early) + '</div></div>' +
      '<div class="tt-g"><b>Late · ' + e(tt.times.Late) + '</b> <span class="tt-n">' + late.length + '</span><div>' + names(late) + '</div></div>' +
      (split.length ? '<div class="tt-warn">Head-to-head split: ' + split.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
      '</div>';
  }

  window.renderTee = function () {
    var el = document.getElementById('teecard');
    if (!el) return;
    var tt = t();
    if (!tt) { el.innerHTML = ''; return; }
    var a = RL.user(), admin = !!(a && a.admin), me = a ? a.name : '';
    var league = tt.players.map(function (p) { return p.name; });
    var conf = tt.confirmed;
    if (edit && edit.night !== tt.night) edit = null;
    if (conf) edit = null;

    var status = conf ? 'Groups set by ' + e(conf.by) + (conf.at ? ' · ' + e(conf.at) : '')
      : tt.state === 'before' ? 'Sign-up opens ' + e(tt.opens)
      : tt.state === 'open' ? 'Pick by ' + e(tt.closes)
      : 'Sign-up closed · waiting for Ty to set the groups';

    var who = admin ? (league.indexOf(forName) >= 0 ? forName : (league.indexOf(me) >= 0 ? me : league[0])) : me;
    var canPick = !!a && !conf && (admin || (tt.state === 'open' && league.indexOf(me) >= 0));
    var html = '<div class="card tt"><div class="tt-head"><div class="tt-title">' + e(tt.label) + ' · Tee times</div>' +
      '<div class="tt-status' + (conf ? ' done' : '') + '">' + status + '</div></div>';

    if (canPick) {
      html += '<div class="tt-pick">' +
        (admin ? '<label class="tt-for">Pick for <select id="ttfor">' + league.map(function (n) {
          return '<option' + (n === who ? ' selected' : '') + '>' + e(n) + '</option>';
        }).join('') + '</select></label>' : '<div class="tt-you">Your pick</div>') +
        '<div class="tt-btns">' + ORDER.map(function (c) {
          return '<button type="button" data-tee="' + c + '" class="' + (choiceOf(tt, who) === c ? 'on ' : '') + (c === 'Out' ? 'out' : '') + '">' +
            LABEL[c] + (tt.times[c] ? '<small>' + e(tt.times[c]) + '</small>' : '') + '</button>';
        }).join('') + '</div></div>';
    } else if (!a && !conf && tt.state === 'open') {
      html += '<div class="tt-pick"><button type="button" class="rl-link tt-signin" id="ttsignin">Sign in to pick your time</button></div>';
    }
    if (note.text) html += '<div class="tt-msg' + (note.err ? ' err' : '') + '">' + e(note.text) + '</div>';

    // Summary by choice
    var by = { Early: [], Late: [], Either: [], Out: [] }, none = [];
    league.forEach(function (n) { var c = choiceOf(tt, n); if (by[c]) by[c].push(n); else none.push(n); });
    html += '<div class="tt-sum">' + ORDER.map(function (c) {
      return '<div class="tt-col ' + c.toLowerCase() + '"><div class="tt-k">' + LABEL[c] + ' <span class="tt-n">' + by[c].length + '</span></div>' +
        '<div class="tt-names">' + (by[c].length ? by[c].map(e).join(', ') : '<span class="tt-none">—</span>') + '</div></div>';
    }).join('') + '</div>' +
      (none.length && !conf ? '<div class="tt-noreply"><b>No reply yet:</b> ' + none.map(e).join(', ') + '</div>' : '');

    // Groups
    if (conf) {
      html += groupBlock(tt, conf.early, conf.late, 'Groups');
      if (admin) html += '<button type="button" class="rl-link tt-small" id="ttreopen">Reopen sign-up</button>';
    } else if (by.Early.length + by.Late.length + by.Either.length) {
      if (admin) {
        var g = edit || { night: tt.night, early: tt.suggested.early.slice(), late: tt.suggested.late.slice() };
        // keep the editor in step with picks that changed since Ty started editing
        var playing = league.filter(function (n) { var c = choiceOf(tt, n); return c === 'Early' || c === 'Late' || c === 'Either'; });
        g.early = g.early.filter(function (n) { return playing.indexOf(n) >= 0; });
        g.late = g.late.filter(function (n) { return playing.indexOf(n) >= 0 && g.early.indexOf(n) < 0; });
        playing.forEach(function (n) { if (g.early.indexOf(n) < 0 && g.late.indexOf(n) < 0) (choiceOf(tt, n) === 'Late' ? g.late : g.early).push(n); });
        if (edit) edit = g;
        var chip = function (n, to) { return '<button type="button" class="tt-chip" data-move="' + e(n) + '" data-to="' + to + '">' + e(n) + (choiceOf(tt, n) === 'Either' ? ' <i>either</i>' : '') + '</button>'; };
        var split = splitPairs(tt, g.early, g.late);
        html += '<div class="tt-groups"><div class="tt-gtitle">' + (edit ? 'Your groups' : 'Suggested groups') + '</div><div class="tt-gsub">Tap a name to move it to the other group.</div>' +
          '<div class="tt-g"><b>Early · ' + e(tt.times.Early) + '</b> <span class="tt-n">' + g.early.length + '</span><div class="tt-chips">' + g.early.map(function (n) { return chip(n, 'late'); }).join('') + '</div></div>' +
          '<div class="tt-g"><b>Late · ' + e(tt.times.Late) + '</b> <span class="tt-n">' + g.late.length + '</span><div class="tt-chips">' + g.late.map(function (n) { return chip(n, 'early'); }).join('') + '</div></div>' +
          (split.length ? '<div class="tt-warn">Head-to-head split: ' + split.map(function (p) { return e(p[0]) + ' & ' + e(p[1]); }).join(', ') + '</div>' : '') +
          '<button type="button" class="en-save tt-confirm" id="ttconfirm">Confirm groups</button>' +
          (edit ? '<button type="button" class="rl-link tt-small" id="ttreset">Back to suggested</button>' : '') +
          '<div class="tt-gsub">Confirming locks everyone\'s pick.</div></div>';
        el.dataset.groups = JSON.stringify(g);
      } else {
        html += groupBlock(tt, tt.suggested.early, tt.suggested.late, 'Suggested groups', 'Ty confirms the final groups.');
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
    if (!tt || !ev.target.closest('#teecard')) return;
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
    var m = ev.target.closest('[data-move]');
    if (m) {
      var g = JSON.parse(document.getElementById('teecard').dataset.groups || '{}');
      var n = m.getAttribute('data-move'), to = m.getAttribute('data-to');
      g.early = g.early.filter(function (x) { return x !== n; });
      g.late = g.late.filter(function (x) { return x !== n; });
      g[to].push(n);
      edit = g;
      renderTee();
      return;
    }
    if (ev.target.id === 'ttreset') { edit = null; renderTee(); return; }
    if (ev.target.id === 'ttsignin') { RL.signIn(); return; }
    if (ev.target.id === 'ttconfirm') {
      var gg = JSON.parse(document.getElementById('teecard').dataset.groups || '{}');
      if (!confirm('Confirm groups?\n\nEarly (' + gg.early.length + '): ' + gg.early.join(', ') + '\nLate (' + gg.late.length + '): ' + gg.late.join(', ') + '\n\nPicks will be locked.')) return;
      setNote('Confirming groups…');
      post({ action: 'teeConfirm', night: tt.night, early: gg.early, late: gg.late }).then(function () {
        tt.confirmed = { early: gg.early, late: gg.late, by: RL.user().name, at: 'just now' };
        edit = null; setNote('Groups confirmed ✓'); load();
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
