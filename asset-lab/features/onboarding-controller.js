export class OnboardingController {
  constructor({ stage, characterFrame, modeCards }) {
    this.stage = stage;
    this.characterFrame = characterFrame;
    this.modeCards = modeCards;
    this.complete = false;
    this.choiceMade = false;
    this.clickGuide = null;
  }

  start({ beforeReveal, afterReveal }) {
    beforeReveal();
    const rect = this.characterFrame.getBoundingClientRect();
    const spotlight = document.createElement('div');
    spotlight.className = 'dynamic-spotlight';
    spotlight.style.left = `${rect.left + rect.width / 2}px`;
    spotlight.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(spotlight);
    document.getElementById('bootScreen')?.remove();
    setTimeout(() => {
      spotlight.remove();
      document.getElementById('bootWordmark')?.remove();
      this.complete = true;
      this.modeCards.hidden = false;
      requestAnimationFrame(() => this.modeCards.classList.add('visible'));
      afterReveal?.();
    }, 3000);
  }

  choose(callback) {
    if (this.choiceMade) return;
    this.choiceMade = true;
    this.modeCards.classList.remove('visible');
    this.modeCards.classList.add('leaving');
    setTimeout(() => {
      this.modeCards.hidden = true;
      this.modeCards.classList.remove('leaving');
      callback?.();
    }, 220);
  }

  showClickGuide() {
    this.hideClickGuide();
    const guide = document.createElement('div');
    guide.className = 'character-click-guide';
    guide.innerHTML = '<span class="guide-ripple"></span><i class="guide-cursor"></i><b>点击人物开始移动</b>';
    this.stage.appendChild(guide);
    this.clickGuide = guide;
    setTimeout(() => { if (this.clickGuide === guide) this.hideClickGuide(); }, 5200);
  }

  hideClickGuide() {
    if (!this.clickGuide) return;
    this.clickGuide.classList.add('leaving');
    const guide = this.clickGuide;
    this.clickGuide = null;
    setTimeout(() => guide.remove(), 220);
  }

  showClickPrompt(text, event) {
    const prompt = document.createElement('div');
    prompt.textContent = text;
    prompt.className = 'click-prompt';
    prompt.style.left = `${event.clientX}px`;
    prompt.style.top = `${event.clientY - 20}px`;
    document.body.appendChild(prompt);
    setTimeout(() => prompt.remove(), 1000);
  }
}
