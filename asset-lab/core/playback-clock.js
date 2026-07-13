export class PlaybackClock {
  constructor(fps, timers = globalThis) {
    this.fps = fps;
    this.timers = timers;
    this.timer = null;
  }

  start(onTick) {
    this.stop();
    this.timer = this.timers.setInterval(onTick, 1000 / this.fps);
  }

  stop() {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  get running() { return this.timer !== null; }
}
