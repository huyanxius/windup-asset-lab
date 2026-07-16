const MAX_DPR = 1.5;
const TAU = Math.PI * 2;
const PATTERN_SOURCES = [
  ['../assets/resources/characters/lirael/base.png'],
  [
    '../assets/resources/characters/skeleton/views/side/walk-02.png',
    '../assets/resources/characters/skeleton/views/side/walk-04.png',
    '../assets/resources/characters/skeleton/views/side/walk-07.png',
  ],
  ['../assets/resources/characters/skeleton/views/side/walk-06.png'],
  ['../assets/resources/characters/lirael/views/side/walk-03.png'],
];

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function loadImage(source, onDone) {
  const image = new Image();
  image.addEventListener('load', onDone, { once: true });
  image.src = source;
  return image;
}

function rebuildMask(field) {
  const { width, height, maskContext, maskCanvas, images, index } = field;
  maskCanvas.width = Math.max(1, Math.round(width));
  maskCanvas.height = Math.max(1, Math.round(height));
  maskContext.clearRect(0, 0, width, height);
  const reversed = field.canvas.dataset.fieldSide === 'left';
  const focusX = width * (reversed ? 0.31 : 0.69);
  const focusY = height * 0.52;
  const loaded = images.filter((image) => image.complete && image.naturalWidth);
  if (!loaded.length) {
    field.maskData = null;
    return;
  }

  if (index === 1) {
    const targetHeight = Math.min(height * 0.49, width * 0.25);
    loaded.forEach((image, imageIndex) => {
      const targetWidth = targetHeight * image.naturalWidth / image.naturalHeight;
      const offset = (imageIndex - (loaded.length - 1) / 2) * targetWidth * 0.72;
      maskContext.globalAlpha = imageIndex === 1 ? 1 : 0.48;
      maskContext.drawImage(image, focusX - targetWidth / 2 + offset, focusY - targetHeight / 2, targetWidth, targetHeight);
    });
  } else {
    const heightRatio = index === 0 ? 0.62 : 0.56;
    const targetHeight = Math.min(height * heightRatio, width * 0.34);
    const image = loaded[0];
    const targetWidth = targetHeight * image.naturalWidth / image.naturalHeight;
    maskContext.globalAlpha = 1;
    maskContext.drawImage(image, focusX - targetWidth / 2, focusY - targetHeight / 2, targetWidth, targetHeight);
  }
  maskContext.globalAlpha = 1;
  field.maskData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
}

function maskStrength(field, x, y) {
  if (!field.maskData) return 0;
  const sampleX = Math.max(0, Math.min(field.maskCanvas.width - 1, Math.round(x)));
  const sampleY = Math.max(0, Math.min(field.maskCanvas.height - 1, Math.round(y)));
  return field.maskData[(sampleY * field.maskCanvas.width + sampleX) * 4 + 3] / 255;
}

export function startNarrativeFields(canvases) {
  const fields = [...canvases].map((canvas, index) => {
    const maskCanvas = document.createElement('canvas');
    const field = {
      canvas,
      context: canvas.getContext('2d'),
      height: 1,
      images: [],
      index,
      maskCanvas,
      maskContext: maskCanvas.getContext('2d', { willReadFrequently: true }),
      maskData: null,
      pointer: { active: false, x: 0, y: 0 },
      visible: false,
      width: 1,
    };
    field.images = PATTERN_SOURCES[index].map((source) => loadImage(source, () => rebuildMask(field)));
    return field;
  });
  if (!fields.length) return () => {};

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let animationFrame = 0;

  function resize(field) {
    const bounds = field.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    field.width = Math.max(1, bounds.width);
    field.height = Math.max(1, bounds.height);
    field.canvas.width = Math.round(field.width * dpr);
    field.canvas.height = Math.round(field.height * dpr);
    field.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildMask(field);
  }

  function drawField(field, time) {
    const { context, width, height, pointer } = field;
    context.clearRect(0, 0, width, height);
    const reversed = field.canvas.dataset.fieldSide === 'left';
    const focusX = width * (reversed ? 0.31 : 0.69);
    const focusY = height * 0.52;
    const step = Math.max(13, Math.min(19, width / 82));
    const phase = reduceMotion ? 0 : time * 0.001;

    for (let y = step * 0.5; y < height; y += step) {
      for (let x = step * 0.5; x < width; x += step) {
        const pattern = maskStrength(field, x, y);
        const distance = Math.hypot((x - focusX) / (width * 0.45), (y - focusY) / (height * 0.62));
        const seed = Math.abs(Math.sin(x * 17.17 + y * 31.73 + field.index * 9.13));
        const ambient = clamp(1 - distance) * 0.16;
        if (pattern < 0.08 && seed > ambient) continue;

        let drawX = x;
        let drawY = y;
        let interaction = 0;
        if (!reduceMotion && pattern > 0.05) {
          drawX += Math.sin(phase * 1.7 + y * 0.025) * 1.6;
          drawY += Math.cos(phase * 1.3 + x * 0.018) * 1.2;
        }
        if (pointer.active) {
          const deltaX = drawX - pointer.x;
          const deltaY = drawY - pointer.y;
          const pointerDistance = Math.hypot(deltaX, deltaY);
          interaction = clamp(1 - pointerDistance / 145);
          if (!reduceMotion && pointerDistance > 0) {
            const push = interaction ** 2 * 27;
            drawX += deltaX / pointerDistance * push;
            drawY += deltaY / pointerDistance * push;
          }
        }

        const pulse = reduceMotion ? 0.55 : (Math.sin(phase * 2.4 - distance * 8) + 1) * 0.5;
        const radius = 0.7 + pattern * (2 + pulse * 0.9) + interaction * 1.4;
        const alpha = clamp(0.04 + pattern * 0.82 + interaction * 0.28, 0, 0.96);
        context.beginPath();
        context.arc(drawX, drawY, radius, 0, TAU);
        context.fillStyle = pattern > 0.08
          ? `rgba(205, 220, 207, ${alpha})`
          : `rgba(121, 148, 126, ${alpha})`;
        context.fill();
      }
    }
  }

  function draw(time = 0) {
    fields.forEach((field) => {
      if (field.visible || reduceMotion) drawField(field, time);
    });
    if (!reduceMotion) animationFrame = requestAnimationFrame(draw);
  }

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const field = fields.find((candidate) => candidate.canvas === entry.target);
      if (field) resize(field);
    });
  });
  const intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const field = fields.find((candidate) => candidate.canvas === entry.target);
      if (field) field.visible = entry.isIntersecting;
    });
  }, { rootMargin: '15% 0px' });

  fields.forEach((field) => {
    const surface = field.canvas.parentElement;
    field.handlePointerMove = (event) => {
      const bounds = field.canvas.getBoundingClientRect();
      field.pointer.x = event.clientX - bounds.left;
      field.pointer.y = event.clientY - bounds.top;
      field.pointer.active = true;
      if (reduceMotion) drawField(field, 0);
    };
    field.handlePointerLeave = () => {
      field.pointer.active = false;
      if (reduceMotion) drawField(field, 0);
    };
    surface?.addEventListener('pointermove', field.handlePointerMove, { passive: true });
    surface?.addEventListener('pointerleave', field.handlePointerLeave);
    resizeObserver.observe(field.canvas);
    intersectionObserver.observe(field.canvas);
    resize(field);
  });
  draw();

  return () => {
    cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    fields.forEach((field) => {
      const surface = field.canvas.parentElement;
      surface?.removeEventListener('pointermove', field.handlePointerMove);
      surface?.removeEventListener('pointerleave', field.handlePointerLeave);
    });
  };
}
