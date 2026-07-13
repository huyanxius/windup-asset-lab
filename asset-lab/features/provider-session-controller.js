/** Owns provider connection state for every generation surface. */
export function providerIsReady(payload) {
  return payload?.verified === true
    || (payload?.configured === true && payload?.verified !== false);
}

export class ProviderSessionController {
  constructor({ api, elements, onChange = () => {}, onConnected = () => {} }) {
    this.api = api;
    this.els = elements;
    this.onChange = onChange;
    this.onConnected = onConnected;
    this.connected = false;
    this.busy = false;
  }

  get model() { return this.els.model.value; }

  status(kind, title, message = '') {
    this.els.providerState.className = `status ${kind || ''}`;
    this.els.providerState.textContent = title;
    this.els.providerDot.className = kind || '';
    this.els.connectionMessage.className = `message ${kind === 'error' ? 'error' : ''}`;
    this.els.connectionMessage.textContent = message;
  }

  populateModels(provider) {
    const models = Array.isArray(provider.models) ? provider.models : [];
    this.els.model.replaceChildren(...models.map((id) => new Option(id, id)));
    this.els.model.value = models.includes(provider.selected) ? provider.selected : models[0] || '';
    this.els.model.disabled = models.length === 0;
  }

  requireConnection() {
    if (this.connected) return true;
    this.status('error', '请先连接', '生成前必须完成真实 Key 验证。');
    this.els.apiKey.focus();
    return false;
  }

  async connect() {
    const apiKey = this.els.apiKey.value.trim();
    if (!apiKey) {
      this.status('error', '需要 API Key', '请输入 Key 后再验证。');
      this.els.apiKey.focus();
      return false;
    }
    this.busy = true;
    this.els.connectBtn.textContent = '正在验证…';
    this.status('', '验证中', '正在进行不产生图片费用的凭据验证。');
    this.onChange();
    try {
      const result = await this.api.post(
        '/api/provider/session',
        { apiKey, model: this.model },
        { 'X-Windup-Request': 'studio' },
      );
      this.connected = providerIsReady(result);
      this.els.apiKey.value = '';
      this.els.connectBtn.textContent = '重新连接';
      this.status('ready', '已验证', `${result.model} · 当前后端会话`);
      this.onConnected(result);
      return true;
    } catch (error) {
      this.connected = false;
      this.els.connectBtn.textContent = '重试连接';
      this.status('error', '连接失败', error.message);
      return false;
    } finally {
      this.busy = false;
      this.onChange();
    }
  }

  async boot() {
    const [healthResult, modelsResult] = await Promise.allSettled([
      this.api.get('/api/health'),
      this.api.get('/api/provider/models'),
    ]);
    if (modelsResult.status === 'fulfilled') this.populateModels(modelsResult.value);
    else {
      this.els.model.replaceChildren(new Option('模型读取失败', ''));
      this.els.model.disabled = true;
    }
    if (healthResult.status === 'fulfilled') {
      const health = healthResult.value;
      this.connected = providerIsReady(health);
      this.els.serviceState.textContent = '生成后端已连接';
      if (this.connected) {
        this.els.connectBtn.textContent = '重新连接';
        this.status('ready', '已验证', `${health.model} · 当前后端会话`);
      } else {
        this.status(health.providerError ? 'error' : '', '未连接', health.providerError || '输入 Key 后进行真实验证。');
      }
    } else {
      this.connected = false;
      this.els.serviceState.textContent = '生成后端未启动';
      this.status('error', '服务不可用', '请启动 Python 生成后端。');
    }
    this.onChange();
    return this.connected;
  }

  bind() {
    this.els.connectBtn.addEventListener('click', () => this.connect());
    this.els.apiKey.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.connect(); }
    });
    this.els.model.addEventListener('change', () => {
      if (this.connected) this.status('ready', '已验证', `${this.model} · 将锁定到下一任务`);
      this.onChange();
    });
  }
}
