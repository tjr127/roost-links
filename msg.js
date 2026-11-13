/*
 * Admin > Message (Nov 13, 2026): Ty sends a custom push alert to the whole league or to players he picks.
 * Also saved on the News tab (Announcements): "Everyone" shows to all, a picked list only to those players.
 * Server: action 'message' (apps-script/message.gs). Players list comes from data.entry.players.
 */
(function () {
  var MAXT = 60, MAXB = 500;
  var st = { title: '', body: '', mode: 'all', pick: {}, confirm: false, busy: false, msg: '', err: false };
  var drawnFor = '';

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
      '<div class="esw-top"><b>Send a message</b><div class="esw-sub">Goes out as a push alert to everyone who has alerts on, and shows on the News tab for the people you send it to.</div></div>' +
      '<label class="msg-k" for="msgt">Heading <span>optional</span></label>' +
      '<input id="msgt" class="msg-in" maxlength="' + MAXT + '" placeholder="Roost Golf" value="' + e(st.title) + '">' +
      '<label class="msg-k" for="msgb">Message</label>' +
      '<textarea id="msgb" class="msg-in" rows="4" maxlength="' + MAXB + '" placeholder="e.g. Pizza is on me tonight. Bring your A game.">' + e(st.body) + '</textarea>' +
      '<div class="msg-count" id="msgcount">' + st.body.length + ' / ' + MAXB + '</div>' +
      '<div class="msg-k">Send to</div>' +
      '<div class="esw-all"><button type="button" class="tog' + (st.mode === 'all' ? ' on' : '') + '" data-msg="mode" data-v="all">Everyone</button>' +
      '<button type="button" class="tog' + (st.mode === 'pick' ? ' on' : '') + '" data-msg="mode" data-v="pick">Pick players</button></div>';
    if (st.mode === 'pick') {
      html += '<div class="msg-quick"><button type="button" data-msg="pickall">Select all</button><button type="button" data-msg="picknone">Clear</button></div>' +
        pl.map(function (p) {
          var on = !!st.pick[p.name];
          return '<div class="esw-row"><span>' + e(p.name) + (p.admin ? ' <i>you</i>' : '') + (p.guest ? ' <i>guest</i>' : '') + '</span>' +
            '<button type="button" class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="Send to ' + e(p.name) + '" data-msg="pick" data-v="' + e(p.name) + '"><i></i></button></div>';
        }).join('');
    }
    if (st.confirm) {
      html += '<div class="msg-confirm">Send this to ' + e(who) + '?<div class="msg-btns">' +
        '<button type="button" class="en-save" data-msg="send"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Sending…' : 'Send now') + '</button>' +
        '<button type="button" class="msg-cancel" data-msg="cancel"' + (st.busy ? ' disabled' : '') + '>Cancel</button></div></div>';
    } else {
      var ready = st.body.trim() && n;
      html += '<button type="button" class="en-save msg-go" data-msg="ask"' + (ready ? '' : ' disabled') + '>' +
        (n ? 'Send to ' + e(who) : 'Pick at least one player') + '</button>';
    }
    html += '<div class="esw-msg' + (st.err ? ' err' : '') + '" id="msgmsg">' + e(st.msg) + '</div></div>';
    box.innerHTML = html;
  }

  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'msgt') st.title = ev.target.value;
    else if (ev.target.id === 'msgb') {
      st.body = ev.target.value;
      var c = document.getElementById('msgcount'); if (c) c.textContent = st.body.length + ' / ' + MAXB;
      var go = document.querySelector('[data-msg="ask"]');
      if (go) go.disabled = !(st.body.trim() && targets().length);
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
        var miss = r.missing || [];
        st.msg = 'Sent to ' + r.sent + ' phone' + (r.sent === 1 ? '' : 's') + ' ✓' +
          (miss.length ? '. Alerts are off for ' + miss.join(', ') + ' (they can read it on the News tab).' : '');
        st.err = false; st.body = ''; st.title = ''; st.confirm = false;
      }, function (er) {
        st.msg = (er && er.message) || 'Couldn\'t send. Try again.'; st.err = true; st.confirm = false;
      })
      .then(function () { st.busy = false; draw(); });
  }

  // Called by index.html when the Message pill opens and after each data refresh (redraws only if the player list changed,
  // so a refresh never wipes what Ty is typing).
  window.renderMsg = function (force) {
    var names = players().map(function (p) { return p.name; }).join('|');
    if (force || names !== drawnFor || !el().innerHTML) draw();
  };
})();
