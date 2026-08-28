import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { WidgetTracker } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ICollaborativeContentProvider } from '@jupyter/collaborative-drive';

import { Board, BOARD_CONTENT_TYPE } from './boardModel';
import {
  BoardDocWidget,
  BoardModelFactory,
  BoardWidgetFactory
} from './boardFactory';
import {
  addCommands,
  BOARD_FACTORY,
  BOARD_PATH,
  CommandIDs,
  ensureBoardFile
} from './commands';
import { taskBoardIcon } from './icons';

/**
 * Task board plugin: a Kanban-style planning board where users add tasks and
 * columns, drag cards between stages and assign them to people.
 *
 * The board is a single collaborative document (BOARD_PATH) whose state syncs
 * across clients over RTC, just like `.naavrewf` workflows in the NaaVRE
 * workflow extension. It opens the way any other document does — from the file
 * browser — so the board is created on startup if it is missing, and is there
 * to click.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@naavre/taskboard-jupyterlab:plugin',
  description: 'NaaVRE collaborative task board on Jupyter Lab',
  autoStart: true,
  requires: [IDocumentManager],
  optional: [ICollaborativeContentProvider, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    contentProvider: ICollaborativeContentProvider | null,
    restorer: ILayoutRestorer | null
  ) => {
    console.log(
      'JupyterLab extension @naavre/taskboard-jupyterlab is activated!'
    );

    // Register the board document type.
    app.docRegistry.addFileType({
      name: 'naavretb',
      displayName: 'NaaVRE Task Board',
      mimeTypes: ['text/json', 'application/json'],
      extensions: ['.naavretb'],
      fileFormat: 'text',
      contentType: BOARD_CONTENT_TYPE,
      icon: taskBoardIcon
    });

    const boardModelFactory = new BoardModelFactory();
    app.docRegistry.addModelFactory(boardModelFactory);

    const boardWidgetFactory = new BoardWidgetFactory({
      name: BOARD_FACTORY,
      modelName: 'naavretb-model',
      fileTypes: ['naavretb'],
      defaultFor: ['naavretb']
    });

    // Enable real-time collaboration when the jupyter-collaboration content
    // provider is available. Two things are needed:
    //   1. Register our shared model factory so the collaborative drive hands
    //      every client the same Yjs document (a `Board`) for the file. The key
    //      is the document's content type ('naavretbdoc') and must match the
    //      model factory (src/boardFactory.tsx) and the server-side YDoc entry
    //      point (pyproject.toml -> NaaVRE_taskboard_jupyterlab.ydoc:YBoard).
    //   2. Point the widget factory at the 'rtc' content provider, so opening
    //      the board routes through the collaboration websocket instead of the
    //      default contents API. Without this the board opens as an
    //      independent, single-user copy and edits never sync.
    if (contentProvider) {
      contentProvider.sharedModelFactory.registerDocumentFactory(
        BOARD_CONTENT_TYPE,
        () => Board.create()
      );
      boardWidgetFactory.contentProviderId = 'rtc';
      console.log(
        '@naavre/taskboard-jupyterlab: real-time collaboration enabled'
      );
    }

    const boardTracker = new WidgetTracker<BoardDocWidget>({
      namespace: 'naavre-task-board'
    });
    boardWidgetFactory.widgetCreated.connect((_sender, widget) => {
      // Do NOT set `widget.title.label`. DocumentWidget treats a label that
      // differs from the file name as a rename request and calls
      // `context.rename(label)` — that is how JupyterLab lets you rename a
      // document by editing its tab title. Setting it to a display name here
      // renames the board file itself on every open, which is how stray
      // extensionless "Task Board" files appear next to the real one. The tab
      // shows the file name, exactly as `.naavrewf` workflows do.
      widget.title.icon = taskBoardIcon;
      widget.title.caption = 'Task Board';
      widget.title.closable = true;
      boardTracker.add(widget);
    });
    app.docRegistry.addWidgetFactory(boardWidgetFactory);

    // The board's public surface: `naavre-taskboard:open` and
    // `naavre-taskboard:add-task`. Other extensions reach the board only
    // through these (see src/commands.ts).
    addCommands(app, docManager);

    if (restorer) {
      // Restoration goes through the open command, so the board is recreated
      // if its file was deleted between sessions.
      restorer.restore(boardTracker, {
        command: CommandIDs.open,
        name: () => BOARD_PATH
      });
    }

    // Create the board document if this server has never had one, so it is
    // present in the file browser to open. Opening it is the only entry point,
    // so without this a fresh instance would show the user nothing to click.
    // Deferred to `restored` to keep it off the startup path, and safe to call
    // on every launch — it writes only when the file is genuinely missing.
    app.restored
      .then(() => ensureBoardFile(app))
      .catch(reason => {
        console.error('Could not create the task board document', reason);
      });
  }
};

export default plugin;
