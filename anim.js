/*
 * Small animations (Nov 23, 2026; Ty picked all eight). The page redraws by replacing HTML, so this file watches <main>
 * and compares what's on screen with what it saw last time. Nothing here changes data. All of it is skipped when the
 * phone is set to reduce motion, and nothing plays in the first seconds after the app opens.
 *   data-fx="key"                 text changed            -> score flash (1)
 *   tr[data-fxrow="player"]       row moved               -> slide to the new place (2)
 *   data-fxstate="fin|player"     0 -> 1                  -> chip pulse (3)
 *   data-fxstate="done|A|B"       0 -> 1                  -> winner's score pops, result line fades in (4)
 *   data-fxstate="pot|night"      open -> win / tie       -> confetti / shake on the Putting Challenge card (5)
 *   data-fxnum="key" data-v="n"   number changed          -> count up (8)
 * The live dot (6) and the easing on open/close (7) are plain CSS (theme.css).
 */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = {}, state = {}, nums = {}, tops = {}, queued = false, ready = false;
  setTimeout(function () { ready = true; }, 5000);
  function once(el, cls, ms) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(function () { el.classList.remove(cls); }, ms || 900); }
  function visible(el) { return !!(el && el.offsetParent !== null); }

  function confetti(box) {
    if (!box || box.querySelector('.fx-conf')) return;
    var wrap = document.createElement('div'); wrap.className = 'fx-conf'; wrap.setAttribute('aria-hidden', 'true');
    var cols = ['#8FD19E', '#F5B13C', '#EDEFEA', '#F7C948', '#C9D1CC'], html = '';
    for (var i = 0; i < 28; i++) {
      var x = Math.round((Math.random() - 0.5) * 260), y = Math.round(-40 - Math.random() * 90), r = Math.round((Math.random() - 0.5) * 720);
      html += '<i style="--x:' + x + 'px;--y:' + y + 'px;--r:' + r + 'deg;background:' + cols[i % cols.length] + ';animation-delay:' + (Math.random() * 0.15).toFixed(2) + 's"></i>';
    }
    wrap.innerHTML = html; box.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 1900);
  }
  function countUp(el, from, to) {
    var t0 = null, dur = 700;
    function step(ts) {
      if (!el.isConnected) return;
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = v;
      if (p < 1) requestAnimationFrame(step); else el.textContent = to;
    }
    requestAnimationFrame(step);
  }

  function pass() {
    queued = false;
    var play = ready && !reduce;
    // (1) score flash
    document.querySelectorAll('[data-fx]').forEach(function (el) {
      var k = el.getAttribute('data-fx'), v = el.textContent;
      if (play && seen[k] !== undefined && seen[k] !== v && v !== '' && v !== '–' && visible(el)) once(el, 'fx-flash', 1200);
      seen[k] = v;
    });
    // (3) (4) (5) state changes
    document.querySelectorAll('[data-fxstate]').forEach(function (el) {
      var k = el.getAttribute('data-fxstate'), v = el.getAttribute('data-v') || '', was = state[k];
      state[k] = v;
      if (!play || was === undefined || was === v || !visible(el)) return;
      var kind = k.split('|')[0];
      if ((kind === 'fin' || kind === 'fin2') && v === '1') { once(el, 'fx-pop', 700); var nm = el.closest('.name'); once(nm && nm.querySelector('.pc'), 'fx-pulse', 1300); }
      else if (kind === 'done' && v === '1') { once(el.querySelector('.pts.lead'), 'fx-pop', 800); once(el.querySelector('.mstory'), 'fx-in', 600); once(el, 'fx-glow', 1400); }
      else if (kind === 'pot' && was === 'open' && v === 'win') confetti(el);
      else if (kind === 'pot' && was === 'open' && v === 'tie') once(el, 'fx-shake', 700);
    });
    // (8) count up
    document.querySelectorAll('[data-fxnum]').forEach(function (el) {
      var k = el.getAttribute('data-fxnum'), v = parseFloat(el.getAttribute('data-v')), was = nums[k];
      nums[k] = v;
      if (play && was !== undefined && !isNaN(v) && !isNaN(was) && was !== v && visible(el)) countUp(el, was, v);
    });
    // (2) rows slide to their new place (Individual board)
    var now = {};
    document.querySelectorAll('tr[data-fxrow]').forEach(function (tr) {
      if (!visible(tr)) return;
      var k = tr.getAttribute('data-fxrow'), y = tr.offsetTop; now[k] = y;
      var d = tops[k] === undefined ? 0 : tops[k] - y;
      if (play && d && tr.animate) Array.prototype.forEach.call(tr.cells, function (td) {
        td.animate([{ transform: 'translateY(' + d + 'px)' }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    });
    if (Object.keys(now).length) tops = now;
  }
  function queue() { if (queued) return; queued = true; setTimeout(pass, 0); }
  var main = document.querySelector('main');
  if (main && window.MutationObserver) new MutationObserver(queue).observe(main, { childList: true, subtree: true });
  pass();
  window.fxTest = { confetti: confetti, pass: pass, ready: function () { ready = true; } };   // for checking from the browser console
})();
