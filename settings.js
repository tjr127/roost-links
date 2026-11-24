/*
 * Settings (Nov 13, 2026): cog button in the header, for every signed-in player.
 * - Tee time default: Early / Late / Either / Let me decide every week (default). Picked for the player
 *   automatically when sign-up opens each week (skipped on bye weeks); they can still change it that week.
 * - Default tees: Tips / Long / Medium / Short. Starts at their Players-tab tees and changes it there.
 * Server: action 'settings' (apps-script/settings.gs).
 */
(function () {
  var TIMES = [['Early', 'Early'], ['Late', 'Late'], ['Either', 'Either'], ['', 'Let me decide every week']];
  var TEES = ['Tips', 'Long', 'Medium', 'Short'];
  var st = null, msg = { text: '', err: false }, busy = 0, ov;
  function e(s) { return esc(s); }

  function build() {
    if (ov) return;
    var hdr = document.querySelector('header');
    var cog = document.createElement('button');
    cog.type = 'button'; cog.id = 'stbtn'; cog.className = 'st-cog'; cog.setAttribute('aria-label', 'Settings');
    // Nov 23: the header button is the sign-in chip. Signed out: an amber "Sign in" button. Signed in: your initials and name; tap for Settings.
    hdr.appendChild(cog);
    cog.addEventListener('click', function () { if (RL.user()) open(); else RL.signIn(); });
    chipDraw(); setTimeout(chipRoom, 0);
    ov = document.createElement('div');
    ov.className = 'st-ov hide';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Settings');
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
  }

  function chipDraw() {
    var cog = document.getElementById('stbtn'); if (!cog) return;
    var a = RL.user();
    if (!a) { cog.className = 'st-cog st-out'; cog.setAttribute('aria-label', 'Sign in'); cog.textContent = 'Sign in'; return; }
    var t = ((window.data && window.data.shortNames) || {})[a.name] || String(a.name).slice(0, 2).toUpperCase();
    var key = a.name + '|' + t; if (cog.dataset.who === key && cog.classList.contains('st-in')) return;
    cog.dataset.who = key; cog.className = 'st-cog st-in'; cog.setAttribute('aria-label', 'Signed in as ' + a.name + '. Open settings');
    cog.innerHTML = '<span class="pc' + (t.length > 2 ? ' pc3' : '') + '" aria-hidden="true">' + e(t) + '</span><span class="st-nm">' + e(a.name) + '</span>';
  }
  // Leave just enough room on the right of the title for the chip, so the page name under "Roost Golf" gets the rest.
  function chipRoom() { var cog = document.getElementById('stbtn'), br = document.querySelector('header .brand'); if (cog && br && cog.offsetWidth) br.style.paddingRight = (cog.offsetWidth + 22) + 'px'; }
  window.updateHeaderChip = function () { build(); chipDraw(); chipRoom(); };
  function open() {
    build();
    ov.classList.remove('hide');
    document.body.style.overflow = 'hidden';
    msg = { text: '', err: false };
    var a = RL.user();
    if (!a) { st = null; draw(); return; }
    if (!st || st.name !== a.name) st = { name: a.name, loading: true };
    draw();
    RL.post({ action: 'settings', token: a.token }).then(function (r) {
      if (!busy) st = r; draw();
    }, function (er) { st = { name: a.name, error: er.message || 'Couldn\'t load your settings.' }; draw(); });
  }
  function close() { ov.classList.add('hide'); document.body.style.overflow = ''; }

  function timeLbl(v) {
    var t = window.data && window.data.teeTimes && window.data.teeTimes.times;
    return t && t[v] ? '<small>' + e(t[v]) + '</small>' : '';
  }
  function draw() {
    var a = RL.user();
    var html = '<div class="st-box"><div class="st-head"><div class="st-title">Settings</div><button type="button" class="st-x" data-st="close" aria-label="Close">✕</button></div>';
    if (!a) {
      html += '<div class="st-card"><p class="st-note">Sign in to set your tee time and tee defaults.</p><button type="button" class="en-save" data-st="signin">Sign in</button></div>';
    } else if (!st || st.loading) {
      html += '<div class="st-card"><p class="st-note">Loading your settings…</p></div>';
    } else if (st.error) {
      html += '<div class="st-card"><p class="st-note err">' + e(st.error) + '</p></div>';
    } else {
      html += '<div class="st-who">' + e(st.name) + '</div>';
      if (st.league) {
        html += '<div class="st-card"><div class="st-k">Tee time default</div>' +
          '<p class="st-note">Picked for you automatically each week as soon as sign-up opens (Wednesday 8 AM). You can still change it that week. Bye weeks are skipped.</p>' +
          '<div class="st-btns three">' + TIMES.map(function (x) {
            return '<button type="button" data-time="' + x[0] + '" class="' + (st.teeTime === x[0] ? 'on' : '') + (x[0] ? '' : ' wide') + '">' + e(x[1]) + (x[0] ? timeLbl(x[0]) : '') + '</button>';
          }).join('') + '</div></div>';
      }
      html += '<div class="st-card"><div class="st-k">Default tees</div>' +
        '<p class="st-note">The tees you play unless you pick different ones for a night.</p>' +
        '<div class="st-btns">' + (st.teesList || TEES).map(function (t) {
          return '<button type="button" data-stee="' + e(t) + '" class="' + (st.tees === t ? 'on' : '') + '">' + e(t) + '</button>';
        }).join('') + '</div></div>';
    }
    if (a) html += '<div class="st-card st-acct"><p class="st-note">Signed in as <b>' + e(a.name) + '</b>' + (a.admin ? ' (can edit all scores)' : '') + '</p><button type="button" class="st-out-btn" data-st="signout">Sign out</button></div>';
    if (msg.text) html += '<div class="st-msg' + (msg.err ? ' err' : '') + '">' + e(msg.text) + '</div>';
    html += '</div>';
    ov.innerHTML = html;
  }

  function save(body, undo, okText) {
    var a = RL.user();
    if (!a) return;
    body.action = 'settings'; body.token = a.token;
    busy++; msg = { text: 'Saving…', err: false }; draw();
    RL.post(body).then(function (r) {
      busy--;
      st = r;
      msg = { text: okText(r), err: false }; draw();
      if (typeof load === 'function') load();
    }, function (er) {
      busy--; undo();
      msg = { text: er.message || 'Couldn\'t save. Try again.', err: true }; draw();
    });
  }

  function onClick(ev) {
    if (ev.target === ov) { close(); return; }
    var b = ev.target.closest('button');
    if (!b) return;
    var act = b.getAttribute('data-st');
    if (act === 'close') { close(); return; }
    if (act === 'signin') { close(); RL.signIn(); return; }
    if (act === 'signout') { close(); RL.signOut(); return; }
    if (b.hasAttribute('data-time') && st && !st.loading) {
      var v = b.getAttribute('data-time'), was = st.teeTime;
      if (v === was) return;
      st.teeTime = v; draw();
      save({ teeTime: v }, function () { st.teeTime = was; }, function (r) {
        if (!r.teeTime) return 'Saved: you\'ll pick your tee time each week ✓';
        return 'Saved: ' + r.teeTime + ' every week ✓' + (r.applied === 'applied' ? ' Picked for this week too.' : '');
      });
      return;
    }
    if (b.hasAttribute('data-stee') && st && !st.loading) {
      var t = b.getAttribute('data-stee'), wt = st.tees;
      if (t === wt) return;
      st.tees = t; draw();
      save({ tees: t }, function () { st.tees = wt; }, function (r) { return 'Saved: ' + r.tees + ' tees by default ✓'; });
    }
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ov && !ov.classList.contains('hide')) close(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
