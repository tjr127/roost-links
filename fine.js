/*
 * Fine print behind a tap (Nov 23, 2026). Long explanatory notes (.paykey, .ps-note) show one line with an ⓘ;
 * tap to read the rest, tap again to close. The Season putting rules card opens and closes from its title.
 * The page redraws these notes on every refresh, so what's open is remembered here and re-applied.
 */
(function () {
  var SEL = '.paykey, .ps-note', MIN = 90, open = {}, rulesOpen = false, queued = false;
  function key(el) { return (el.textContent || '').slice(0, 50); }
  function apply() {
    queued = false;
    document.querySelectorAll(SEL).forEach(function (el) {
      if (el.dataset.fine) return;
      el.dataset.fine = '1';
      // Short notes stay as they are; so do notes that open with a bold name (they're content, e.g. penalty holes).
      if ((el.textContent || '').length < MIN) return;
      if (el.firstChild && el.firstChild.nodeType === 1 && el.firstChild.tagName === 'B') return;
      el.classList.add('fine'); el.setAttribute('role', 'button'); el.tabIndex = 0;
      var on = !!open[key(el)];
      el.classList.toggle('open', on); el.setAttribute('aria-expanded', on);
    });
    var pr = document.getElementById('puttrules'), t = pr && pr.querySelector('.pp-t');
    if (t && !t.dataset.fine) { t.dataset.fine = '1'; t.classList.add('fine-t'); t.setAttribute('role', 'button'); t.tabIndex = 0; }
    if (pr) { pr.classList.toggle('fine-open', rulesOpen); if (t) t.setAttribute('aria-expanded', rulesOpen); }
  }
  function queue() { if (queued) return; queued = true; setTimeout(apply, 0); }
  function toggle(t) {
    var el = t.closest('.fine');
    if (el) {
      if (t.closest('a, button, select')) return false;
      var on = !el.classList.contains('open');
      open[key(el)] = on; el.classList.toggle('open', on); el.classList.toggle('fx-in', on); el.setAttribute('aria-expanded', on);
      return true;
    }
    if (t.closest('.fine-t')) { rulesOpen = !rulesOpen; apply(); return true; }
    return false;
  }
  document.addEventListener('click', function (ev) { if (ev.target.closest) toggle(ev.target); });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest && ev.target.matches('.fine, .fine-t') && toggle(ev.target)) ev.preventDefault();
  });
  var main = document.querySelector('main');
  if (main && window.MutationObserver) new MutationObserver(queue).observe(main, { childList: true, subtree: true });
  apply();
})();
