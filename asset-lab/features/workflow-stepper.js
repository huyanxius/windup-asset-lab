export class WorkflowStepper {
  constructor(root, steps) {
    this.root = root;
    this.steps = steps;
  }

  select(step) {
    const current = this.steps.indexOf(step);
    this.root.querySelectorAll('[data-step]').forEach((item) => {
      const index = this.steps.indexOf(item.dataset.step);
      item.classList.toggle('active', index === current);
      item.classList.toggle('done', index < current);
    });
  }
}
