export class InputController {
  constructor(onAction) {
    this.onAction = onAction;
    this.boundKeyHandler = (e) => this.handleKeyDown(e);
    this.bindListeners();
  }

  handleKeyDown(e) {
    if (e.repeat) return; // ignore OS auto-repeat — one action per physical press
    let action = null;

    switch (e.key) {
      case 'w':
      case 'W':
        action = 'MOVE_FORWARD';
        break;
      case 's':
      case 'S':
        action = 'MOVE_BACKWARD';
        break;
      case 'a':
      case 'A':
        action = 'ROTATE_LEFT';
        break;
      case 'd':
      case 'D':
        action = 'ROTATE_RIGHT';
        break;
    }

    if (action && this.onAction) {
      this.onAction(action);
    }
  }

  bindListeners() {
    window.addEventListener('keydown', this.boundKeyHandler);
  }

  unbind() {
    if (this.boundKeyHandler) {
      window.removeEventListener('keydown', this.boundKeyHandler);
    }
  }

  destroy() {
    this.unbind();
  }
}