/*
 * Admin > Message (Nov 13, 2026): Ty sends a custom push alert to the whole league or to players he picks.
 * Also saved on the Press tab (Announcements): "Everyone" shows to all, a picked list only to those players.
 * Server: action 'message' (apps-script/message.gs). Players list comes from data.entry.players.
 */
(function () {
  var MAXT = 60, MAXB = 500;
  var st = { title: '', body: '', mode: 'all', pick: {}, confirm: false, busy: false, msg: '', err: false };
  var drawnFor = '';
  // Nov 25: quick starts fill the message box (Ty can edit before sending).
  var TPL = [['Sign-up open', 'Sign-up is open for this week. Pick Early, Late or Either in the app.'],
    ['Groups set', 'Groups are set. Check your tee time in the app.'],
    ['Running late', 'Running behind tonight. Late group, plan on a later start.'],
    ['Cancelled', 'No golf this week. See you next time.']];
  function tonight() { var all = players().map(function (p) { return p.name; }); return ((window.data && window.data.cards) || []).map(function (c) { return c.name; }).filter(function (nm) { return all.indexOf(nm) >= 0; }); }

  function e(s) { return esc(s); }
  function players() { var en = window.data && window.data.entry; return (en && en.players) || []; }
  function league() { return players().filter(function (p) { return !p.guest; }); }
  function targets() {
    return st.mode === 'all' ? league().map(function (p) { return p.name; })
      : players().filter(function (p) { return st.pick[p.name]; }).map(function (p) { return p.name; });
  }
  function el() { return document.getElementById('msgbody'); }

  function draw() {
    var box = el(); if (!box) return;
    var a = window.RL && RL.user();
    if (!a || !a.admin) { box.innerHTML = ''; return; }
    var pl = players();
    drawnFor = pl.map(function (p) { return p.name; }).join('|');
    if (!pl.length) { box.innerHTML = '<div class="card esw"><div class="empty">Loading players…</div></div>'; return; }
    var to = targets(), n = to.length;
    var who = st.mode === 'all' ? 'all ' + n + ' league members' : n === 1 ? to[0] : n + ' players';
    var html = '<div class="card esw msg">' +
      '<div class="esw-top"><div class="esw-sub">Goes out as a push alert to everyone who has alerts on, and shows on the Press tab for the people you send it to.</div></div>' +
      '<div class="msg-k">Quick starts</div><div class="msg-tpl">' + TPL.map(function (x, i) { return '<button type="button" data-msg="tpl" data-v="' + i + '">' + e(x[0]) + '</button>'; }).join('') + '</div>' +
      '<label class="msg-k" for="msgt">Heading <span>optional</span></label>' +
      '<input id="msgt" class="msg-in" maxlength="' + MAXT + '" placeholder="Roost Golf" value="' + e(st.title) + '">' +
      '<label class="msg-k" for="msgb">Message</label>' +
      '<textarea id="msgb" class="msg-in" rows="4" maxlength="' + MAXB + '" placeholder="e.g. Pizza is on me tonight. Bring your A game.">' + e(st.body) + '</textarea>' +
      '<div class="msg-count" id="msgcount">' + st.body.length + ' / ' + MAXB + '</div>' +
      '<div class="msg-k">Send to</div>' +
      '<div class="esw-all"><button type="button" class="tog' + (st.mode === 'all' ? ' on' : '') + '" data-msg="mode" data-v="all">Everyone</button>' +
      '<button type="button" class="tog' + (st.mode === 'pick' ? ' on' : '') + '" data-msg="mode" data-v="pick">Pick players</button></div>';
    if (st.mode === 'pick' && window.pkHtml) {
      var tn = tonight();
      html += pkHtml({
        shortcuts: [tn.length ? ['Tonight\'s ' + tn.length, 'data-msg="picktonight"'] : null, ['All', 'data-msg="pickall"'], ['None', 'data-msg="picknone"']],
        items: pl.map(function (p) { return { name: p.name, tag: p.admin ? 'you' : p.guest ? 'guest' : '' }; }),
        on: function (nm) { return !!st.pick[nm]; },
        attr: function (nm) { return 'data-msg="pick" data-v="' + e(nm) + '" aria-label="Send to ' + e(nm) + '"'; }
      });
    }
    if (st.confirm) {
      html += '<div class="msg-confirm">Send this to ' + e(who) + '?<div class="msg-btns">' +
        '<button type="button" class="en-save" data-msg="send"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Sending…' : 'Send now') + '</button>' +
        '<button type="button" class="msg-cancel" data-msg="cancel"' + (st.busy ? ' disabled' : '') + '>Cancel</button></div></div>';
    } else {
      var ready = st.body.trim() && n;
      html += '<button type="button" class="en-save msg-go" data-msg="ask"' + (ready ? '' : ' disabled') + '>' +
        (n ? 'Send to ' + e(who) : 'Send') + '</button>' +
        '<div class="pin-hint" id="msghint">' + (!n ? 'Pick at least one player.' : st.body.trim() ? 'You\'ll get one "Send this?" check first.' : 'Write a message first, or tap a quick start.') + '</div>';
    }
    html += '<div class="esw-msg' + (st.err ? ' err' : '') + '" id="msgmsg">' + e(st.msg) + '</div></div>' +
      '<button type="button" class="card pk-line tap" data-gotab="newsann"><b>Sent messages</b><small>They\'re on the Press tab, under Announcements</small></button>';
    box.innerHTML = html;
  }

  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'msgt') st.title = ev.target.value;
    else if (ev.target.id === 'msgb') {
      st.body = ev.target.value;
      var c = document.getElementById('msgcount'); if (c) c.textContent = st.body.length + ' / ' + MAXB;
      var go = document.querySelector('[data-msg="ask"]');
      if (go) go.disabled = !(st.body.trim() && targets().length);
      var hn = document.getElementById('msghint'); if (hn && targets().length) hn.textContent = st.body.trim() ? 'You\'ll get one "Send this?" check first.' : 'Write a message first, or tap a quick start.';
    } else return;
    if (st.msg && !st.busy) { st.msg = ''; var m = document.getElementById('msgmsg'); if (m) m.textContent = ''; }
  });

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-msg]');
    if (!b || b.disabled) return;
    var k = b.getAttribute('data-msg'), v = b.getAttribute('data-v');
    if (k === 'mode') { st.mode = v; st.confirm = false; }
    else if (k === 'pick') { st.pick[v] = !st.pick[v]; st.confirm = false; }
    else if (k === 'pickall') { players().forEach(function (p) { st.pick[p.name] = true; }); st.confirm = false; }
    else if (k === 'picknone') { st.pick = {}; st.confirm = false; }
    else if (k === 'picktonight') { st.pick = {}; tonight().forEach(function (nm) { st.pick[nm] = true; }); st.confirm = false; }
    else if (k === 'tpl') { st.body = (TPL[Number(v)] || ['', ''])[1]; st.confirm = false; st.msg = ''; st.err = false; }
    else if (k === 'ask') { st.confirm = true; st.msg = ''; st.err = false; }
    else if (k === 'cancel') { st.confirm = false; }
    else if (k === 'send') return send();
    draw();
  });

  function send() {
    var a = RL.user(); if (!a || !a.admin || st.busy) return;
    st.busy = true; draw();
    RL.post({ action: 'message', token: a.token, title: st.title.trim(), body: st.body.trim(), to: st.mode === 'all' ? '*' : targets() })
      .then(function (r) {
        var miss = (r.missing || []).filter(function (n, i, a) { return a.indexOf(n) === i; });
        var to = r.to || [], got = Math.max(0, to.length - miss.length);
        st.msg = !got ? 'Nobody you picked has alerts on, so no push went out. It\'s on the Press tab for them.'
          : 'Sent ✓ ' + (got === to.length ? (got === 1 ? to[0] + ' got it.' : (got === 2 ? 'Both players got it.' : 'All ' + got + ' players got it.')) : got + ' of ' + to.length + ' players got it.') +
            (miss.length ? ' Alerts are off for ' + miss.join(', ') + ', so they\'ll only see it on the Press tab.' : '');
        st.err = false; st.body = ''; st.title = ''; st.confirm = false;
      }, function (er) {
        st.msg = (er && er.message) || 'Couldn\'t send. Try again.'; st.err = true; st.confirm = false;
      })
      .then(function () { st.busy = false; draw(); });
  }

  // Called by index.html when the Message pill opens and after each data refresh (redraws only if the player list changed,
  // so a refresh never wipes what Ty is typing).
  // Tee times > Nudge (tee.js): opens Message already addressed to the players who haven't answered.
  window.msgPrefill = function (names, body) {
    st.mode = 'pick'; st.pick = {}; (names || []).forEach(function (nm) { st.pick[nm] = true; });
    if (body && !st.body.trim()) st.body = body;
    st.confirm = false; st.msg = ''; st.err = false; draw();
  };
  window.renderMsg = function (force) {
    var names = players().map(function (p) { return p.name; }).join('|');
    if (force || names !== drawnFor || !el().innerHTML) draw();
  };
})();
