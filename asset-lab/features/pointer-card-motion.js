const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function calculatePointerCardMotion(rect, clientX, clientY, maxTilt = 3) {
  const width = Math.max(1, Number(rect?.width) || 0);
  const height = Math.max(1, Number(rect?.height) || 0);
  const xRatio = clamp((clientX - (Number(rect?.left) || 0)) / width, 0, 1);
  const yRatio = clamp((clientY - (Number(rect?.top) || 0)) / height, 0, 1);

  return Object.freeze({
    glowX: xRatio * 100,
    glowY: yRatio * 100,
    rotateX: (0.5 - yRatio) * maxTilt * 2,
    rotateY: (xRatio - 0.5) * maxTilt * 2,
  });
}

export function attachPointerCardMotion(root, options = {}) {
  const view = root?.ownerDocument?.defaultView;
  const cards = Array.from(root?.querySelectorAll?.('[data-pointer-card]') || []);
  const reduceMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = view?.matchMedia?.('(pointer: coarse)').matches;

  if (!view || !cards.length || reduceMotion || coarsePointer) return () => {};

  const cleanups = cards.map((card) => {
    let animationFrame = 0;
    let pointer = null;
    const maxTilt = card.dataset.pointerCard === 'subtle'
      ? Number(options.subtleTilt || 1.4)
      : Number(options.maxTilt || 3);

    const update = () => {
      animationFrame = 0;
      if (!pointer || !card.isConnected) return;
      const motion = calculatePointerCardMotion(
        card.getBoundingClientRect(),
        pointer.clientX,
        pointer.clientY,
        maxTilt,
      );
      card.style.setProperty('--pointer-x', `${motion.glowX.toFixed(2)}%`);
      card.style.setProperty('--pointer-y', `${motion.glowY.toFixed(2)}%`);
      card.style.setProperty('--pointer-rotate-x', `${motion.rotateX.toFixed(2)}deg`);
      card.style.setProperty('--pointer-rotate-y', `${motion.rotateY.toFixed(2)}deg`);
    };

    const onPointerEnter = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      card.classList.add('is-pointer-active');
    };
    const onPointerMove = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      pointer = event;
      if (!animationFrame) animationFrame = view.requestAnimationFrame(update);
    };
    const onPointerLeave = () => {
      pointer = null;
      card.classList.remove('is-pointer-active');
      card.style.setProperty('--pointer-rotate-x', '0deg');
      card.style.setProperty('--pointer-rotate-y', '0deg');
      if (animationFrame) view.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    card.addEventListener('pointerenter', onPointerEnter);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerleave', onPointerLeave);

    return () => {
      onPointerLeave();
      card.removeEventListener('pointerenter', onPointerEnter);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerleave', onPointerLeave);
    };
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}
