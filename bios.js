/*
 * Commentary bios (Nov 15, 2026): News > Bios.
 * Signed-in players read every player's bio and can ADD to any of them (one line at a time).
 * Nothing can be edited or removed from the app; the server only appends ("… (added by Jeff, Nov 15)").
 * Off limits is never shown to anyone. A player can add to their own off limits (write-only).
 * Server: actions 'bios' (read) and 'bio' (add), apps-script/bios.gs.
 */
(function () {
  var st = null, loadedAt = 0, loading = false, who = '', open = '', draft = '', busy = false, msg = null, loreOpen = false;
  var HINT = {
    say: 'e.g. Rhymes with…',
    nick: 'e.g. The Sandman',
    life: 'Job, family, where he\'s from',
    game: 'e.g. Aims 40 yards left and calls it a draw',
    disasters: 'e.g. Four-putted from 3 feet at the Invitational',
    rivals: 'Who he can\'t stand losing to',
    brags: 'What he won\'t stop talking about',
    majors: 'e.g. Winter Classic (2025)',
    offlimits: 'Something the commentators should never bring up'
  };
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) {} return null; }
  function el() { return document.getElementById('newsbiobody'); }

  function fetchBios(force) {
    var a = window.RL && RL.user();
    if (!a) { st = null; draw(); return; }
    if (loading || (!force && st && st.me === a.name && Date.now() - loadedAt < 60000)) { draw(); return; }
    loading = true; draw();
    RL.post({ action: 'bios', token: a.token }).then(function (r) {
      loading = false; st = r; loadedAt = Date.now();
      if (!who || !player(who)) who = store('bioWho') || r.me;
      if (!player(who) && r.players.length) who = r.players[0].name;
      draw();
    }, function (er) { loading = false; st = { error: er.message || 'Couldn\'t load the bios.' }; draw(); });
  }
  function player(n) { return st && st.players ? st.players.filter(function (p) { return p.name === n; })[0] : null; }

  // One cell → lines; "(added by X, Nov 15)" at the end of a line becomes a small tag.
  function lines(txt) {
    var out = String(txt || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!out.length) return '<div class="bio-empty">Nothing yet.</div>';
    return out.map(function (l) {
      var m = l.match(/^(.*?)\s*\(added by ([^,()]+), ([^()]+)\)$/);
      return '<div class="bio-line">' + (m ? e(m[1]) + ' <span class="bio-by">' + e(m[2]) + ' · ' + e(m[3]) + '</span>' : e(l)) + '</div>';
    }).join('');
  }

  function addBox(key) {
    var max = (st && st.max) || 400;
    return '<div class="bio-add">' +
      '<textarea id="biotext" class="msg-in" rows="3" maxlength="' + max + '" placeholder="' + e(HINT[key] || 'Add something') + '">' + e(draft) + '</textarea>' +
      '<div class="msg-count"><span id="biocount">' + draft.length + '</span>/' + max + '</div>' +
      '<div class="msg-btns"><button type="button" class="msg-cancel" data-bio="cancel">Cancel</button>' +
      '<button type="button" class="en-save" data-bio="save"' + (busy || !draft.trim() ? ' disabled' : '') + '>' + (busy ? 'Adding…' : 'Add it') + '</button></div></div>';
  }

  function draw() {
    var box = el();
    if (!box) return;
    var a = window.RL && RL.user(), h = '';
    if (!a) {
      box.innerHTML = '<div class="card bio-c"><p class="st-note">Sign in to read the commentary bios and add to them.</p><button type="button" class="en-save bio-wide" data-bio="signin">Sign in</button></div>';
      return;
    }
    if (!st || (loading && !st.players)) { box.innerHTML = '<div class="card bio-c"><p class="st-note">Loading the bios…</p></div>'; return; }
    if (st.error) { box.innerHTML = '<div class="card bio-c"><p class="st-note err">' + e(st.error) + '</p><button type="button" class="en-save bio-wide" data-bio="retry">Try again</button></div>'; return; }

    h += '<div class="card bio-c bio-intro"><div class="bio-t">Commentary bios</div>' +
      '<p class="st-note">What the commentators know about everyone. Add a disaster, a brag, a rivalry, a nickname, for anyone. ' +
      'You can add, not erase: every addition is kept and shows who added it.</p>' +
      '<div class="bio-chips">' + st.players.map(function (p) {
        return '<button type="button" data-who="' + e(p.name) + '" class="' + (p.name === who ? 'on' : '') + '">' + e(p.name) + (p.name === st.me ? ' <small>you</small>' : '') + '</button>';
      }).join('') + '</div></div>';

    var p = player(who);
    if (p) {
      h += '<div class="card bio-c bio-card"><div class="bio-name">' + e(p.name) + '</div>' + (p.v.full && p.v.full !== p.name ? '<div class="bio-full">' + e(p.v.full) + '</div>' : '');
      st.fields.forEach(function (f) {
        if (f.key === 'full') return;
        h += '<div class="bio-f"><div class="bio-fh"><span class="bio-k">' + e(f.label) + '</span>' +
          (f.add && open !== f.key ? '<button type="button" class="bio-plus" data-add="' + e(f.key) + '">+ Add</button>' : '') + '</div>' +
          lines(p.v[f.key]) + (open === f.key ? addBox(f.key) : '') + '</div>';
      });
      if (msg && msg.who === p.name && !open) h += '<div class="st-msg' + (msg.err ? ' err' : '') + '">' + e(msg.text) + '</div>';
      h += '</div>';
      if (p.name === st.me && st.hasOff) {
        h += '<div class="card bio-c bio-card bio-off"><div class="bio-fh"><span class="bio-k">Off limits (private)</span>' +
          (open !== 'offlimits' ? '<button type="button" class="bio-plus" data-add="offlimits">+ Add</button>' : '') + '</div>' +
          '<p class="st-note">Anything about you the commentators should never bring up. It\'s never shown in the app, to anyone. It goes straight to Ty\'s sheet.</p>' +
          (open === 'offlimits' ? addBox('offlimits') : '') + '</div>';
      }
    }
    if (st.lore && st.lore.length) {
      h += '<div class="card bio-c"><button type="button" class="bio-lorebtn" data-bio="lore" aria-expanded="' + loreOpen + '"><span class="bio-t">League lore</span><span class="gmore">' + (loreOpen ? 'Hide ▴' : 'Show ›') + '</span></button>' +
        (loreOpen ? st.lore.map(function (l) { return '<div class="bio-f"><div class="bio-k">' + e(l.name) + '</div><div class="bio-line">' + e(l.text) + '</div></div>'; }).join('') : '') + '</div>';
    }
    box.innerHTML = h;
    var ta = document.getElementById('biotext');
    if (ta && !busy) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function save() {
    var a = window.RL && RL.user(), text = draft.trim(), key = open, name = who;
    if (!a || !text || busy) return;
    busy = true; msg = null; draw();
    RL.post({ action: 'bio', token: a.token, player: name, field: key, text: text }).then(function (r) {
      busy = false; open = ''; draft = '';
      var p = player(name);
      if (p && key !== 'offlimits') p.v[key] = r.value;
      msg = { who: name, text: key === 'offlimits' ? 'Added to your off limits ✓ The commentators won\'t go there.' : 'Added to ' + name + '\'s bio ✓', err: false };
      draw();
    }, function (er) {
      busy = false;
      msg = { who: name, text: er.message || 'Couldn\'t add that. Try again.', err: true };
      var m = msg; open = key; draw();
      var box = el().querySelector('.bio-add');
      if (box) box.insertAdjacentHTML('beforeend', '<div class="st-msg err">' + e(m.text) + '</div>');
    });
  }

  document.addEventListener('click', function (ev) {
    var box = el();
    if (!box || !box.contains(ev.target)) return;
    var b = ev.target.closest('button');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-bio');
    if (act === 'signin') { RL.signIn(); return; }
    if (act === 'retry') { fetchBios(true); return; }
    if (act === 'lore') { loreOpen = !loreOpen; draw(); return; }
    if (act === 'cancel') { open = ''; draft = ''; draw(); return; }
    if (act === 'save') { save(); return; }
    if (b.hasAttribute('data-who')) {
      if (busy) return;
      who = b.getAttribute('data-who'); store('bioWho', who); open = ''; draft = ''; msg = null; draw(); return;
    }
    if (b.hasAttribute('data-add') && !busy) { open = b.getAttribute('data-add'); draft = ''; msg = null; draw(); }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.id !== 'biotext') return;
    draft = ev.target.value;
    var c = document.getElementById('biocount'); if (c) c.textContent = draft.length;
    var s = el().querySelector('[data-bio="save"]'); if (s && !busy) s.disabled = !draft.trim();
  });

  // Called by showTab when News > Bios opens, and after sign-in / sign-out.
  // onlyIfUserChanged: from updateNav (every data refresh), so typing isn't interrupted.
  window.renderBios = function (onlyIfUserChanged) {
    var a = window.RL && RL.user(), changed = (a ? a.name : '') !== (st && st.me ? st.me : '');
    if (onlyIfUserChanged && !changed && (st || !a)) return;
    if (changed) { st = null; who = ''; open = ''; draft = ''; msg = null; }
    fetchBios(false);
  };
})();
