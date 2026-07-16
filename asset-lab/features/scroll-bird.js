const SAMPLE_SIZE = 72;
const MAX_DPR = 1.5;
const TAU = Math.PI * 2;
const GRID_STEP = 2 / (SAMPLE_SIZE - 1);
export const SCROLL_BIRD_FRAME_COUNT = 20;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

export function scrollBirdPose(frameIndex) {
  const normalizedIndex = ((frameIndex % SCROLL_BIRD_FRAME_COUNT) + SCROLL_BIRD_FRAME_COUNT)
    % SCROLL_BIRD_FRAME_COUNT;
  const phase = normalizedIndex / SCROLL_BIRD_FRAME_COUNT * TAU;
  const stroke = Math.sin(phase - Math.PI * 0.5);
  const downstroke = (stroke + 1) * 0.5;

  return {
    bodyLift: -Math.sin(phase - 0.28) * 0.012,
    bodyPitch: Math.sin(phase - 0.5) * 0.035,
    bodySurge: Math.cos(phase - 0.12) * 0.006,
    headCounterPitch: -Math.sin(phase - 0.5) * 0.018,
    tailAngle: -Math.sin(phase - 0.35) * 0.08,
    wingAngle: stroke * 0.68,
    wingArch: Math.sin(phase) * 0.034,
    wingFold: 0.82 + downstroke * 0.18,
  };
}

function rotatePoint(x, y, pivotX, pivotY, angle) {
  const deltaX = x - pivotX;
  const deltaY = y - pivotY;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: pivotX + deltaX * cosine - deltaY * sine,
    y: pivotY + deltaX * sine + deltaY * cosine,
  };
}

function sampleBird(image) {
  const sample = document.createElement('canvas');
  sample.width = SAMPLE_SIZE;
  sample.height = SAMPLE_SIZE;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const points = [];
  for (let y = 0; y < SAMPLE_SIZE; y += 2) {
    for (let x = 0; x < SAMPLE_SIZE; x += 2) {
      const alpha = pixels[(y * SAMPLE_SIZE + x) * 4 + 3];
      if (alpha < 92) continue;
      const normalizedX = x / SAMPLE_SIZE;
      const normalizedY = y / SAMPLE_SIZE;
      const centerLight = Math.max(0, 1 - Math.hypot(normalizedX - 0.5, normalizedY - 0.5) / 0.7);
      const wingDistance = ((normalizedX - 0.52) / 0.29) ** 2
        + ((normalizedY - 0.57) / 0.21) ** 2;
      const wingWeight = wingDistance < 1
        ? smoothStep(clamp((normalizedX - 0.4) / 0.25))
        : 0;
      const tailWeight = smoothStep(clamp((0.36 - normalizedX) / 0.2))
        * smoothStep(clamp((normalizedY - 0.43) / 0.18));
      const headWeight = smoothStep(clamp((normalizedX - 0.65) / 0.2))
        * smoothStep(clamp((0.62 - normalizedY) / 0.22));
      points.push({
        accent: Math.hypot(normalizedX - 0.44, normalizedY - 0.5) < 0.058,
        headWeight,
        luminance: 0.34 + centerLight * 0.3,
        tailWeight,
        wingWeight,
        x: x / (SAMPLE_SIZE - 1),
        y: y / (SAMPLE_SIZE - 1),
      });
    }
  }
  return points;
}

function buildPoseFrame(points, pose) {
  const cells = new Map();

  for (const point of points) {
    let x = point.x;
    let y = point.y;

    if (point.tailWeight > 0) {
      const tail = rotatePoint(x, y, 0.36, 0.57, pose.tailAngle * point.tailWeight);
      x = tail.x;
      y = tail.y;
    }

    if (point.wingWeight > 0) {
      const pivotX = 0.43;
      const pivotY = 0.49;
      const foldedX = pivotX + (x - pivotX) * pose.wingFold;
      const wing = rotatePoint(
        foldedX,
        y + pose.wingArch * point.wingWeight,
        pivotX,
        pivotY,
        pose.wingAngle * point.wingWeight,
      );
      x = wing.x;
      y = wing.y;
    }

    if (point.headWeight > 0) {
      const head = rotatePoint(
        x,
        y,
        0.66,
        0.48,
        pose.headCounterPitch * point.headWeight,
      );
      x = head.x;
      y = head.y;
    }

    const body = rotatePoint(x, y, 0.52, 0.54, pose.bodyPitch);
    x = body.x + pose.bodySurge;
    y = body.y + pose.bodyLift;

    const cellX = Math.round(x / GRID_STEP);
    const cellY = Math.round(y / GRID_STEP);
    const key = `${cellX}:${cellY}`;
    const existing = cells.get(key);
    cells.set(key, {
      accent: point.accent || existing?.accent || false,
      luminance: Math.max(point.luminance, existing?.luminance || 0),
      x: cellX * GRID_STEP,
      y: cellY * GRID_STEP,
    });
  }
  return cells;
}

function buildFlightFrames(points) {
  return Array.from(
    { length: SCROLL_BIRD_FRAME_COUNT },
    (_, frameIndex) => buildPoseFrame(points, scrollBirdPose(frameIndex)),
  );
}

export function startScrollBird(layer) {
  if (!layer) return () => {};
  const productHome = document.querySelector('.product-home');
  const firstChapter = document.querySelector('.story-chapter');
  const brandWave = document.querySelector('#brandWave');
  const hero = document.querySelector('.product-hero');
  if (!productHome || !firstChapter || !brandWave || !hero) return () => {};
  productHome.prepend(layer);
  layer.style.opacity = '1';

  const canvas = document.createElement('canvas');
  canvas.className = 'scroll-bird__canvas';
  layer.append(canvas);
  const context = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const image = new Image();
  image.decoding = 'async';
  image.src = './brand/windup-mark.svg';

  let animationFrame = 0;
  let height = 1;
  let frames = [];
  let progress = 0;
  let visible = false;
  let width = 1;
  let startGeometry = { size: 1, x: 0, y: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const heroBounds = hero.getBoundingClientRect();
    const heroDocumentTop = heroBounds.top + window.scrollY;
    const size = Math.min(width * 0.64, heroBounds.height * 0.78, 680);
    startGeometry = {
      size,
      x: Math.max(24, width * 0.29 - size * 0.5),
      y: heroDocumentTop + heroBounds.height * 0.49 - size * 0.5,
    };
    updateProgress();
    draw();
  }

  function updateProgress() {
    const end = Math.max(window.innerHeight, firstChapter.offsetTop - window.innerHeight * 0.35);
    progress = clamp(window.scrollY / end);
    visible = !reduceMotion && window.scrollY > 8 && progress < 0.995;
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    if (visible && frames.length) {
      // Move immediately after take-off; smoothStep previously held the bird
      // almost still through the first part of the page.
      const eased = Math.pow(progress, 0.72);
      const flightScale = smoothStep(clamp(progress / 0.34));
      const finalSize = Math.max(112, Math.min(162, width * 0.105));
      const birdSize = startGeometry.size + (finalSize - startGeometry.size) * flightScale;
      const startCenterX = startGeometry.x + startGeometry.size * 0.5;
      const startCenterY = startGeometry.y + startGeometry.size * 0.5;
      const endCenterX = width + finalSize * 0.7;
      const centerX = startCenterX + (endCenterX - startCenterX) * eased;
      const originX = centerX - birdSize * 0.5;
      const rise = Math.sin(progress * Math.PI * 0.86);
      const flightArcY = -rise * Math.min(height * 0.2, 170) - progress * Math.min(height * 0.07, 56);
      const handoff = clamp(window.scrollY / Math.max(1, brandWave.clientHeight * 0.18));
      const exit = clamp((progress - 0.86) / 0.14);
      const opacity = handoff * (1 - exit);
      // The scroll position selects one of twenty authored poses. Nothing
      // advances after scrolling stops, and no alpha crossfade can make the
      // dot matrix flicker between bright and dark frames.
      const frameIndex = Math.floor(progress * frames.length * 2.35) % frames.length;
      const currentFrame = frames[frameIndex];
      const originY = startCenterY - birdSize * 0.5 + flightArcY;
      const dotRadius = Math.max(1.05, birdSize / 92);

      for (const cell of currentFrame.values()) {
        const dotX = originX + cell.x * birdSize;
        const dotY = originY + cell.y * birdSize;
        context.beginPath();
        context.arc(dotX, dotY, dotRadius, 0, TAU);
        context.fillStyle = cell.accent
          ? `rgba(215, 154, 69, ${opacity * Math.min(0.86, cell.luminance + 0.16)})`
          : `rgba(242, 244, 240, ${opacity * cell.luminance})`;
        context.fill();
      }
    }
  }

  function scheduleDraw() {
    if (animationFrame) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      updateProgress();
      draw();
    });
  }

  function handleImageLoad() {
    frames = buildFlightFrames(sampleBird(image));
    draw();
  }

  image.addEventListener('load', handleImageLoad, { once: true });
  window.addEventListener('scroll', scheduleDraw, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  resize();
  draw();

  return () => {
    cancelAnimationFrame(animationFrame);
    image.removeEventListener('load', handleImageLoad);
    window.removeEventListener('scroll', scheduleDraw);
    window.removeEventListener('resize', resize);
    layer.remove();
  };
}
