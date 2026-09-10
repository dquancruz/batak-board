// Batak Board — Fase 7: micro-interacciones (toast).
//
// Hover and press live entirely in style.css as plain CSS transitions --
// the browser already knows when the pointer is over/down, no JS needed.
// This file is just the one piece that does need JS: a shared toast slot
// (200ms in, 3s visible, 200ms out), called from app.js for things like a
// reconnection or the "modo simple" toggle. Only one shows at a time --
// a new toast replaces whatever's currently showing rather than queuing.
//
// Safe to delete (and its <script> tag + call sites in app.js) without
// touching gameplay -- purely cosmetic, never sends anything over the
// WebSocket.
(function () {
  const SCOPE = "toast";
  let hideTimer = null;

  function toast(message) {
    const anim = window.BatakAnim;
    const el = document.getElementById("toast");
    if (!anim || !el) return;

    clearTimeout(hideTimer);
    anim.cancelScope(SCOPE); // supersede whatever toast (in or out) was already mid-flight

    el.textContent = message;
    el.hidden = false;
    anim.play(
      el,
      [{ opacity: 0, transform: "translate(-50%, 12px)" }, { opacity: 1, transform: "translate(-50%, 0)" }],
      { duration: anim.DURATIONS.micro.toastIn, easing: anim.EASINGS.standard, fill: "forwards" },
      SCOPE
    );

    hideTimer = setTimeout(() => {
      const out = anim.play(
        el,
        [{ opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, 12px)" }],
        { duration: anim.DURATIONS.micro.toastOut, easing: anim.EASINGS.standard, fill: "forwards" },
        SCOPE
      );
      const done = () => {
        el.hidden = true;
      };
      if (out) out.finished.then(done, done);
      else done();
    }, anim.DURATIONS.micro.toastVisible);
  }

  window.BatakMicro = { toast };
})();
