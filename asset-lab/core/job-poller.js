const ACTIVE_STATES = new Set(['queued', 'generating', 'processing']);

export function createJobPoller(api, { interval = 900 } = {}) {
  let timer = null;
  let activeJobId = null;

  async function poll(jobId, onUpdate) {
    stop();
    activeJobId = jobId;

    async function tick() {
      try {
        const job = await api.get(`/api/generations/${jobId}`);
        if (activeJobId !== jobId) return;
        onUpdate(job, null);
        if (ACTIVE_STATES.has(job.status)) timer = setTimeout(tick, interval);
      } catch (error) {
        if (activeJobId === jobId) onUpdate(null, error);
      }
    }

    await tick();
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
    activeJobId = null;
  }

  return { poll, stop, isActive: (status) => ACTIVE_STATES.has(status) };
}
