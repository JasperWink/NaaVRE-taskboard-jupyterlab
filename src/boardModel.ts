// Collaborative document model for the task board. Backing the board with a
// shared Yjs document (rather than the browser-local state DB) is what makes it
// sync across clients over RTC.
//
// The board state is stored under granular keys in the `content` map —
// 'columns', 'categories' and 'people' as JSON arrays, plus one JSON object per
// card under 'task:<id>'. Writing only the keys that changed lets Yjs merge
// concurrent edits to different cards, instead of last-write-wins on the whole
// board. The front-end (src/components/taskBoard) owns and validates the board
// schema.

import { YDocument, DocumentChange } from '@jupyter/ydoc';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Contents } from '@jupyterlab/services';
import * as Y from 'yjs';

import { SharedDocumentModel } from './sharedDocumentModel';
import { IBoardState } from './components/taskBoard/types';
import { normalizeBoard } from './components/taskBoard/boardStore';

/**
 * Content type of board documents. Must match the file-type registration and
 * shared-model factory in src/index.ts and the jupyter_ydoc entry point in
 * pyproject.toml (NaaVRE_taskboard_jupyterlab.ydoc:YBoard) — a mismatch makes
 * the server fall back to the generic YFile and the board silently stops
 * syncing.
 */
export const BOARD_CONTENT_TYPE = 'naavretbdoc' as Contents.ContentType;

const TASK_KEY_PREFIX = 'task:';

/** JSON.parse that degrades to a fallback instead of throwing. */
function parseJson(raw: unknown, fallback: any): any {
  if (typeof raw !== 'string' || raw === '') {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export type BoardChange = {
  boardChange?: boolean;
} & DocumentChange;

/**
 * DocumentModel holding the task board content of a `.naavretb` file.
 */
export class BoardModel extends SharedDocumentModel<BoardChange, Board> {
  constructor(options: DocumentRegistry.IModelOptions<Board>) {
    super(options, () => Board.create());
  }

  /**
   * The board state (parsed and normalized from the shared document). The
   * normalized object is cached until the shared document changes, so
   * repeated reads (one per render) are cheap and keep a stable identity for
   * React memoization.
   */
  get board(): IBoardState {
    if (this._boardCache === null) {
      this._boardCache = normalizeBoard(this.sharedModel.getBoard());
    }
    return this._boardCache;
  }
  set board(v: IBoardState) {
    this.sharedModel.setBoard(v);
  }

  protected onContentChanged(changes: BoardChange): void {
    if (changes.boardChange) {
      this._boardCache = null;
      this.triggerContentChange();
    }
  }

  private _boardCache: IBoardState | null = null;
}

/**
 * SharedModel for the task board. Structure mirrors YBoard on the server
 * (NaaVRE_taskboard_jupyterlab/ydoc.py): a `content` map holding the board
 * under granular JSON-string keys (see the header comment).
 */
export class Board extends YDocument<BoardChange> {
  constructor() {
    super();
    this._content = this.ydoc.getMap('content');
    this._content.observe(this._contentObserver);
  }

  readonly version: string = '1.0.0';

  /**
   * Reconstruct the raw (pre-normalization) board object from the granular
   * keys. Corrupt values degrade to defaults instead of throwing; the caller
   * runs the result through `normalizeBoard`.
   *
   * Cards come out sorted by id: `Y.Map` iterates in its own order, not
   * insertion order, so without an explicit sort every save reshuffles the
   * `tasks` array on disk. The order carries no meaning (cards are placed by
   * `columnId` and `order`), so sorting is free and makes the serialization
   * canonical. `YBoard._get_board` on the server sorts the same way.
   */
  getBoard(): unknown {
    const tasks: any[] = [];
    this._content.forEach((value, key) => {
      if (key.startsWith(TASK_KEY_PREFIX)) {
        const task = parseJson(value, null);
        if (task) {
          tasks.push(task);
        }
      }
    });
    tasks.sort((a, b) =>
      String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
    );
    return {
      version: 1,
      columns: parseJson(this._content.get('columns'), undefined),
      categories: parseJson(this._content.get('categories'), undefined),
      people: parseJson(this._content.get('people'), undefined),
      tasks
    };
  }

  /**
   * Write the board, touching only the keys whose value actually changed and
   * deleting keys of removed cards. Concurrent edits to different cards then
   * live on different Yjs keys and merge instead of overwriting each other;
   * a no-op update writes nothing (and does not mark the document dirty).
   */
  setBoard(value: IBoardState): void {
    const desired = new Map<string, string>();
    desired.set('columns', JSON.stringify(value.columns));
    desired.set('categories', JSON.stringify(value.categories));
    desired.set('people', JSON.stringify(value.people));
    value.tasks.forEach(task => {
      desired.set(TASK_KEY_PREFIX + task.id, JSON.stringify(task));
    });
    this.transact(() => {
      // Removes the keys of tasks that are no longer on the board.
      Array.from(this._content.keys()).forEach(key => {
        if (!desired.has(key)) {
          this._content.delete(key);
        }
      });
      desired.forEach((json, key) => {
        if (this._content.get(key) !== json) {
          this._content.set(key, json);
        }
      });
    });
  }

  /**
   * Get the document source: the on-disk `.naavretb` string.
   */
  getSource(): string {
    return JSON.stringify({ board: this.getBoard() }, null, 2);
  }

  /**
   * Set the document source from the on-disk `.naavretb` string. A corrupt
   * file degrades to an empty board instead of failing to open.
   */
  setSource(value: string): void {
    const contents = parseJson(value, {});
    const board =
      contents && typeof contents === 'object' ? (contents as any).board : {};
    this.setBoard(normalizeBoard(board));
  }

  /**
   * Dispose of the resources.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._content.unobserve(this._contentObserver);
    super.dispose();
  }

  /**
   * Static method to create instances on the sharedModel
   *
   * @returns The sharedModel instance
   */
  static create(): Board {
    return new Board();
  }

  private _contentObserver = (event: Y.YMapEvent<any>): void => {
    if (event.keysChanged.size === 0) {
      return;
    }
    this._changed.emit({ boardChange: true });
  };

  private _content: Y.Map<any>;
}
