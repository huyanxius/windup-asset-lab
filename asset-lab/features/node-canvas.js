const SVG_NS = 'http://www.w3.org/2000/svg';

export const allowedNodeConnections = Object.freeze([
  ['project', 'source'],
  ['source', 'master-gen'],
  ['master-gen', 'master'],
  ['master', 'walk-key'],
  ['master', 'idle-key'],
  ['master', 'custom-action'],
  ['walk-key', 'walk-animation'],
  ['idle-key', 'idle-animation'],
  ['walk-animation', 'publish'],
  ['idle-animation', 'publish'],
]);

const reusableWorkflowConnections = Object.freeze([
  ['source', 'master-gen'],
  ['master-gen', 'master'],
  ['master', 'walk-key'],
  ['master', 'idle-key'],
  ['walk-key', 'walk-animation'],
  ['idle-key', 'idle-animation'],
  ['walk-animation', 'publish'],
  ['idle-animation', 'publish'],
]);

export function connectionKey(from, to) {
  return `${from}:${to}`;
}

export function wirePath(start, end) {
  const bend = Math.max(70, Math.abs(end.x - start.x) * 0.46);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export class NodeCanvasController {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.connections = new Set(this.read('windup-node-connections-v6', []));
    this.positions = this.read('windup-node-layout-v6', {});
    this.scale = 1;
    this.pan = { x: 80, y: 120 };
    this.abortController = null;
    this.drag = null;
    this.link = null;
    this.armedFrom = null;
    this.justConnected = null;
    this.focusedNodeId = null;
  }

  read(key, fallback) {
    try { return JSON.parse(this.storage?.getItem(key)) || fallback; } catch { return fallback; }
  }

  write(key, value) {
    try { this.storage?.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
  }

  hasConnection(from, to) {
    return this.connections.has(connectionKey(from, to));
  }

  attach(root) {
    this.detach();
    this.abortController = new AbortController();
    this.root = root;
    this.viewport = root?.querySelector('[data-node-canvas]');
    this.surface = root?.querySelector('[data-node-surface]');
    this.wires = root?.querySelector('[data-node-wires]');
    if (!this.viewport || !this.surface || !this.wires) return;
    const options = { signal: this.abortController.signal };
    this.surface.querySelectorAll('[data-node-id]').forEach((node) => {
      const id = node.dataset.nodeId;
      const saved = this.positions[id];
      node.style.left = `${saved?.x ?? Number(node.dataset.x)}px`;
      node.style.top = `${saved?.y ?? Number(node.dataset.y)}px`;
      node.querySelector('[data-node-drag]')?.addEventListener('pointerdown', (event) => this.startNodeDrag(event, node), options);
      node.addEventListener('click', (event) => this.clickNodeToConnect(event, node), options);
    });
    this.surface.querySelectorAll('[data-port="output"]').forEach((port) => {
      port.addEventListener('pointerdown', (event) => this.startLink(event, port), options);
    });
    this.surface.querySelectorAll('[data-port="input"]').forEach((port) => {
      port.addEventListener('click', () => this.finishArmedLink(port), options);
    });
    this.viewport.addEventListener('pointerdown', (event) => this.startPan(event), options);
    this.viewport.addEventListener('pointermove', (event) => this.pointerMove(event), options);
    this.viewport.addEventListener('pointerup', (event) => this.pointerUp(event), options);
    this.viewport.addEventListener('pointercancel', (event) => this.pointerUp(event), options);
    this.viewport.addEventListener('wheel', (event) => this.wheel(event), { ...options, passive: false });
    root.querySelector('[data-node-zoom-in]')?.addEventListener('click', () => this.zoomBy(0.1), options);
    root.querySelector('[data-node-zoom-out]')?.addEventListener('click', () => this.zoomBy(-0.1), options);
    root.querySelector('[data-node-arrange]')?.addEventListener('click', () => this.resetLayout(), options);
    this.applyTransform();
    this.renderWires();
    this.syncActions();
  }

  detach() {
    this.abortController?.abort();
    this.abortController = null;
  }

  startNodeDrag(event, node) {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.drag = {
      type: 'node', pointerId: event.pointerId, node,
      startX: event.clientX, startY: event.clientY,
      x: parseFloat(node.style.left), y: parseFloat(node.style.top),
    };
    this.viewport.setPointerCapture(event.pointerId);
    node.classList.add('is-dragging');
  }

  startPan(event) {
    if (event.button !== 0 || event.target.closest('[data-node-id], button, input, textarea, select, a')) return;
    this.drag = { type: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: this.pan.x, y: this.pan.y };
    this.viewport.setPointerCapture(event.pointerId);
    this.viewport.classList.add('is-panning');
  }

  startLink(event, port) {
    if (event.button !== 0 || port.dataset.enabled !== 'true') return;
    event.stopPropagation();
    this.link = { pointerId: event.pointerId, from: port.closest('[data-node-id]').dataset.nodeId, port, point: this.portPoint(port) };
    this.viewport.setPointerCapture(event.pointerId);
    this.highlightInputs(this.link.from);
    this.renderWires(this.link.point);
  }

  pointerMove(event) {
    if (this.drag?.pointerId === event.pointerId) {
      if (this.drag.type === 'node') {
        const x = this.drag.x + (event.clientX - this.drag.startX) / this.scale;
        const y = this.drag.y + (event.clientY - this.drag.startY) / this.scale;
        this.drag.node.style.left = `${Math.max(0, x)}px`;
        this.drag.node.style.top = `${Math.max(0, y)}px`;
        this.renderWires();
      } else {
        this.pan.x = this.drag.x + event.clientX - this.drag.startX;
        this.pan.y = this.drag.y + event.clientY - this.drag.startY;
        this.applyTransform();
      }
    }
    if (this.link?.pointerId === event.pointerId) {
      const bounds = this.viewport.getBoundingClientRect();
      this.renderWires({
        x: (event.clientX - bounds.left - this.pan.x) / this.scale,
        y: (event.clientY - bounds.top - this.pan.y) / this.scale,
      });
    }
  }

  pointerUp(event) {
    if (this.drag?.pointerId === event.pointerId) {
      if (this.drag.type === 'node') {
        const node = this.drag.node;
        node.classList.remove('is-dragging');
        this.positions[node.dataset.nodeId] = { x: parseFloat(node.style.left), y: parseFloat(node.style.top) };
        this.write('windup-node-layout-v6', this.positions);
      } else this.viewport.classList.remove('is-panning');
      this.drag = null;
    }
    if (this.link?.pointerId === event.pointerId) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-port="input"]');
      const to = target?.closest('[data-node-id]')?.dataset.nodeId;
      const connected = to ? this.connect(this.link.from, to, target) : false;
      this.armedFrom = connected ? null : this.link.from;
      if (this.armedFrom) this.highlightInputs(this.armedFrom);
      else this.clearInputHighlights();
      this.link = null;
      this.renderWires();
    }
    this.viewport.releasePointerCapture?.(event.pointerId);
  }

  connect(from, to, target) {
    const allowed = allowedNodeConnections.some(([source, destination]) => source === from && destination === to);
    if (!allowed || target?.dataset.enabled !== 'true') return false;
    this.connections.add(connectionKey(from, to));
    this.justConnected = connectionKey(from, to);
    setTimeout(() => {
      if (this.justConnected === connectionKey(from, to)) this.justConnected = null;
    }, 760);
    this.write('windup-node-connections-v6', [...this.connections]);
    this.armedFrom = null;
    this.clearInputHighlights();
    this.syncActions();
    this.renderWires();
    return true;
  }

  finishArmedLink(port) {
    if (!this.armedFrom) return false;
    const to = port.closest('[data-node-id]')?.dataset.nodeId;
    return this.connect(this.armedFrom, to, port);
  }

  clickNodeToConnect(event, node) {
    if (event.target.closest('[data-node-drag], [data-port], a, input, select, textarea')) return false;
    const to = node.dataset.nodeId;
    const candidates = allowedNodeConnections.filter(([from, destination]) => {
      if (destination !== to || this.hasConnection(from, to)) return false;
      return Boolean(this.surface.querySelector(`[data-node-id="${from}"] [data-port="output"][data-enabled="true"]`));
    });
    if (!candidates.length) return false;
    let connected = false;
    candidates.forEach(([from]) => {
      const target = node.querySelector('[data-port="input"]');
      connected = this.connect(from, to, target) || connected;
    });
    if (connected) {
      node.classList.add('is-connection-committed');
      setTimeout(() => node.classList.remove('is-connection-committed'), 900);
    }
    return connected;
  }

  highlightInputs(from) {
    this.surface.querySelectorAll('[data-port="input"]').forEach((input) => {
      const to = input.closest('[data-node-id]')?.dataset.nodeId;
      const compatible = allowedNodeConnections.some(([source, destination]) => source === from && destination === to);
      input.classList.toggle('is-connectable', compatible && !this.hasConnection(from, to));
    });
  }

  clearInputHighlights() {
    this.surface?.querySelectorAll('.is-connectable').forEach((port) => port.classList.remove('is-connectable'));
  }

  portPoint(port) {
    const surfaceBounds = this.surface.getBoundingClientRect();
    const bounds = port.getBoundingClientRect();
    return {
      x: (bounds.left + bounds.width / 2 - surfaceBounds.left) / this.scale,
      y: (bounds.top + bounds.height / 2 - surfaceBounds.top) / this.scale,
    };
  }

  renderWires(pointer = null) {
    if (!this.wires) return;
    this.wires.replaceChildren();
    this.connections.forEach((key) => {
      const [from, to] = key.split(':');
      const output = this.surface.querySelector(`[data-node-id="${from}"] [data-port="output"]`);
      const input = this.surface.querySelector(`[data-node-id="${to}"] [data-port="input"]`);
      if (!output || !input) return;
      const className = key === this.justConnected ? 'node-wire is-connected is-new' : 'node-wire is-connected';
      this.appendWire(this.portPoint(output), this.portPoint(input), className);
    });
    allowedNodeConnections.forEach(([from, to]) => {
      if (this.hasConnection(from, to)) return;
      const output = this.surface.querySelector(`[data-node-id="${from}"] [data-port="output"][data-enabled="true"]`);
      const input = this.surface.querySelector(`[data-node-id="${to}"] [data-port="input"]`);
      if (output && input) this.appendWire(this.portPoint(output), this.portPoint(input), 'node-wire is-suggested');
    });
    if (this.link && pointer) this.appendWire(this.portPoint(this.link.port), pointer, 'node-wire is-drafting');
  }

  appendWire(start, end, className) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', wirePath(start, end));
    path.setAttribute('class', className);
    if (className.includes('is-new')) path.setAttribute('pathLength', '1');
    this.wires.append(path);
  }

  syncActions() {
    this.root?.querySelectorAll('[data-connection-required]').forEach((control) => {
      const requirements = control.dataset.connectionRequired.split(',').map((requirement) => requirement.split(':'));
      const connected = requirements.every(([from, to]) => this.hasConnection(from, to));
      const upstreamReady = control.dataset.nodeReady !== 'false';
      const ready = connected && upstreamReady;
      control.disabled = !ready;
      control.title = ready ? '' : connected ? '等待上游生成与确认' : '请先连接节点端口';
      control.closest('[data-node-id]')?.classList.toggle('is-waiting-connection', !ready);
    });
    this.root?.querySelectorAll('[data-node-id]').forEach((node) => {
      const to = node.dataset.nodeId;
      const hasInput = [...this.connections].some((key) => key.endsWith(`:${to}`));
      const hasSuggestedInput = allowedNodeConnections.some(([from, destination]) => {
        if (destination !== to || this.hasConnection(from, to)) return false;
        return Boolean(this.surface.querySelector(`[data-node-id="${from}"] [data-port="output"][data-enabled="true"]`));
      });
      node.classList.toggle('has-input', hasInput);
      node.classList.toggle('is-waiting-connection', hasSuggestedInput);
    });
  }

  wheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) this.zoomBy(-event.deltaY * 0.0014);
    else {
      this.pan.x -= event.deltaX;
      this.pan.y -= event.deltaY;
      this.applyTransform();
    }
  }

  zoomBy(delta) {
    this.scale = Math.min(1.2, Math.max(0.5, this.scale + delta));
    this.applyTransform();
  }

  applyTransform() {
    if (!this.surface) return;
    this.surface.style.transform = `translate3d(${this.pan.x}px, ${this.pan.y}px, 0) scale(${this.scale})`;
    const label = this.root?.querySelector('[data-node-zoom-label]');
    if (label) label.textContent = `${Math.round(this.scale * 100)}%`;
  }

  focusNode(node) {
    if (!this.viewport || !node) return;
    const x = parseFloat(node.style.left) || Number(node.dataset.x);
    const y = parseFloat(node.style.top) || Number(node.dataset.y);
    const nodeWidth = node.offsetWidth || 324;
    const nodeHeight = node.offsetHeight || 280;
    this.scale = 1;
    this.pan.x = Math.round(this.viewport.clientWidth / 2 - (x + nodeWidth / 2));
    this.pan.y = Math.round(this.viewport.clientHeight / 2 - (y + nodeHeight / 2));
    this.applyTransform();
    this.renderWires();
  }

  frameNodes(nodes) {
    if (!this.viewport || !nodes.length) return;
    const boxes = nodes.map((node) => ({
      x: parseFloat(node.style.left) || Number(node.dataset.x),
      y: parseFloat(node.style.top) || Number(node.dataset.y),
      width: node.offsetWidth || 324,
      height: node.offsetHeight || 280,
    }));
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const width = right - left;
    const height = bottom - top;
    this.scale = Math.min(1, Math.max(0.68, Math.min(
      (this.viewport.clientWidth - 96) / width,
      (this.viewport.clientHeight - 150) / height,
    )));
    this.pan.x = Math.round((this.viewport.clientWidth - width * this.scale) / 2 - left * this.scale);
    this.pan.y = Math.round((this.viewport.clientHeight - height * this.scale) / 2 - top * this.scale + 22);
    this.applyTransform();
    this.renderWires();
  }

  resetLayout() {
    this.positions = {};
    this.write('windup-node-layout-v6', {});
    this.surface?.querySelectorAll('[data-node-id]').forEach((node) => {
      node.style.left = `${Number(node.dataset.x)}px`;
      node.style.top = `${Number(node.dataset.y)}px`;
    });
    this.pan = { x: 80, y: 120 };
    this.scale = 1;
    this.applyTransform();
    this.renderWires();
  }

  clearConnections() {
    this.connections = new Set();
    this.write('windup-node-connections-v6', []);
    this.syncActions();
    this.renderWires();
  }

  workflowGraph() {
    const positions = { ...this.positions };
    const nodes = [];
    this.surface?.querySelectorAll('[data-node-id]').forEach((node) => {
      const id = node.dataset.nodeId;
      nodes.push(id);
      positions[id] = {
        x: Math.round(parseFloat(node.style.left) || Number(node.dataset.x) || 0),
        y: Math.round(parseFloat(node.style.top) || Number(node.dataset.y) || 0),
      };
    });
    return {
      version: 1,
      nodes,
      connections: [...this.connections].map((key) => key.split(':')),
      positions,
      viewport: { x: Math.round(this.pan.x), y: Math.round(this.pan.y), scale: Number(this.scale.toFixed(2)) },
    };
  }

  restoreWorkflowGraph(graph) {
    const allowed = new Set(allowedNodeConnections.map(([from, to]) => connectionKey(from, to)));
    const requested = Array.isArray(graph?.connections) ? graph.connections : reusableWorkflowConnections;
    this.connections = new Set(requested
      .filter((edge) => Array.isArray(edge) && edge.length === 2)
      .map(([from, to]) => connectionKey(String(from), String(to)))
      .filter((key) => allowed.has(key)));
    if (graph?.positions && typeof graph.positions === 'object') {
      this.positions = Object.fromEntries(Object.entries(graph.positions)
        .filter(([, point]) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
        .map(([id, point]) => [id, { x: Number(point.x), y: Number(point.y) }]));
    }
    if (graph?.viewport && typeof graph.viewport === 'object') {
      this.pan = {
        x: Number.isFinite(Number(graph.viewport.x)) ? Number(graph.viewport.x) : 80,
        y: Number.isFinite(Number(graph.viewport.y)) ? Number(graph.viewport.y) : 120,
      };
      this.scale = Math.min(1.2, Math.max(0.5, Number(graph.viewport.scale) || 1));
    }
    this.write('windup-node-connections-v6', [...this.connections]);
    this.write('windup-node-layout-v6', this.positions);
    this.syncActions();
    this.applyTransform();
    this.renderWires();
  }
}
