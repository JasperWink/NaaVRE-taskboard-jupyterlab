// Pure helpers for manipulating the board state. Kept side-effect free so they
// are easy to reason about and unit-test; the React components call these and
// persist the result via the board store.

import { IBoardState, ICategory, IColumn, ITask, generateId } from './types';

/**
 * The list of cards to render. Tasks pointing at a column that no longer exists
 * fall back to the first one, so a card can never become unreachable.
 */
export function buildCards(board: IBoardState): ITask[] {
  const firstColumnId = board.columns[0]?.id ?? '';
  const columnIds = new Set(board.columns.map(c => c.id));
  return board.tasks.map(t => ({
    ...t,
    columnId: columnIds.has(t.columnId) ? t.columnId : firstColumnId
  }));
}

/**
 * The cards belonging to a column, sorted by their order.
 */
export function cardsForColumn(cards: ITask[], columnId: string): ITask[] {
  return cards
    .filter(c => c.columnId === columnId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Compute an order value that inserts a card at `index` within `columnCards`
 * (which must already exclude the card being moved). Uses fractional ordering
 * so neighbouring cards never need to be rewritten.
 */
export function orderForInsertion(columnCards: ITask[], index: number): number {
  const prev = columnCards[index - 1];
  const next = columnCards[index];
  if (!prev && !next) {
    return 0;
  }
  if (!prev) {
    return next.order - 1;
  }
  if (!next) {
    return prev.order + 1;
  }
  return (prev.order + next.order) / 2;
}

/**
 * Register a new category on the board. The caller generates the id (so it can
 * immediately reference it, e.g. to assign it to a card).
 */
export function addCategory(
  board: IBoardState,
  category: ICategory
): IBoardState {
  return { ...board, categories: [...board.categories, category] };
}

/**
 * Delete a category and remove it from every card that referenced it.
 */
export function deleteCategory(board: IBoardState, id: string): IBoardState {
  const drop = (ids: string[]) => ids.filter(c => c !== id);
  return {
    ...board,
    categories: board.categories.filter(c => c.id !== id),
    tasks: board.tasks.map(t => ({ ...t, categoryIds: drop(t.categoryIds) }))
  };
}

/**
 * Remember a name on the board's roster, so it can be assigned to other cards
 * without retyping it. Adding a name already on the roster changes nothing —
 * names are the identity here, and duplicates would show up twice in the
 * picker.
 */
export function addPerson(board: IBoardState, name: string): IBoardState {
  const trimmed = name.trim();
  if (!trimmed || board.people.includes(trimmed)) {
    return board;
  }
  return { ...board, people: [...board.people, trimmed] };
}

/**
 * Drop a name from the roster and unassign it from every card, mirroring what
 * deleting a category does. Without the second half the name would vanish from
 * the picker but linger on cards, with no way to remove it.
 */
export function deletePerson(board: IBoardState, name: string): IBoardState {
  return {
    ...board,
    people: board.people.filter(p => p !== name),
    tasks: board.tasks.map(t => ({
      ...t,
      assignees: t.assignees.filter(a => a !== name)
    }))
  };
}

/**
 * Add a new task to the end of a column.
 */
export function addTask(
  board: IBoardState,
  columnId: string,
  fields: {
    title: string;
    description?: string;
    assignees?: string[];
    categoryIds?: string[];
  }
): IBoardState {
  const maxOrder = board.tasks
    .filter(t => t.columnId === columnId)
    .reduce((max, t) => Math.max(max, t.order), 0);
  const task: ITask = {
    id: generateId('task'),
    title: fields.title,
    description: fields.description ?? '',
    columnId,
    assignees: fields.assignees ?? [],
    categoryIds: fields.categoryIds ?? [],
    order: maxOrder + 1
  };
  return { ...board, tasks: [...board.tasks, task] };
}

/**
 * Patch a task: its content (title, description), the people and categories on
 * it, or where it sits (column and order, as set by a drag and drop).
 */
export function updateTask(
  board: IBoardState,
  id: string,
  patch: Partial<Omit<ITask, 'id'>>
): IBoardState {
  return {
    ...board,
    tasks: board.tasks.map(t => (t.id === id ? { ...t, ...patch } : t))
  };
}

export function deleteTask(board: IBoardState, id: string): IBoardState {
  return { ...board, tasks: board.tasks.filter(t => t.id !== id) };
}

export function addColumn(board: IBoardState, title: string): IBoardState {
  const column: IColumn = { id: generateId('col'), title };
  return { ...board, columns: [...board.columns, column] };
}

export function renameColumn(
  board: IBoardState,
  id: string,
  title: string
): IBoardState {
  return {
    ...board,
    columns: board.columns.map(c => (c.id === id ? { ...c, title } : c))
  };
}

/**
 * Delete a column, moving its cards to the first remaining column. Refuses to
 * delete the last column.
 */
export function deleteColumn(board: IBoardState, id: string): IBoardState {
  const remaining = board.columns.filter(c => c.id !== id);
  if (remaining.length === 0) {
    return board;
  }
  const fallbackId = remaining[0].id;
  const tasks = board.tasks.map(t =>
    t.columnId === id ? { ...t, columnId: fallbackId } : t
  );
  return { ...board, columns: remaining, tasks };
}
