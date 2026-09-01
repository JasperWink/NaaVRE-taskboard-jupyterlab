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
 * Task board plugin: a Kanban board of tasks and columns, backed by a single
 * collaborative document (BOARD_PATH) that syncs over RTC. It opens like any
 * other document, so it is created on startup if missing.
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

    // Enable RTC when the jupyter-collaboration provider is available: register
    // the shared model factory so every client gets the same Yjs document, and
    // route the widget factory through the 'rtc' provider. Without either, the
    // board opens as a single-user copy and edits never sync.
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
      // Do NOT set `widget.title.label`: DocumentWidget reads a label that
      // differs from the file name as a rename request, which renames the board
      // file on every open and leaves stray "Task Board" files behind.
      widget.title.icon = taskBoardIcon;
      widget.title.caption = 'Task Board';
      widget.title.closable = true;
      boardTracker.add(widget);
    });
    app.docRegistry.addWidgetFactory(boardWidgetFactory);

    // The board's public surface; see src/commands.ts.
    addCommands(app, docManager);

    if (restorer) {
      // Goes through the open command, so a board deleted between sessions is
      // recreated.
      restorer.restore(boardTracker, {
        command: CommandIDs.open,
        name: () => BOARD_PATH
      });
    }

    // Seed the board file so a fresh instance has something to click. Deferred
    // to `restored` to stay off the startup path; writes only when missing.
    app.restored
      .then(() => ensureBoardFile(app))
      .catch(reason => {
        console.error('Could not create the task board document', reason);
      });
  }
};

export default plugin;
