export function startHomeIdleCast(nodes, options = {}) {
  const schedule = options.schedule || ((callback, delay) => window.setTimeout(callback, delay));
  const cancel = options.cancel || ((timer) => window.clearTimeout(timer));
  const stagger = options.stagger ?? 180;
  const timers = [...nodes].map((node, index) => schedule(() => {
    const source = node.dataset.idleSrc;
    if (!source) return;
    node.src = source;
    node.classList.add('is-playing');
  }, index * stagger));

  return () => timers.forEach(cancel);
}
