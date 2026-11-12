/*
 * Roost Links app glue. Loaded before the page script.
 * - Talks to the league's Apps Script web app (the same one the GSPro agent uses).
 * - Provides google.script.run so the page code works unchanged off script.google.com.
 * - Sign-in: pick your name, set or enter a 4-digit PIN. Viewing needs no sign-in;
 *   entering scores does (your own scores only, unless you're an admin).
 * - Install prompts (Android) and Add to Home Screen tip (iPhone).
 */
(function () {
  var API_URL = 'https://script.google.com/macros/s/AKfycbxEt_gBNSohywQFft5jS1Cszm7Axd-9D7fzy0UXoY5v7gHxddkL_MslGOpaqpxlUrCF/exec';
  var AUTH_KEY = 'roostAuth', BROWSE_KEY = 'roostBrowse', TIP_KEY = 'roostTipDone';

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function getAuth() { try { return JSON.parse(ls(AUTH_KEY) || 'null'); } catch (e) { return null; } }
  function setAuth(a) { ls(AUTH_KEY, a ? JSON.stringify(a) : null); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function check(j) {
    if (!j || !j.ok) { var e = new Error((j && j.error) || 'Something went wrong'); e.code = j && j.code; throw e; }
    return j;
  }
  function apiGet(what, extra) {
    return fetch(API_URL + '?api=' + what + (extra || '') + '&_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(check);
  }
  // text/plain keeps the request "simple", so the browser doesn't need a CORS preflight that Apps Script can't answer.
  function apiPost(body) {
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(check);
  }

  // ---- google.script.run stand-in (only the two calls the page makes) ----
  var memo = {};
  function runner(ok, fail) {
    function done(f) { return function (x) { if (f) f(x); }; }
    return {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); },
      // Handicap history and schedule are only sent when they change: the phone keeps the last copy
      // and tells the server which versions it has.
      getBoardData: function () {
        var have = Object.keys(memo).map(function (k) { return k + ':' + memo[k].h; }).join(',');
        apiGet('data', have ? '&have=' + encodeURIComponent(have) : '').then(function (j) {
          var d = j.data;
          (d.same || []).forEach(function (k) { if (memo[k]) d[k] = memo[k].v; });
          Object.keys(d._h || {}).forEach(function (k) { if (d[k] !== undefined) memo[k] = { h: d._h[k], v: d[k] }; });
          done(ok)(d);
        }, done(fail));
      },
      saveScore: function (name, hole, gross, putts) {
        var a = getAuth();
        apiPost({ action: 'save', token: a && a.token, name: name, hole: hole, gross: gross, putts: putts })
          .then(function (j) { done(ok)(j.result); }, function (e) {
            if (e.code === 'auth') { setAuth(null); updateWho(); showLogin(); }
            done(fail)(e);
          });
      }
    };
  }
  window.google = { script: { run: runner(null, null) } };

  // ---- What the page asks about the signed-in player ----
  window.RL = {
    user: getAuth,
    post: apiPost,
    canEdit: function (name) { var a = getAuth(); return !!a && (a.admin || a.name === name); },
    // Enter Score follows your own name; admins can pick anyone.
    entryName: function (picked) { var a = getAuth(); return !a ? '' : a.admin ? picked : a.name; },
    entryHint: function (hasCard) {
      var a = getAuth();
      if (!a) return 'Sign in to enter scores';
      if (!a.admin && !hasCard) return a.name + ' isn\'t on tonight\'s card, so there are no holes to enter';
      return 'Pick your name to enter scores';
    },
    signIn: function () { showLogin(); },
    signOut: function () {
      var a = getAuth();
      if (a) apiPost({ action: 'logout', token: a.token }).catch(function () {});
      setAuth(null); updateWho(); pushLogout(); updatePush(); showLogin();
    }
  };

  // ---- Sign-in screen ----
  var ov, box, players = null, step = {};
  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.className = 'rl-ov hide';
    ov.innerHTML = '<div class="rl-box"><img class="rl-logo" src="icons/icon-192.png" alt=""><div class="rl-title">Roost Golf</div><div id="rl-step"></div></div>';
    document.body.appendChild(ov);
    box = ov.querySelector('#rl-step');
  }
  function showLogin() {
    build();
    ov.classList.remove('hide');
    document.body.classList.add('rl-lock');
    pickStep();
  }
  function hideLogin() {
    if (!ov) return;
    ov.classList.add('hide');
    document.body.classList.remove('rl-lock');
  }

  function pickStep() {
    step = {};
    box.innerHTML = '<div class="rl-q">Who are you?</div><div class="rl-msg" id="rl-msg">Loading players…</div><div id="rl-names"></div>' +
      '<button type="button" class="rl-link" id="rl-browse">Just looking — skip for now</button>';
    box.querySelector('#rl-browse').addEventListener('click', function () { ls(BROWSE_KEY, '1'); hideLogin(); updateWho(); });
    apiGet('players').then(function (j) {
      players = j.players;
      var league = players.filter(function (p) { return !p.guest; }), guests = players.filter(function (p) { return p.guest; });
      function grid(list) {
        return '<div class="rl-grid">' + list.map(function (p) {
          return '<button type="button" data-name="' + esc(p.name) + '">' + esc(p.name) + '</button>';
        }).join('') + '</div>';
      }
      box.querySelector('#rl-msg').textContent = '';
      box.querySelector('#rl-names').innerHTML = grid(league) + (guests.length ? '<div class="rl-sub">Guests</div>' + grid(guests) : '');
      box.querySelectorAll('[data-name]').forEach(function (b) {
        b.addEventListener('click', function () { pinStep(b.getAttribute('data-name')); });
      });
    }, function () {
      box.querySelector('#rl-msg').textContent = 'Couldn\'t load the player list. Check your connection and try again.';
      box.querySelector('#rl-names').innerHTML = '<button type="button" class="rl-btn" id="rl-retry">Try again</button>';
      box.querySelector('#rl-retry').addEventListener('click', pickStep);
    });
  }

  function pinStep(name) {
    var p = (players || []).filter(function (x) { return x.name === name; })[0] || { name: name, hasPin: false };
    step = { name: name, mode: p.hasPin ? 'login' : 'new', first: '', pin: '', busy: false };
    drawPin('');
  }
  function drawPin(msg, err) {
    var q = step.mode === 'login' ? 'Enter your PIN' : step.mode === 'new' ? 'Choose a 4-digit PIN' : 'Enter it again';
    var sub = step.mode === 'login' ? '' : step.mode === 'new' ? 'You\'ll only need it again on a new phone.' : '';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    box.innerHTML = '<button type="button" class="rl-link rl-back">‹ Not ' + esc(step.name) + '?</button>' +
      '<div class="rl-q">Hi ' + esc(step.name) + '</div><div class="rl-q2">' + q + '</div>' + (sub ? '<div class="rl-sub2">' + sub + '</div>' : '') +
      '<div class="rl-dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < step.pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="rl-msg' + (err ? ' err' : '') + '">' + esc(msg || '') + '</div>' +
      '<div class="rl-pad">' + keys.map(function (k) {
        return k === '' ? '<span></span>' : '<button type="button" data-k="' + k + '"' + (k === '⌫' ? ' aria-label="Delete"' : '') + '>' + k + '</button>';
      }).join('') + '</div>';
    box.querySelector('.rl-back').addEventListener('click', pickStep);
    box.querySelectorAll('[data-k]').forEach(function (b) {
      b.addEventListener('click', function () { key(b.getAttribute('data-k')); });
    });
  }
  function key(k) {
    if (step.busy) return;
    if (k === '⌫') { step.pin = step.pin.slice(0, -1); drawPin(''); return; }
    if (step.pin.length >= 4) return;
    step.pin += k;
    drawPin('');
    if (step.pin.length === 4) submit();
  }
  function submit() {
    if (step.mode === 'new') { step.first = step.pin; step.pin = ''; step.mode = 'again'; drawPin(''); return; }
    if (step.mode === 'again' && step.pin !== step.first) {
      step.pin = ''; step.first = ''; step.mode = 'new'; drawPin('Those didn\'t match. Choose your PIN again.', true); return;
    }
    step.busy = true;
    drawPin(step.mode === 'login' ? 'Checking…' : 'Saving…');
    apiPost({ action: step.mode === 'login' ? 'login' : 'setup', name: step.name, pin: step.pin }).then(function (j) {
      setAuth({ name: j.name, token: j.token, admin: !!j.admin });
      ls(BROWSE_KEY, null);
      ls('me', j.name);
      hideLogin(); updateWho(); pushLogin(j.name); updatePush();
      if (typeof window.setMe === 'function') window.setMe(j.name);
    }, function (e) {
      step.busy = false; step.pin = '';
      if (e.code === 'taken') { step.mode = 'login'; step.first = ''; }
      if (e.code === 'nopin') { step.mode = 'new'; step.first = ''; }
      if (step.mode === 'again') { step.mode = 'new'; step.first = ''; }
      drawPin(e.message || 'Couldn\'t reach the league sheet. Try again.', true);
    });
  }

  // ---- "Signed in as" line in the footer ----
  function updateWho() {
    var el = document.getElementById('rl-who');
    if (!el) return;
    var a = getAuth();
    el.innerHTML = a ? 'Signed in as <b>' + esc(a.name) + '</b>' + (a.admin ? ' (can edit all scores)' : '') + ' · <button type="button" class="rl-link" id="rl-out">Sign out</button>'
      : 'Viewing only · <button type="button" class="rl-link" id="rl-in">Sign in</button>';
    var b = el.querySelector('button');
    b.addEventListener('click', a ? window.RL.signOut : window.RL.signIn);
    if (typeof window.renderEntry === 'function' && window.data) window.renderEntry();
  }

  // ---- Push notifications (OneSignal) ----
  // Each phone is linked to the player's sheet name, so the league sheet can send alerts by name.
  var ONESIGNAL_APP_ID = '922b7773-264b-4ac8-b72b-0b0b9f108769', PUSH_DISMISS = 'roostPushLater';
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  var OS = null;
  OneSignalDeferred.push(function (OneSignal) {
    return OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerPath: 'roost-links/sw.js', serviceWorkerParam: { scope: '/roost-links/' },
      notifyButton: { enable: false }
    }).then(function () {
      OS = OneSignal;
      var a = getAuth();
      if (a) pushLogin(a.name);
      OneSignal.Notifications.addEventListener('permissionChange', function () { updatePush(); });
      updatePush();
    }).catch(function () { updatePush(); });
  });
  function pushLogin(name) { if (OS && name) OS.login(name).catch(function () {}); }
  function pushLogout() { if (OS) OS.logout().catch(function () {}); }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function pushState() {
    if (!getAuth()) return 'signedout';
    if (isIOS() && !standalone()) return 'install';
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted' && OS && OS.User.PushSubscription.optedIn !== false) return 'on';
    return OS ? 'off' : 'loading';
  }
  function turnOnPush() {
    if (!OS) return;
    OS.Notifications.requestPermission().then(function () {
      var a = getAuth();
      if (a) pushLogin(a.name);
      if (Notification.permission === 'granted') OS.User.PushSubscription.optIn().catch(function () {});
      ls(PUSH_DISMISS, null);
      updatePush();
    });
  }
  function updatePush() {
    var s = pushState();
    // Footer line
    var el = document.getElementById('rl-push');
    if (el) {
      el.innerHTML = s === 'on' ? 'Alerts are on 🔔'
        : s === 'off' ? '<button type="button" class="rl-link" data-push="on">Turn on alerts</button>'
        : s === 'blocked' ? 'Alerts are blocked in your phone\'s settings for this site'
        : s === 'install' ? 'Add the app to your home screen to get alerts'
        : '';
    }
    // Banner at the top of the page (signed in, not on yet, not dismissed)
    var bn = document.getElementById('rl-pushbar');
    var show = (s === 'off' || s === 'install') && !ls(PUSH_DISMISS);
    if (!show) { if (bn) bn.remove(); return; }
    if (!bn) {
      bn = document.createElement('div');
      bn.id = 'rl-pushbar'; bn.className = 'card rl-pushbar';
      var main = document.querySelector('main');
      if (main) main.insertBefore(bn, main.firstChild);
    }
    bn.innerHTML = '<div class="rl-pb-text"><b>🔔 Get league alerts</b><br>' +
      (s === 'install' ? 'Tee-time sign-up, confirmed groups and tee-offs. On iPhone, add the app to your home screen first (Share → Add to Home Screen), then open it from there.'
        : 'Tee-time sign-up, confirmed groups and tee-offs.') + '</div>' +
      (s === 'off' ? '<button type="button" class="rl-btn rl-pb-on" data-push="on">Turn on</button>' : '') +
      '<button type="button" class="rl-x" data-push="later" aria-label="Not now">✕</button>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-push]');
    if (!b) return;
    if (b.getAttribute('data-push') === 'on') turnOnPush();
    else { ls(PUSH_DISMISS, '1'); updatePush(); }
  });

  // ---- Install: Android prompt and iPhone tip ----
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; showTip('android'); });
  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function showTip(kind) {
    if (standalone() || ls(TIP_KEY) || document.getElementById('rl-tip')) return;
    var t = document.createElement('div');
    t.id = 'rl-tip'; t.className = 'rl-tip';
    t.innerHTML = kind === 'ios'
      ? '<div><b>Install Roost Links</b><br>Tap <span class="rl-share" aria-label="Share"></span> Share, then <b>Add to Home Screen</b>.</div><button type="button" class="rl-x" aria-label="Close">✕</button>'
      : '<div><b>Install Roost Links</b><br>Get it on your home screen like an app.</div><button type="button" class="rl-btn rl-inst">Install</button><button type="button" class="rl-x" aria-label="Close">✕</button>';
    document.body.appendChild(t);
    t.querySelector('.rl-x').addEventListener('click', function () { ls(TIP_KEY, '1'); t.remove(); });
    var inst = t.querySelector('.rl-inst');
    if (inst) inst.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; t.remove(); });
    });
  }
  window.addEventListener('appinstalled', function () { var t = document.getElementById('rl-tip'); if (t) t.remove(); });

  document.addEventListener('DOMContentLoaded', function () {
    var footer = document.querySelector('footer');
    if (footer) footer.insertAdjacentHTML('beforeend', '<div id="rl-who" class="rl-who"></div><div id="rl-push" class="rl-who"></div>');
    updateWho(); updatePush();
    if (!getAuth() && !ls(BROWSE_KEY)) showLogin();
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) setTimeout(function () { showTip('ios'); }, 1500);
    if ('serviceWorker' in navigator) {
      // OneSignal registers sw.js (which also holds the offline cache), so the app doesn't register it a second time:
      // two registrations with different addresses kept replacing each other and reloading the page.
      // Fallback: if OneSignal hasn't registered anything after 15 s (blocked or offline), register it ourselves.
      setTimeout(function () {
        navigator.serviceWorker.getRegistration('./').then(function (reg) {
          if (!reg) navigator.serviceWorker.register('sw.js').catch(function () {});
        });
      }, 15000);
      // When a new version takes over, reload once so the phone shows it, but never more than once a minute.
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        var last = Number(sessionStorage.getItem('rlReloadAt') || 0);
        if (!hadController || Date.now() - last < 60000) return;
        sessionStorage.setItem('rlReloadAt', String(Date.now()));
        location.reload();
      });
    }
  });
})();
