const MIN_SCALE = 0.42;
const MAX_SCALE = 1.35;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function focusTransform({
  nodeHeight,
  nodeWidth,
  nodeX,
  nodeY,
  scale,
  viewportHeight,
  viewportWidth,
}) {
  return {
    x: viewportWidth * 0.5 - (nodeX + nodeWidth * 0.5) * scale,
    y: viewportHeight * 0.5 - (nodeY + nodeHeight * 0.5) * scale,
  };
}

export class GuidedCanvasController {
  constructor() {
    this.activeIndex = -1;
    this.drag = null;
    this.root = null;
    this.scale = 0.82;
    this.viewport = null;
    this.world = null;
    this.x = 32;
    this.y = 54;
    this.abortController = null;
  }

  detach() {
    this.abortController?.abort();
    this.abortController = null;
    this.root = null;
    this.viewport = null;
    this.world = null;
  }

  attach(root, snapshot) {
    this.detach();
    this.abortController = new AbortController();
    this.root = root;
    this.viewport = root?.querySelector('[data-guided-canvas]') || null;
    this.world = root?.querySelector('[data-guided-canvas-world]') || null;
    if (!this.viewport || !this.world) return;
    const options = { signal: this.abortController.signal };

    this.viewport.addEventListener('pointerdown', (event) => this.pointerDown(event), options);
    this.viewport.addEventListener('pointermove', (event) => this.pointerMove(event), options);
    this.viewport.addEventListener('pointerup', (event) => this.pointerUp(event), options);
    this.viewport.addEventListener('pointercancel', (event) => this.pointerUp(event), options);
    this.viewport.addEventListener('wheel', (event) => this.wheel(event), { ...options, passive: false });
    this.viewport.addEventListener('keydown', (event) => this.keyDown(event), options);
    root.querySelector('[data-canvas-zoom-in]')?.addEventListener('click', () => this.zoomBy(0.12), options);
    root.querySelector('[data-canvas-zoom-out]')?.addEventListener('click', () => this.zoomBy(-0.12), options);
    root.querySelectorAll('[data-canvas-jump]').forEach((button) => {
      button.addEventListener('click', () => this.focus(Number(button.dataset.canvasJump)), options);
    });
    this.apply();
    this.update(snapshot, { force: true });
  }

  update(snapshot, options = {}) {
    if (!snapshot || !this.viewport || !this.world) return;
    const nextIndex = snapshot.status === 'draft' ? 0 : Math.max(0, snapshot.stepIndex);
    if (options.force || nextIndex !== this.activeIndex) {
      this.activeIndex = nextIndex;
      requestAnimationFrame(() => this.focus(nextIndex));
    }
    const zoomLabel = this.root?.querySelector('[data-canvas-zoom-label]');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
  }

  focus(index = 0) {
    const node = this.world?.querySelector(`[data-canvas-node-index="${index}"]`);
    if (!node || !this.viewport) return;
    const scale = this.viewport.clientWidth < 720 ? 0.78 : 0.9;
    const next = focusTransform({
      nodeHeight: node.offsetHeight,
      nodeWidth: node.offsetWidth,
      nodeX: node.offsetLeft,
      nodeY: node.offsetTop,
      scale,
      viewportHeight: this.viewport.clientHeight,
      viewportWidth: this.viewport.clientWidth,
    });
    this.scale = scale;
    this.x = next.x;
    this.y = next.y;
    this.viewport.classList.add('is-auto-focusing');
    this.apply();
    window.setTimeout(() => this.viewport?.classList.remove('is-auto-focusing'), 460);
  }

  zoomBy(delta, centerX = this.viewport?.clientWidth * 0.5, centerY = this.viewport?.clientHeight * 0.5) {
    if (!this.viewport || !this.world) return;
    const nextScale = clamp(this.scale + delta, MIN_SCALE, MAX_SCALE);
    const worldX = (centerX - this.x) / this.scale;
    const worldY = (centerY - this.y) / this.scale;
    this.x = centerX - worldX * nextScale;
    this.y = centerY - worldY * nextScale;
    this.scale = nextScale;
    this.apply();
  }

  pointerDown(event) {
    if (event.button !== 0 || event.target.closest('button, a, input, textarea, label')) return;
    this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: this.x, y: this.y };
    this.viewport.setPointerCapture(event.pointerId);
    this.viewport.classList.add('is-dragging');
  }

  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.x = this.drag.x + event.clientX - this.drag.startX;
    this.y = this.drag.y + event.clientY - this.drag.startY;
    this.apply();
  }

  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.viewport.releasePointerCapture?.(event.pointerId);
    this.drag = null;
    this.viewport.classList.remove('is-dragging');
  }

  wheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = this.viewport.getBoundingClientRect();
      this.zoomBy(-event.deltaY * 0.0015, event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }
    this.x -= event.deltaX;
    this.y -= event.deltaY;
    this.apply();
  }

  keyDown(event) {
    if (event.key === '+' || event.key === '=') this.zoomBy(0.12);
    if (event.key === '-') this.zoomBy(-0.12);
    if (event.key.toLowerCase() === 'f') this.focus(this.activeIndex);
  }

  apply() {
    if (!this.world) return;
    this.world.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) scale(${this.scale})`;
    const zoomLabel = this.root?.querySelector('[data-canvas-zoom-label]');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
  }
}
