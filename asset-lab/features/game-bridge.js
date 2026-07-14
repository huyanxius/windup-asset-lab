export function createGameBridge({ origin, namespace, iframe, status }) {
  let currentPayload = null;

  function send(payload = currentPayload) {
    currentPayload = payload;
    if (!payload) {
      status.textContent = '缺少该视角资产';
      return;
    }
    status.textContent = '正在同步…';
    iframe.contentWindow?.postMessage(payload, origin);
  }

  function openStandalone(payload) {
    const game = window.open(`${origin}/`, 'windup-cocos-game');
    if (!game || !payload) return;
    [700, 1400, 2400].forEach((delay) => setTimeout(() => game.postMessage(payload, origin), delay));
  }

  function receive(event) {
    if (event.origin !== origin) return;
    const type = event.data?.type;
    if (type === `${namespace}:preview-ready`) status.textContent = '游戏已连接';
    if (type === `${namespace}:preview-applied`) status.textContent = `已同步 ${event.data.view} / ${event.data.action} · ${event.data.frames}帧`;
    if (type === `${namespace}:preview-error`) status.textContent = `同步失败 · ${event.data.reason}`;
  }

  return { send, receive, openStandalone };
}
