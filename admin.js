/*
 * Admin (Nov 25, 2026): the Admin home page, the Admin button in the header (Admin left the bottom tab bar),
 * the back bar on admin pages, and the shared player picker (pkHtml) used by CTP, Garbage, Message and self-entry.
 * The admin pages are still the same sections (adminenter, adminsched, adminmsg, adminctp, adminbbb); the pill row is hidden.
 * Other files hand this page its status lines: teeAdminInfo (tee.js), bbbAdminInfo (bbb.js), ctpInfo (ctp.js).
 */
(function () {
  function e(s) { return esc(s); }
  function isAdmin() { var a = window.RL && RL.user(); return !!(a && a.admin); }
  function ic(d) { return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  var TITLES = { adminenter: 'Enter scores', adminsched: 'Tee times', adminmsg: 'Message', adminctp: 'Closest to the Pin', adminbbb: 'Garbage' };
  var SLIDERS = '<path d="M4 7h10"/><path d="M18 7h2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>';
  var ICON = {
    adminsched: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    adminenter: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
    adminbbb: '<circle cx="9" cy="9" r="5"/><circle cx="15" cy="15" r="5"/>',
    adminctp: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    adminmsg: '<path d="M4 5h16v11H9l-5 4V5z"/>'
  };
  var CHEV = '<svg class="ah-chev" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var cur = '';

  // ---- Shared player picker: optional shortcut buttons, then one chip per player (amber outline + tick = picked). ----
  // o.items: [{ name, tag }], o.on(name) -> picked?, o.attr(name, on) -> the data- attributes for that chip,
  // o.shortcuts: [[label, attributes], ...]. The caller keeps its own click handling.
  window.pkHtml = function (o) {
    var sc = (o.shortcuts || []).filter(Boolean);
    return (sc.length ? '<div class="pk-short" style="grid-template-columns:repeat(' + sc.length + ',minmax(0,1fr))">' +
        sc.map(function (x) { return '<button type="button" ' + x[1] + '>' + e(x[0]) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="pk-grid">' + (o.items || []).map(function (p) {
        var on = !!o.on(p.name);
        return '<button type="button" class="pk-chip' + (on ? ' on' : '') + (p.tag ? ' two' : '') + '" aria-pressed="' + on + '" ' + o.attr(p.name, on) + '>' +
          '<span>' + e(p.name) + '</span>' + (p.tag ? '<small>' + e(p.tag) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
  };
  // Everyone on tonight's card, in card order.
  window.pkTonight = function () { return ((window.data && window.data.cards) || []).map(function (c) { return c.name; }); };

  // ---- What needs Ty right now (the amber dot on the header button and the card on Admin home) ----
  function needs() {
    var out = [], ti = null;
    try { ti = window.teeAdminInfo && teeAdminInfo(); } catch (x) {}
    if (ti && !ti.confirmed && !ti.casual && ti.state !== 'before' && ti.early + ti.late > 0) {
      out.push({ k: 'Groups aren\'t confirmed yet',
        s: 'Early ' + ti.early + ' · Late ' + ti.late + '.' + (ti.state === 'open' && ti.auto ? ' Confirms on its own at ' + ti.auto + '.' : ''),
        btn: 'Review groups', attr: 'data-gotab="adminsched" data-ttview="groups"' });
    }
    return out;
  }

  function statusOf(tab) {
    var d = window.data || {};
    try {
      if (tab === 'adminsched') {
        var ti = window.teeAdminInfo && teeAdminInfo();
        if (!ti) return 'No upcoming league night';
        if (ti.confirmed) return 'Groups confirmed · Early ' + ti.early + ' · Late ' + ti.late;
        if (ti.state === 'before') return 'Sign-up opens ' + ti.opens;
        return ti.inn + ' in · ' + ti.out + ' can\'t play · ' + (ti.none ? ti.none + ' waiting' : 'nobody waiting');
      }
      if (tab === 'adminenter') {
        var en = d.entry, pl = en && en.players ? en.players.filter(function (p) { return !p.admin; }) : [];
        if (!pl.length) return 'Enter or fix anyone\'s score';
        var on = pl.filter(function (p) { return !!en.on[p.name]; }).length;
        return 'Self-entry is ' + (!on ? 'off for everyone' : on === pl.length ? 'on for everyone' : 'on for ' + on + ' of ' + pl.length);
      }
      if (tab === 'adminbbb') {
        var b = window.bbbAdminInfo && bbbAdminInfo();
        return !b ? '' : b.on ? 'On · ' + b.n + ' playing · $' + b.pot + ' pot' : 'Off tonight';
      }
      if (tab === 'adminctp') {
        var c = window.ctpInfo && ctpInfo();
        return c && c.on ? 'Running' + (c.hole ? ' · hole ' + c.hole : '') + (c.pot !== undefined && c.pot !== null ? ' · pot $' + c.pot : '') : 'Not running';
      }
      if (tab === 'adminmsg') return 'Push alert to everyone or a few';
    } catch (x) { console.error(x); }
    return '';
  }

  window.renderAdminHome = function () {
    var el = document.getElementById('adminhomebody'); if (!el) return;
    if (!isAdmin()) { el.innerHTML = ''; return; }
    var d = window.data || {};
    var html = d.title ? '<div class="ah-sub">' + e(d.title) + '</div>' : '';
    needs().forEach(function (n) {
      html += '<div class="ah-need"><div class="ah-k">Needs you</div><b>' + e(n.k) + '</b><div class="ah-s">' + e(n.s) + '</div>' +
        '<button type="button" class="en-save" ' + n.attr + '>' + e(n.btn) + '</button></div>';
    });
    html += '<div class="ah-list">' + [['adminsched', 'Tee times and groups'], ['adminenter', 'Enter scores'], ['adminbbb', 'Garbage'], ['adminctp', 'Closest to the Pin'], ['adminmsg', 'Message']].map(function (r) {
      var s = statusOf(r[0]);
      return '<button type="button" class="ah-row" data-gotab="' + r[0] + '"><span class="ah-ic">' + ic(ICON[r[0]]) + '</span>' +
        '<span class="ah-t"><b>' + e(r[1]) + (r[2] ? ' <i class="pv-badge">' + e(r[2]) + '</i>' : '') + '</b>' + (s ? '<small>' + e(s) + '</small>' : '') + '</span>' + CHEV + '</button>';
    }).join('') + '</div>';
    el.innerHTML = html;
  };

  // ---- Header button: only admins see it; amber outline while in Admin, amber dot when something needs Ty ----
  function headBtn() {
    var hdr = document.querySelector('header'); if (!hdr) return;
    var b = document.getElementById('admbtn');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.id = 'admbtn'; b.className = 'adm-btn hide'; b.setAttribute('data-gotab', 'admin');
      b.innerHTML = ic(SLIDERS) + '<i></i>';
      hdr.appendChild(b);
    }
    var adm = isAdmin(), n = adm ? needs().length : 0;
    b.classList.toggle('hide', !adm);
    b.classList.toggle('on', !!cur);
    b.classList.toggle('dot', n > 0);
    b.setAttribute('aria-label', 'Admin' + (n ? ', ' + n + (n === 1 ? ' thing needs you' : ' things need you') : ''));
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    if (window.updateHeaderChip) updateHeaderChip();   // settings.js places the button beside the chip and keeps room for both
  }

  // Called by showTab on every tab change.
  window.adminShown = function (tab, grp) {
    cur = grp === 'admin' ? tab : '';
    document.body.classList.toggle('adm', !!cur);
    var bar = document.getElementById('admbar'), sub = !!cur && tab !== 'adminhome';
    if (bar) { bar.classList.toggle('hide', !sub); if (sub) document.getElementById('admbart').textContent = TITLES[tab] || 'Admin'; }
    headBtn();
    if (tab === 'adminhome') renderAdminHome();
  };
  // Called after every data refresh and on sign-in / sign-out.
  window.adminRefresh = function () { headBtn(); if (cur === 'adminhome') renderAdminHome(); };
})();
