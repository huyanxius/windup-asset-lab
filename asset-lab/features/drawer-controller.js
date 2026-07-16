export class DrawerController {
  constructor({ drawer, toggle, reveal, hotspot, body = document.body }) {
    this.drawer = drawer;
    this.toggle = toggle;
    this.reveal = reveal;
    this.hotspot = hotspot;
    this.body = body;
    this.closeTimer = null;
    this.animationTimer = null;
  }

  setCollapsed(collapsed) {
    this.body.classList.toggle('sidebar-collapsed', collapsed);
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    this.reveal.setAttribute('aria-expanded', String(!collapsed));
  }

  open() {
    clearTimeout(this.closeTimer);
    clearTimeout(this.animationTimer);
    this.body.classList.remove('drawer-opening');
    void this.body.offsetWidth;
    this.body.classList.add('drawer-opening');
    this.setCollapsed(false);
    this.animationTimer = setTimeout(() => this.body.classList.remove('drawer-opening'), 560);
  }

  bind() {
    this.toggle.addEventListener('click', () => this.setCollapsed(true));
    this.reveal.addEventListener('mouseenter', () => this.open());
    this.reveal.addEventListener('focus', () => this.open());
    this.hotspot.addEventListener('mouseenter', () => this.open());
    this.drawer.addEventListener('mouseenter', () => clearTimeout(this.closeTimer));
    this.drawer.addEventListener('mouseleave', () => {
      clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => this.setCollapsed(true), 260);
    });
    this.setCollapsed(true);
  }
}
