// Commands are the task board's entire public surface.
//
// Other extensions — notably the NaaVRE workflow composer, which offers "add
// this draft cell to the task board" — put cards on the board by executing
// `naavre-taskboard:add-task` through `app.commands`, never by importing from
// this package. That keeps the two repos free of any build-time dependency on
// each other, and makes the board optional: an extension guards its button with
// `commands.hasCommand(...)` and simply hides it when the board is not
// installed.
//
// The command ids and their argument names are therefore a public contract.
// Treat them like an API: additive changes only.

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
 * Path (in the Jupyter server root) of the single, shared board document.
 *
 * This constant *is* the sharing mechanism. Every client of a given Jupyter
 * server opens this one path, which resolves to one collaborative document and
 * therefore one Yjs room — so a user who shares their instance and everyone who
 * joins it all work on the same board, and a joiner never creates a second one.
 * The scope of "shared" is exactly "same Jupyter server": two servers means two
 * boards.
 *
 * Frozen. Changing this (or the `.naavretb` extension) orphans every board
 * already written to disk, with no error and no migration path.
 */
export const BOARD_PATH = 'taskboard.naavretb';

/** Name of the widget factory registered for board documents (see index.ts). */
export const BOARD_FACTORY = 'NaaVRE Task Board';

export namespace CommandIDs {
  /** Open (creating if missing) the shared board and focus it. */
  export const open = 'naavre-taskboard:open';

  /**
   * Add a card to the first column of the shared board.
   *
   * Args: `{ title: string; description?: string }`. The card is independent —
   * nothing links it back to whatever the fields were copied from.
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
 * Single-flight per client. Several callers race here — plugin startup, the
 * open command, a card arriving from the workflow composer — and every 404 that
 * turns into a `contents.save` is a write that goes *around* any live
 * collaboration room. The server treats such a write as an out-of-band change
 * and reloads the room from disk, so a stray one blanks the board for everyone
 * currently editing it. One check serves all callers.
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
      // Only a 404 means "missing". Any other failure (network, auth, server
      // error) must not be read as an empty board and overwritten.
      if (isNotFound(reason)) {
        return false;
      }
      throw reason;
    }
  };

  if (await exists()) {
    return;
  }
  // Look again immediately before writing. On a shared server two clients can
  // both see the first 404; this narrows that window rather than closing it,
  // which is why the write below also recovers from losing the race.
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
    // Someone else created it in the meantime. That is the outcome we wanted,
    // so only report the failure if the file is still not there.
    if (!(await exists())) {
      throw reason;
    }
  }
}

/**
 * Open the board document and return its context, without stealing focus.
 * Used by `add-task`, so a card can be added while the user keeps looking at
 * whatever they were doing.
 */
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
 *
 * Errors are reported to the console rather than thrown: this runs from the
 * command palette and from layout restoration, where there is no caller to hand
 * a failure to. Opening the board from the file browser does not come through
 * here at all — the document registry handles that.
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
 * Put a card on the board.
 *
 * The card is written to the board's shared model, so it shows up right away on
 * every client that has the board open — and on the next open for those that do
 * not. Failures are thrown, so the calling extension can tell the user why
 * their card did not appear.
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
  // The board may have just been opened; its content arrives with `ready`.
  await context.ready;
  const model = context.model;
  const columnId = model.board.columns[0]?.id;
  if (!columnId) {
    throw new Error('The task board has no column to add the card to.');
  }
  model.board = addTask(model.board, columnId, { title, description });
  // With RTC the collaboration server persists the document; without it, the
  // edit would sit unsaved (the board panel debounces its own saves, but the
  // board need not be open for this to be called).
  if (!model.collaborative) {
    await context.save();
  }
}

/**
 * Register the board's commands. Called once from the plugin's activate.
 */
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
