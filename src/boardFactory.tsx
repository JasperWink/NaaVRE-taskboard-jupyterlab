// Document factory for the collaborative task board (`.naavretb`). The board
// opens as a normal document whose content widget is the React TaskBoard, so it
// rides the existing RTC pipeline: edits to its shared model (src/boardModel.ts)
// sync across every client, exactly like `.naavrewf` workflows in the NaaVRE
// workflow extension.

import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget
} from '@jupyterlab/docregistry';
import { Contents } from '@jupyterlab/services';

import { Board, BoardModel, BOARD_CONTENT_TYPE } from './boardModel';
import { IBoardState } from './components/taskBoard/types';
import { TaskBoard } from './components/taskBoard/TaskBoard';

/**
 * Delay between a board edit and the automatic save when the document is not
 * collaborative (mirrors the debounce of the old state-DB store).
 */
const SAVE_DEBOUNCE_MS = 400;

/**
 * The content widget of a board document: renders the React TaskBoard, sourcing
 * the board state from the collaborative BoardModel.
 */
export class BoardPanel extends ReactWidget {
  private _context: DocumentRegistry.IContext<BoardModel>;
  private _model: BoardModel;
  private _ready = false;
  private _saveTimer: number | null = null;

  constructor(context: DocumentRegistry.IContext<BoardModel>) {
    super();
    this.addClass('naavre-task-board-widget');
    this._context = context;
    this._model = context.model;

    context.ready
      .then(() => {
        if (this.isDisposed) {
          return;
        }
        this._model.contentChanged.connect(this._onBoardChanged, this);
        // Without RTC there is no collaboration server persisting the shared
        // document, so save shortly after every edit — like the old state-DB
        // store did — instead of leaving edits in a dirty, unsaved document.
        if (!this._model.collaborative) {
          this._model.contentChanged.connect(this._scheduleSave, this);
        }
        this._ready = true;
        this.update();
      })
      .catch(reason => {
        console.error('Failed to load the task board document', reason);
      });
  }

  private _onBoardChanged = (): void => {
    this.update();
  };

  private _scheduleSave = (): void => {
    if (this._saveTimer !== null) {
      window.clearTimeout(this._saveTimer);
    }
    this._saveTimer = window.setTimeout(() => {
      this._saveTimer = null;
      this._context.save().catch(reason => {
        console.error('Failed to save the task board', reason);
      });
    }, SAVE_DEBOUNCE_MS);
  };

  private _updateBoard = (
    updater: (prev: IBoardState) => IBoardState
  ): void => {
    this._model.board = updater(this._model.board);
  };

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    if (this._saveTimer !== null) {
      window.clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._model.contentChanged.disconnect(this._onBoardChanged, this);
    this._model.contentChanged.disconnect(this._scheduleSave, this);
    super.dispose();
  }

  render(): React.ReactElement {
    return (
      <TaskBoard
        board={this._model.board}
        ready={this._ready}
        updateBoard={this._updateBoard}
      />
    );
  }
}

/**
 * DocumentWidget wrapping the BoardPanel.
 */
export class BoardDocWidget extends DocumentWidget<BoardPanel, BoardModel> {
  dispose(): void {
    this.content.dispose();
    super.dispose();
  }
}

/**
 * Widget factory for board documents.
 */
export class BoardWidgetFactory extends ABCWidgetFactory<
  BoardDocWidget,
  BoardModel
> {
  protected createNewWidget(
    context: DocumentRegistry.IContext<BoardModel>
  ): BoardDocWidget {
    return new BoardDocWidget({
      context,
      content: new BoardPanel(context)
    });
  }
}

/**
 * Model factory for board documents.
 */
export class BoardModelFactory
  implements DocumentRegistry.IModelFactory<BoardModel>
{
  get name(): string {
    return 'naavretb-model';
  }

  get contentType(): Contents.ContentType {
    return BOARD_CONTENT_TYPE;
  }

  get fileFormat(): Contents.FileFormat {
    return 'text';
  }

  readonly collaborative: boolean = true;

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    this._disposed = true;
  }

  preferredLanguage(path: string): string {
    return '';
  }

  createNew(options: DocumentRegistry.IModelOptions<Board>): BoardModel {
    return new BoardModel(options);
  }

  private _disposed = false;
}
