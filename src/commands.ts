// Commands are the task board's entire public surface. Other extensions add
// cards by executing `naavre-taskboard:add-task` through `app.commands`, never
// by importing from this package — so neither repo depends on the other, and
// the board stays optional (guard with `commands.hasCommand(...)`).
//
// The command ids and argument names are a public contract: additive changes
// only.

import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ServerConnection } from '@jupyterlab/services';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { BoardModel } from './boardModel';
import { BoardDocWidget } from './boardFactory';
import { addTask } from './components/taskBoard/boardLogic';
import { taskBoardIcon } from './icons';

/**
 * Path of the single shared board document. This constant *is* the sharing
 * mechanism: every client of a Jupyter server opens this one path, so they all
 * land in the same Yjs room. Scope of "shared" is exactly one server.
 *
 * Frozen — changing it orphans every board already on disk, silently.
 */
export const BOARD_PATH = 'taskboard.naavretb';

/** Name of the widget factory registered for board documents (see index.ts). */
export const BOARD_FACTORY = 'NaaVRE Task Board';

export namespace CommandIDs {
  /** Open (creating if missing) the shared board and focus it. */
  export const open = 'naavre-taskboard:open';

  /**
   * Add a card to the first column. Args:
   * `{ title: string; description?: string }`. The card is independent —
   * nothing links it back to where the fields came from.
   */
  export const addTask = 'naavre-taskboard:add-task';
}

function isNotFound(reason: unknown): boolean {
  return (
    reason instanceof ServerConnection.ResponseError &&
    reason.response.status === 404
  );
}

/** In-flight existence check, shared by every caller. See ensureBoardFile. */
let _ensuring: Promise<void> | null = null;

/**
 * Make sure the board document exists, creating an empty one on first use.
 *
 * Single-flight: several callers race here, and a `contents.save` writes
 * *around* any live collaboration room — the server reloads the room from
 * disk, blanking the board for everyone editing it. One check serves all.
 */
export function ensureBoardFile(app: JupyterFrontEnd): Promise<void> {
  if (!_ensuring) {
    _ensuring = createBoardFileIfMissing(app).finally(() => {
      _ensuring = null;
    });
  }
  return _ensuring;
}

async function createBoardFileIfMissing(app: JupyterFrontEnd): Promise<void> {
  const contents = app.serviceManager.contents;

  const exists = async (): Promise<boolean> => {
    try {
      await contents.get(BOARD_PATH, { content: false });
      return true;
    } catch (reason) {
      // Only a 404 means "missing"; never overwrite on a network or auth error.
      if (isNotFound(reason)) {
        return false;
      }
      throw reason;
    }
  };

  if (await exists()) {
    return;
  }
  // Narrows (does not close) the race where two clients both see the first
  // 404; the write below also recovers from losing it.
  if (await exists()) {
    return;
  }
  try {
    await contents.save(BOARD_PATH, {
      type: 'file',
      format: 'text',
      content: '{}'
    });
  } catch (reason) {
    // Someone else creating it first is the outcome we wanted.
    if (!(await exists())) {
      throw reason;
    }
  }
}

/** Open the board and return its context, without stealing focus. */
async function boardContext(
  app: JupyterFrontEnd,
  docManager: IDocumentManager
): Promise<DocumentRegistry.IContext<BoardModel>> {
  await ensureBoardFile(app);
  const widget =
    docManager.findWidget(BOARD_PATH, BOARD_FACTORY) ??
    docManager.open(BOARD_PATH, BOARD_FACTORY, undefined, { activate: false });
  if (!widget) {
    throw new Error('Could not open the task board.');
  }
  return (widget as BoardDocWidget).context;
}

/**
 * Open (creating if missing) the shared board and bring it to the front.
 * Errors go to the console: this runs from the palette and from layout
 * restoration, where there is no caller to hand a failure to.
 */
export async function openBoard(
  app: JupyterFrontEnd,
  docManager: IDocumentManager
): Promise<void> {
  try {
    await ensureBoardFile(app);
    const widget = await docManager.openOrReveal(BOARD_PATH, BOARD_FACTORY);
    if (widget) {
      app.shell.activateById(widget.id);
    }
  } catch (reason) {
    console.error('Failed to open the task board', reason);
  }
}

/**
 * Put a card on the board's shared model, so it appears at once on every
 * client that has it open. Throws, so the caller can report the failure.
 */
async function addTaskToBoard(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  args: ReadonlyPartialJSONObject
): Promise<void> {
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const description =
    typeof args.description === 'string' ? args.description : '';
  if (!title) {
    throw new Error('A task board card needs a title.');
  }

  const context = await boardContext(app, docManager);
  // The board may have just been opened; content arrives with `ready`.
  await context.ready;
  const model = context.model;
  const columnId = model.board.columns[0]?.id;
  if (!columnId) {
    throw new Error('The task board has no column to add the card to.');
  }
  model.board = addTask(model.board, columnId, { title, description });
  // Under RTC the collaboration server persists; without it the edit would sit
  // unsaved, and the board need not be open for this to be called.
  if (!model.collaborative) {
    await context.save();
  }
}

/** Register the board's commands. Called once from the plugin's activate. */
export function addCommands(
  app: JupyterFrontEnd,
  docManager: IDocumentManager
): void {
  app.commands.addCommand(CommandIDs.open, {
    label: 'Open Task Board',
    caption: 'Open the shared NaaVRE task board',
    icon: taskBoardIcon,
    execute: () => openBoard(app, docManager)
  });

  app.commands.addCommand(CommandIDs.addTask, {
    label: 'Add Card to Task Board',
    caption: 'Add a card to the first column of the shared NaaVRE task board',
    execute: args => addTaskToBoard(app, docManager, args)
  });
}
