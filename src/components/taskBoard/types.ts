// Data model for the task planning board (Kanban). The board is global to
// JupyterLab and persisted as a collaborative `.naavretb` document
// (src/boardModel.ts). Cards are user-created and derived from nothing.

/** A column ("stage") of the board, e.g. To Do / In Progress / Done. */
export interface IColumn {
  id: string;
  title: string;
}

/** A user-defined category ("label"), rendered as a colored bubble on cards. */
export interface ICategory {
  id: string;
  name: string;
  color: string;
}

/** A task card. Fully editable and deletable from the board. */
export interface ITask {
  id: string;
  title: string;
  description: string;
  columnId: string;
  assignees: string[];
  categoryIds: string[];
  order: number;
}

/**
 * The full persisted board state. `people` is a roster that outlives the cards
 * using it, so a name is typed once and picked from a list after that. Cards
 * store plain names, so the roster is a convenience, not a key.
 */
export interface IBoardState {
  version: 1;
  columns: IColumn[];
  categories: ICategory[];
  people: string[];
  tasks: ITask[];
}

export const DEFAULT_COLUMNS: IColumn[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' }
];

/** Palette offered when creating a new category. */
export const CATEGORY_COLORS: string[] = [
  '#3c8f49',
  '#0f4e8a',
  '#ea5b2d',
  '#8e44ad',
  '#16a085',
  '#d4a017',
  '#c0392b',
  '#2c3e50'
];

export function defaultBoardState(): IBoardState {
  return {
    version: 1,
    columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
    categories: [],
    people: [],
    tasks: []
  };
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
