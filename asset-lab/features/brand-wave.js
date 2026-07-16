const SAMPLE_SIZE = 48;
const MAX_DPR = 2;
const FRAME_INTERVAL = 1000 / 30;
const WAVE_DURATION = 7200;

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function sampleMark(image) {
  const sample = document.createElement('canvas');
  sample.width = SAMPLE_SIZE;
  sample.height = SAMPLE_SIZE;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const points = [];
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      const offset = (y * SAMPLE_SIZE + x) * 4;
      if (pixels[offset + 3] < 80) continue;
      const centerLight = Math.max(0, 1 - Math.hypot(x / SAMPLE_SIZE - 0.5, y / SAMPLE_SIZE - 0.5) / 0.7);
      points.push({
        accent: Math.hypot(x - SAMPLE_SIZE * 0.44, y - SAMPLE_SIZE * 0.5) < SAMPLE_SIZE * 0.055,
        luminance: 0.34 + centerLight * 0.3,
        x: x / (SAMPLE_SIZE - 1),
        y: y / (SAMPLE_SIZE - 1),
      });
    }
  }
  return points;
}

export async function startBrandWave(canvas, source = './brand/windup-mark.svg') {
  if (!canvas) return () => {};
  const image = await loadImage(source);
  const points = sampleMark(image);
  const context = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let scrollOpacity = 1;
  let animationFrame = 0;
  let lastFrameAt = 0;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw(time = 0) {
    context.clearRect(0, 0, width, height);
    const markSize = Math.min(width * 0.64, height * 0.78, 680);
    const originX = Math.max(24, width * 0.29 - markSize * 0.5);
    const originY = height * 0.49 - markSize * 0.5;
    const dotRadius = Math.max(1.2, Math.min(3.8, markSize / 155));
    const waveProgress = reduceMotion ? 0.5 : (time % WAVE_DURATION) / WAVE_DURATION;
    const primaryCenter = originX + (waveProgress * 1.42 - 0.2) * markSize;
    const echoProgress = (waveProgress + 0.52) % 1;
    const echoCenter = originX + (echoProgress * 1.42 - 0.2) * markSize;
    const spread = markSize * 0.15;

    for (const point of points) {
      const baseX = originX + point.x * markSize;
      const baseY = originY + point.y * markSize;
      const primaryDistance = baseX - primaryCenter;
      const echoDistance = baseX - echoCenter;
      const primaryWave = reduceMotion ? 0 : Math.sin(primaryDistance / 14)
        * Math.exp(-((primaryDistance / spread) ** 2));
      const echoWave = reduceMotion ? 0 : Math.sin(echoDistance / 17)
        * Math.exp(-((echoDistance / spread) ** 2)) * 0.42;
      // One coherent field moves like grain under wind. The left edge stays
      // quieter, while each travelling band gathers strength across the mark.
      const leftSettle = 0.38 + smoothStep(point.x) * 0.62;
      const displacement = (primaryWave + echoWave) * 4.2 * leftSettle;
      // Light belongs to the same travelling wave as the displacement: its
      // crest catches light and its trough falls back into shade. A signed
      // value avoids the flat, uniformly bright breathing effect.
      const lightBand = primaryWave * 0.2 + echoWave * 0.1;
      const x = baseX + displacement * 0.18;
      const y = baseY + displacement;
      const pointOpacity = Math.max(
        0.16,
        Math.min(0.92, point.luminance + lightBand),
      );

      context.beginPath();
      context.arc(x, y, dotRadius + Math.max(0, lightBand) * 1.35, 0, Math.PI * 2);
      context.fillStyle = point.accent
        ? `rgba(215, 154, 69, ${Math.min(0.96, pointOpacity + 0.16) * scrollOpacity})`
        : `rgba(255, 255, 255, ${pointOpacity * scrollOpacity})`;
      context.fill();
    }
  }

  function trackScroll() {
    scrollOpacity = reduceMotion ? 1 : 1 - Math.min(1, window.scrollY / Math.max(1, height * 0.18));
    if (reduceMotion) draw(0);
  }

  function animate(time) {
    if (time - lastFrameAt >= FRAME_INTERVAL) {
      lastFrameAt = time;
      draw(time);
    }
    animationFrame = requestAnimationFrame(animate);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('scroll', trackScroll, { passive: true });
  resize();
  trackScroll();
  if (!reduceMotion) animationFrame = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    window.removeEventListener('scroll', trackScroll);
  };
}
