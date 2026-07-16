const COVER_DURATION = 520;
const REVEAL_DURATION = 620;

export function runRouteLightTransition(onCovered) {
  const overlay = document.createElement('div');
  overlay.className = 'route-light-transition';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.append(document.createElement('span'));
  document.body.append(overlay);

  let revealTimer = 0;
  let removeTimer = 0;
  const coverTimer = window.setTimeout(() => {
    onCovered();
    requestAnimationFrame(() => {
      overlay.classList.add('is-revealing');
      revealTimer = window.setTimeout(() => overlay.remove(), REVEAL_DURATION);
    });
  }, COVER_DURATION);

  requestAnimationFrame(() => overlay.classList.add('is-covering'));
  removeTimer = window.setTimeout(() => overlay.remove(), COVER_DURATION + REVEAL_DURATION + 200);

  return () => {
    window.clearTimeout(coverTimer);
    window.clearTimeout(revealTimer);
    window.clearTimeout(removeTimer);
    overlay.remove();
  };
}
