// Collaborative document model for the task board: a shared Yjs document, so
// the board syncs across clients over RTC.
//
// The `content` map holds 'columns', 'categories' and 'people' as JSON arrays,
// plus one JSON object per card under 'task:<id>'. Writing only the changed
// keys lets Yjs merge concurrent edits to different cards. The front-end
// (src/components/taskBoard) owns the schema.

import { YDocument, DocumentChange } from '@jupyter/ydoc';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Contents } from '@jupyterlab/services';
import * as Y from 'yjs';

import { SharedDocumentModel } from './sharedDocumentModel';
import { IBoardState } from './components/taskBoard/types';
import { normalizeBoard } from './components/taskBoard/boardStore';

/**
 * Content type of board documents. Must match src/index.ts and the
 * jupyter_ydoc entry point in pyproject.toml — on a mismatch the server falls
 * back to YFile and the board silently stops syncing.
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

/** DocumentModel holding the task board content of a `.naavretb` file. */
export class BoardModel extends SharedDocumentModel<BoardChange, Board> {
  constructor(options: DocumentRegistry.IModelOptions<Board>) {
    super(options, () => Board.create());
  }

  /**
   * The board state, parsed and normalized. Cached until the shared document
   * changes, so repeated reads are cheap and keep a stable identity for React.
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
 * SharedModel for the task board. Mirrors YBoard on the server
 * (NaaVRE_taskboard_jupyterlab/ydoc.py); see the header for the key layout.
 */
export class Board extends YDocument<BoardChange> {
  constructor() {
    super();
    this._content = this.ydoc.getMap('content');
    this._content.observe(this._contentObserver);
  }

  readonly version: string = '1.0.0';

  /**
   * Reconstruct the raw board object from the granular keys; corrupt values
   * degrade to defaults. Cards are sorted by id because `Y.Map` iterates in
   * its own order, which would otherwise reshuffle `tasks` on every save.
   * `YBoard._get_board` sorts the same way.
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
   * Write the board, touching only changed keys and deleting keys of removed
   * cards, so concurrent edits to different cards merge. A no-op writes
   * nothing and leaves the document clean.
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
      // Drop the keys of tasks no longer on the board.
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

  /** The on-disk `.naavretb` string. */
  getSource(): string {
    return JSON.stringify({ board: this.getBoard() }, null, 2);
  }

  /** Load from the on-disk string; a corrupt file degrades to an empty board. */
  setSource(value: string): void {
    const contents = parseJson(value, {});
    const board =
      contents && typeof contents === 'object' ? (contents as any).board : {};
    this.setBoard(normalizeBoard(board));
  }

  /** Dispose of the resources. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._content.unobserve(this._contentObserver);
    super.dispose();
  }

  /** Factory for the shared model. */
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
