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
    cog.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    hdr.appendChild(cog);
    cog.addEventListener('click', open);
    ov = document.createElement('div');
    ov.className = 'st-ov hide';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Settings');
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
  }

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
