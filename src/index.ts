import {
  ILabShell,
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
  openBoard
} from './commands';
import { taskBoardIcon } from './icons';
import { TaskBoardButton } from './taskBoardWidget';

/**
 * Task board plugin: a Kanban-style planning board where users add tasks and
 * columns, drag cards between stages and assign them to people.
 *
 * The board is a single collaborative document (BOARD_PATH) whose state syncs
 * across clients over RTC, just like `.naavrewf` workflows in the NaaVRE
 * workflow extension. A button in the left activity bar opens it as a full tab
 * in the main work area.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@naavre/taskboard-jupyterlab:plugin',
  description: 'NaaVRE collaborative task board on Jupyter Lab',
  autoStart: true,
  requires: [IDocumentManager, ILabShell],
  optional: [ICollaborativeContentProvider, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    labShell: ILabShell,
    contentProvider: ICollaborativeContentProvider | null,
    restorer: ILayoutRestorer | null
  ) => {
    console.log(
      'JupyterLab extension @naavre/taskboard-jupyterlab is activated!'
    );

    // Register the board document type.
    app.docRegistry.addFileType({
      name: 'naavreboard',
      displayName: 'NaaVRE Task Board',
      mimeTypes: ['text/json', 'application/json'],
      extensions: ['.naavreboard'],
      fileFormat: 'text',
      contentType: BOARD_CONTENT_TYPE
    });

    const boardModelFactory = new BoardModelFactory();
    app.docRegistry.addModelFactory(boardModelFactory);

    const boardWidgetFactory = new BoardWidgetFactory({
      name: BOARD_FACTORY,
      modelName: 'naavreboard-model',
      fileTypes: ['naavreboard'],
      defaultFor: ['naavreboard']
    });

    // Enable real-time collaboration when the jupyter-collaboration content
    // provider is available. Two things are needed:
    //   1. Register our shared model factory so the collaborative drive hands
    //      every client the same Yjs document (a `Board`) for the file. The key
    //      is the document's content type ('naavreboarddoc') and must match the
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
      widget.title.label = 'Task Board';
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

    // The left activity-bar entry. Clicking its icon opens the board; the panel
    // itself just acts as a launcher.
    const button = new TaskBoardButton(() => {
      void openBoard(app, docManager).then(() => {
        // The launcher lives in the left panel; collapse it so the board takes
        // over the screen instead of leaving an empty side panel behind. Only
        // on click — the restore path must not touch the sidebar layout.
        labShell.collapseLeft();
      });
    });
    button.title.icon = taskBoardIcon;
    button.title.caption = 'Task Board';
    labShell.add(button, 'left', { rank: 400 });

    // Only react to user clicks, not to layout restoration during startup.
    app.restored.then(() => {
      button.enable();
      if (button.isVisible) {
        labShell.collapseLeft();
      }
    });
  }
};

export default plugin;
