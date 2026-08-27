import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

/**
 * Lightweight left activity-bar entry that acts as a launcher: whenever it is
 * shown (i.e. the user clicks its icon) it opens the board in the main area.
 * It stays disabled until the application has finished restoring its layout so
 * that reopening a saved session does not spuriously pop the board open.
 */
export class TaskBoardButton extends Widget {
  private _open: () => void;
  private _enabled = false;

  constructor(open: () => void) {
    super();
    this._open = open;
    this.id = 'naavre-task-board-launcher';
    this.addClass('naavre-task-board-launcher');
    const message = document.createElement('div');
    message.className = 'naavre-task-board-launcher-msg';
    message.textContent = 'Opening Task Board…';
    this.node.appendChild(message);
  }

  /** Allow the button to start opening the board (after layout restoration). */
  enable(): void {
    this._enabled = true;
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);
    if (this._enabled) {
      this._open();
    }
  }
}
