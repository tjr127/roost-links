/*
 * Notification bell (Nov 27, 2026): a bell in the header just right of the sign-in chip, signed-in players only.
 * - The list is the same alerts and messages the Press tab shows (d.news): the latest night's results plus the last
 *   3 days of announcements, filtered to the ones meant for you. Newest first.
 * - Unread = sent after you last opened the bell or the Press tab (localStorage 'bellSeen:<name>', a timestamp).
 *   A phone that has never opened it counts everything currently in the list.
 * - Badge: coral count, "9+" above 9, hidden at 0. Opening the bell clears the count; the unread ones keep their
 *   amber dot until the panel closes or "Mark all read". Tapping an item opens it on the Press tab.
 * settings.js (chipRoom) places the chip and the Admin button to the left of the bell.
 */
(function () {
  var btn, panel, dim, open = false, fresh = {};
  var BELL = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function me() { var a = window.RL && RL.user(); return a ? a.name : ''; }
  function key() { return 'bellSeen:' + me(); }
  function seen() { try { return Number(localStorage.getItem(key()) || 0); } catch (x) { return 0; } }
  function setSeen(t) { try { localStorage.setItem(key(), String(t)); } catch (x) {} }
  function tsOf(m) { if (m.ts) return Number(m.ts); var t = Date.parse(m.at); return isNaN(t) ? 0 : t; }
  function idOf(m) { return tsOf(m) + '|' + m.title; }

  function items() {
    var n = window.data && window.data.news, who = me();
    if (!n || !who) return [];
    var res = (n.results || []).map(function (m) { return { m: m, tab: 'newsres' }; });
    var ann = (n.announce || []).filter(function (m) { return !m.to || m.to.indexOf(who) >= 0; }).map(function (m) { return { m: m, tab: 'newsann' }; });
    return res.concat(ann).sort(function (a, b) { return tsOf(b.m) - tsOf(a.m); });
  }
  function unread() { var s = seen(); return items().filter(function (x) { return tsOf(x.m) > s; }).length; }

  function ago(t) {
    if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    if (m < 24 * 60) return Math.round(m / 60) + 'h';
    var d = new Date(t);
    if (m < 6 * 24 * 60) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function build() {
    if (btn) return;
    var hdr = document.querySelector('header'); if (!hdr) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'bellbtn'; btn.className = 'bell-btn hide';
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = BELL + '<b class="bell-n" aria-hidden="true"></b>';
    hdr.appendChild(btn);
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); if (open) close(); else show(); });
    dim = document.createElement('div'); dim.className = 'bell-dim hide';
    dim.addEventListener('click', close);
    panel = document.createElement('div');
    panel.className = 'bell-pn hide'; panel.id = 'bellpn';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Notifications');
    panel.addEventListener('click', onPanel);
    document.body.appendChild(dim); document.body.appendChild(panel);
    document.addEventListener('keydown', function (ev) { if (open && ev.key === 'Escape') { close(); btn.focus(); } });
  }

  function badge() {
    if (!btn) return;
    var n = me() ? unread() : 0, b = btn.querySelector('.bell-n');
    b.textContent = n > 9 ? '9+' : String(n);
    btn.classList.toggle('has', n > 0);
    btn.setAttribute('aria-label', 'Notifications' + (n ? ', ' + n + ' unread' : ''));
  }

  function draw() {
    var list = items(), n = 0;
    list.forEach(function (x) { if (fresh[idOf(x.m)]) n++; });
    var rows = list.slice(0, 12).map(function (x) {
      var m = x.m, isNew = !!fresh[idOf(m)];
      var title = m.title && m.title !== 'Roost Golf' ? m.title : (x.tab === 'newsres' ? 'League results' : 'Message from Ty');
      return '<button type="button" class="bell-it' + (isNew ? ' new' : '') + '" data-gotab="' + x.tab + '">' +
        '<i aria-hidden="true"></i><span class="bell-tx"><span class="bell-hd"><b>' + esc(title) +
        (m.to ? ' <em>just for you</em>' : '') + '</b><small>' + esc(ago(tsOf(m))) + '</small></span>' +
        '<span class="bell-bd">' + esc(m.body) + '</span></span>' + (isNew ? '<span class="bn-vh">, new</span>' : '') + '</button>';
    }).join('');
    panel.innerHTML = '<div class="bell-top"><div><b>Notifications</b>' + (n ? '<span>' + n + ' new</span>' : '') + '</div>' +
      (n ? '<button type="button" class="bell-all">Mark all read</button>' : '') + '</div>' +
      (rows || '<div class="bell-empty">Nothing in the last few days. Alerts and messages from Ty show up here.</div>') +
      '<button type="button" class="bell-more" data-gotab="news">See everything in Press Box ›</button>';
  }

  function place() {
    var r = document.querySelector('header').getBoundingClientRect(), br = btn.getBoundingClientRect();
    panel.style.top = Math.max(8, r.bottom + 6) + 'px';
    dim.style.top = Math.max(0, r.bottom) + 'px';
    panel.style.setProperty('--tip', Math.max(16, window.innerWidth - br.right + br.width / 2 - 6 - 10) + 'px');
  }

  function show() {
    build(); if (!me()) return;
    var s = seen(), list = items(); fresh = {};
    list.forEach(function (x) { if (tsOf(x.m) > s) fresh[idOf(x.m)] = 1; });
    markSeen(list);
    draw(); place();
    panel.classList.remove('hide'); dim.classList.remove('hide');
    btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true');
    open = true;
    var f = panel.querySelector('button'); if (f) try { f.focus({ preventScroll: true }); } catch (x) {}
  }
  function close() {
    if (!open) return;
    open = false; fresh = {};
    panel.classList.add('hide'); dim.classList.add('hide');
    btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false');
  }
  function markSeen(list) {
    var top = 0; (list || items()).forEach(function (x) { top = Math.max(top, tsOf(x.m)); });
    if (top > seen()) setSeen(top);
    badge();
  }

  function onPanel(ev) {
    if (ev.target.closest('.bell-all')) { fresh = {}; draw(); return; }
    if (ev.target.closest('[data-gotab]')) close();   // index.html's page-wide data-gotab handler opens the Press tab
  }

  // Called after each data refresh (renderNews), on sign-in / sign-out (updateHeaderChip) and when the Press tab opens.
  window.bellRefresh = function () {
    build(); if (!btn) return;
    var on = !!me();
    var was = btn.classList.contains('hide');
    btn.classList.toggle('hide', !on);
    if (!on) close();
    badge();
    if (open) draw();
    if (was === on && window.updateHeaderChip) updateHeaderChip();   // bell appeared or went away: re-place the chip
  };
  window.bellPressSeen = function () { if (me()) markSeen(); };
  window.addEventListener('resize', function () { if (open) place(); });
})();
