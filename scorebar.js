/*
 * Score bar (Nov 25, 2026; Ty picked mockup "C"). For a player whose self-entry switch is on: a bar above the tab bar on
 * every screen while tonight's round is live, showing the hole they owe ("Hole 14 · Par 4 · 4 of 9 in"). Tapping it opens
 * Enter score as a sheet over whatever page is showing. Mainly for Jeff, who plays remotely and types score + putts per hole.
 *   - Shown when: signed in, the self-entry switch is on, the player is on tonight's card, Tonight's date is today (d.live),
 *     and not everyone has finished. Hidden on Admin pages (Admin > Enter scores is right there).
 *   - Own holes all in: the bar turns into "All 9 in · Fix a hole" until everyone has finished, then it goes away.
 * The sheet is the page's own #enter section (same saving, retries and hole card), restyled by `body.sb-open` in theme.css;
 * nothing new is sent to the server. Replaces the Enter score pill that used to sit under Stats.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(s) { var n = parseFloat(s); return isNaN(n) ? null : n; }
  function user() { var a = window.RL && RL.user && RL.user(); return a ? a.name : ''; }
  function fin(c) { return c.holes.length > 0 && c.holes.every(function (h) { return h.g !== ''; }); }
  var PEN = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/></svg>';

  // What the bar should say right now, or null for no bar.
  function state() {
    var d = window.data, y = user();
    if (!d || !y || d.live === false || !(window.canSelfEnter && canSelfEnter())) return null;
    var cards = d.cards || [], c = cards.filter(function (x) { return x.name === y; })[0];
    if (!c || !c.holes.length || cards.every(fin)) return null;
    var played = c.holes.filter(function (h) { return h.g !== ''; }), open = c.holes.filter(function (h) { return h.g === ''; })[0];
    var gross = 0, putts = 0, anyPt = false;
    played.forEach(function (h) { gross += num(h.g) || 0; if (num(h.pt) !== null) { putts += num(h.pt); anyPt = true; } });
    return { name: y, card: c, n: played.length, of: c.holes.length, next: open || null, gross: gross, putts: anyPt ? putts : null };
  }

  var bar = document.createElement('div');
  bar.id = 'sbar'; bar.className = 'sbar hide';
  var tabbar = document.querySelector('nav.tabbar');
  if (tabbar && tabbar.parentNode) tabbar.parentNode.insertBefore(bar, tabbar); else document.body.appendChild(bar);

  // Sheet furniture, added once to the page's Enter score section: a header (whose score, progress, Close) and a
  // previous / next hole row at the top of the stepper card. Both only show while the sheet is open.
  var sec = document.getElementById('enter'), main = document.querySelector('main');
  var scrim = document.createElement('div'); scrim.id = 'sbscrim'; scrim.className = 'sb-scrim';
  var head = document.createElement('div'); head.id = 'sbhead'; head.className = 'sb-head';
  var holeRow = document.createElement('div'); holeRow.id = 'sbhole'; holeRow.className = 'sb-hole';
  if (sec && main) {
    main.appendChild(scrim);
    sec.insertBefore(head, sec.firstChild);
    var pick = sec.querySelector('.picker'); if (pick) pick.insertBefore(holeRow, pick.firstChild);
    sec.setAttribute('aria-label', 'Enter your score');
  }
  var ARW = function (d) { return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'; };

  function isOpen() { return document.body.classList.contains('sb-open'); }
  function close() {
    if (!isOpen()) return;
    document.body.classList.remove('sb-open');
    var sv = document.getElementById('ensave'); if (sv) sv.textContent = 'Save score';
    var b = bar.querySelector('button'); if (b) try { b.focus(); } catch (x) {}
  }
  function open() {
    var s = state(); if (!s || !sec) return;
    if (typeof renderEntry === 'function') renderEntry();
    if (typeof enPlayer !== 'function' || !enPlayer() || enPlayer().name !== s.name) return;   // not this player's card (shouldn't happen)
    if (typeof pickHole === 'function') pickHole(s.next ? s.next.hole : s.card.holes[s.card.holes.length - 1].hole);
    document.body.classList.add('sb-open');
    sec.scrollTop = 0;
    refresh();
    var c = head.querySelector('button'); if (c) try { c.focus(); } catch (x) {}
  }
  function step(dir) {
    var s = state(); if (!s || typeof entry === 'undefined' || typeof pickHole !== 'function') return;
    var hs = s.card.holes.map(function (h) { return h.hole; }), i = hs.indexOf(entry.hole);
    pickHole(hs[(i + dir + hs.length) % hs.length]);
  }

  function refresh() {
    var s = state();
    document.body.classList.toggle('has-sbar', !!s);
    bar.classList.toggle('hide', !s);
    if (!s) { bar.innerHTML = ''; close(); return; }
    var done = !s.next;
    var html = '<button type="button" class="sb-btn' + (done ? ' sb-done' : '') + '" data-sb="open" aria-haspopup="dialog">' +
      '<span class="sb-dot" aria-hidden="true"></span><span class="sb-txt">' +
      (done ? '<b>All ' + s.of + ' in <span class="sb-ok">✓</span></b><i>' + s.gross + (s.putts !== null ? ' · ' + s.putts + ' putts' : '') + '</i>'
        : '<b>Hole ' + e(s.next.hole) + ' <span class="sb-par">· Par ' + e(s.next.par) + '</span></b><i>' + s.n + ' of ' + s.of + ' in' + (s.n ? ' · ' + s.gross + ' so far' : '') + '</i>') +
      '</span><span class="sb-go">' + (done ? 'Fix a hole' : PEN + 'Enter score') + '</span></button>';
    if (bar.innerHTML !== html) bar.innerHTML = html;
    if (!isOpen()) return;
    head.innerHTML = '<div class="sb-grab" aria-hidden="true"></div><div class="sb-hrow"><div><div class="sb-kick">Your score · ' + e(s.name) + '</div>' +
      '<div class="sb-prog' + (done ? ' ok' : '') + '">' + (done ? 'All ' + s.of + ' holes in ✓ · ' + s.gross : s.n + ' of ' + s.of + ' in' + (s.n ? ' · ' + s.gross + ' so far' : '')) + '</div></div>' +
      '<button type="button" class="sb-x" data-sb="close" aria-label="Close">' + ARW('M6 6l12 12M18 6L6 18') + '</button></div>';
    var cur = typeof entry !== 'undefined' ? entry.hole : null;
    holeRow.innerHTML = '<button type="button" data-sb="prev" aria-label="Previous hole">' + ARW('M15 6l-6 6 6 6') + '</button>' +
      '<div class="sb-hn">Hole ' + e(cur == null ? '' : cur) + '</div>' +
      '<button type="button" data-sb="next" aria-label="Next hole">' + ARW('M9 6l6 6-6 6') + '</button>';
    var sv = document.getElementById('ensave');
    if (sv) {
      var others = s.card.holes.filter(function (h) { return h.g === '' && h.hole !== cur; }).length;
      sv.textContent = others ? 'Save and go to the next hole' : 'Save hole ' + (cur == null ? '' : cur);
    }
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-sb]');
    if (b) { var k = b.getAttribute('data-sb'); if (k === 'open') open(); else if (k === 'close') close(); else step(k === 'prev' ? -1 : 1); return; }
    if (ev.target === scrim) close();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && isOpen()) close(); });

  // Redraw whenever the page redraws Enter score (every data refresh, every stepper tap) and on sign-in / sign-out.
  function hook(name) {
    var f = window[name]; if (typeof f !== 'function') return;
    window[name] = function () { var r = f.apply(this, arguments); try { refresh(); } catch (x) { console.error(x); } return r; };
  }
  hook('renderEntry'); hook('updateNav');
  window.scoreBarRefresh = refresh;
  refresh();
})();
