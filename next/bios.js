/*
 * Commentary bios (Nov 15, 2026; add-only, Ty's rules): News > Bios.
 * Signed-in players pick whose bio (anyone's) and type into one open box. They can't read the bios;
 * the server sorts each submission into the right section(s) and appends it with their name.
 * Server: actions 'bios' (names only) and 'bio' (add), apps-script/bios.gs.
 */
(function () {
  var st = null, loading = false, who = '', draft = '', busy = false, msg = null;
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) {} return null; }
  function el() { return document.getElementById('newsbiobody'); }

  function fetchNames() {
    var a = window.RL && RL.user();
    if (!a) { st = null; draw(); return; }
    if (loading || (st && st.me === a.name && st.players)) { draw(); return; }
    loading = true; draw();
    RL.post({ action: 'bios', token: a.token }).then(function (r) {
      loading = false; st = r;
      if (!who || r.players.indexOf(who) < 0) who = store('bioWho') || '';
      if (r.players.indexOf(who) < 0) who = '';
      draw();
    }, function (er) { loading = false; st = { error: er.message || 'Couldn\'t load the players.' }; draw(); });
  }

  function draw() {
    var box = el();
    if (!box) return;
    var a = window.RL && RL.user();
    if (!a) { box.innerHTML = '<div class="card bio-c"><p class="st-note">Sign in to add to the commentary bios.</p><button type="button" class="en-save bio-wide" data-bio="signin">Sign in</button></div>'; return; }
    if (!st || (loading && !st.players)) { box.innerHTML = '<div class="card bio-c"><p class="st-note">Loading…</p></div>'; return; }
    if (st.error) { box.innerHTML = '<div class="card bio-c"><p class="st-note err">' + e(st.error) + '</p><button type="button" class="en-save bio-wide" data-bio="retry">Try again</button></div>'; return; }
    var max = st.max || 600, self = who && who === st.me;
    var h = '<div class="card bio-c"><div class="bio-t">Feed the commentators</div>' +
      '<p class="st-note">Give the booth some material: a disaster, a nickname, a rivalry, a brag, a bad habit. For anyone, yourself included. ' +
      'It goes straight into their bio with your name on it and gets filed in the right spot. Bios aren\'t shown here, so nobody sees what\'s been said until the commentators say it.</p>' +
      '<div class="bio-k">Whose bio?</div><div class="bio-chips">' + st.players.map(function (n) {
        return '<button type="button" data-who="' + e(n) + '" class="' + (n === who ? 'on' : '') + '">' + e(n) + (n === st.me ? ' <small>you</small>' : '') + '</button>';
      }).join('') + '</div>';
    if (who) {
      h += '<div class="bio-add"><textarea id="biotext" class="msg-in" rows="5" maxlength="' + max + '" placeholder="' +
        e(self ? 'Something about you, or something the commentators should never bring up' : 'What should the booth know about ' + who + '?') + '"' + (busy ? ' disabled' : '') + '>' + e(draft) + '</textarea>' +
        '<div class="msg-count"><span id="biocount">' + draft.length + '</span>/' + max + '</div>' +
        '<p class="st-note bio-tip">Something the commentators should leave alone? Say so ("don\'t bring up…") and it\'s filed privately as off limits.</p>' +
        '<button type="button" class="en-save bio-wide" data-bio="save"' + (busy || !draft.trim() ? ' disabled' : '') + '>' + (busy ? 'Adding…' : 'Add to ' + e(self ? 'my' : who + '\'s') + ' bio') + '</button></div>';
    }
    if (msg) h += '<div class="st-msg bio-msg' + (msg.err ? ' err' : '') + '">' + e(msg.text) + '</div>';
    h += '</div>';
    box.innerHTML = h;
  }

  function save() {
    var a = window.RL && RL.user(), text = draft.trim(), name = who;
    if (!a || !text || busy) return;
    busy = true; msg = null; draw();
    RL.post({ action: 'bio', token: a.token, player: name, text: text }).then(function (r) {
      busy = false; draft = '';
      var secs = (r.sections || []).join(', ');
      msg = { text: 'Added to ' + (name === st.me ? 'your' : name + '\'s') + ' bio' + (secs ? ' under ' + secs : '') + ' ✓', err: false };
      draw();
    }, function (er) {
      busy = false;
      msg = { text: er.message || 'Couldn\'t add that. Try again.', err: true };
      draw();
    });
  }

  document.addEventListener('click', function (ev) {
    var box = el();
    if (!box || !box.contains(ev.target)) return;
    var b = ev.target.closest('button');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-bio');
    if (act === 'signin') { RL.signIn(); return; }
    if (act === 'retry') { st = null; fetchNames(); return; }
    if (act === 'save') { save(); return; }
    if (b.hasAttribute('data-who') && !busy) { who = b.getAttribute('data-who'); store('bioWho', who); msg = null; draw(); var t = document.getElementById('biotext'); if (t) t.focus(); }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.id !== 'biotext') return;
    draft = ev.target.value;
    var c = document.getElementById('biocount'); if (c) c.textContent = draft.length;
    var s = el().querySelector('[data-bio="save"]'); if (s && !busy) s.disabled = !draft.trim();
  });

  // Called by showTab when News > Bios opens; from updateNav (every data refresh) only if the signed-in player changed.
  window.renderBios = function (onlyIfUserChanged) {
    var a = window.RL && RL.user(), changed = (a ? a.name : '') !== (st && st.me ? st.me : '');
    if (onlyIfUserChanged && !changed && (st || !a)) return;
    if (changed) { st = null; who = ''; draft = ''; msg = null; }
    fetchNames();
  };
})();
