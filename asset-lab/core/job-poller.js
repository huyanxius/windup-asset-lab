const ACTIVE_STATES = new Set(['queued', 'generating', 'processing']);

function isTransientError(error) {
  const status = Number(error?.status || 0);
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createJobPoller(api, {
  interval = 900,
  retryBase = interval,
  maxRetryDelay = Math.max(retryBase, 10000),
  setTimeout: schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: cancel = (timer) => globalThis.clearTimeout(timer),
  shouldRetry = isTransientError,
} = {}) {
  let timer = null;
  let activeJobId = null;
  let runToken = 0;
  let retryAttempt = 0;

  function current(token, jobId) {
    return token === runToken && activeJobId === jobId;
  }

  function clearTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function finish(token, jobId) {
    if (!current(token, jobId)) return;
    clearTimer();
    activeJobId = null;
    retryAttempt = 0;
  }

  function scheduleTick(tick, delay, token, jobId) {
    if (!current(token, jobId)) return;
    clearTimer();
    timer = schedule(() => {
      timer = null;
      return tick();
    }, delay);
  }

  async function poll(jobId, onUpdate) {
    stop();
    activeJobId = jobId;
    const token = runToken;

    async function tick() {
      let job;
      try {
        job = await api.get(`/api/generations/${jobId}`);
      } catch (error) {
        if (!current(token, jobId)) return;
        if (!shouldRetry(error)) {
          onUpdate(null, error, { reconnecting: false, attempt: 0, delay: 0 });
          finish(token, jobId);
          return;
        }
        retryAttempt += 1;
        const exponent = Math.min(retryAttempt - 1, 30);
        const delay = Math.min(retryBase * (2 ** exponent), maxRetryDelay);
        onUpdate(null, error, { reconnecting: true, attempt: retryAttempt, delay });
        scheduleTick(tick, delay, token, jobId);
        return;
      }

      if (!current(token, jobId)) return;
      retryAttempt = 0;
      onUpdate(job, null, { reconnecting: false, attempt: 0, delay: 0 });
      if (!current(token, jobId)) return;
      if (ACTIVE_STATES.has(job.status)) scheduleTick(tick, interval, token, jobId);
      else finish(token, jobId);
    }

    await tick();
  }

  function stop() {
    runToken += 1;
    clearTimer();
    activeJobId = null;
    retryAttempt = 0;
  }

  return { poll, stop, isActive: (status) => ACTIVE_STATES.has(status) };
}
