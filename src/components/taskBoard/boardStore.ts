import { IBoardState, ITask, defaultBoardState } from './types';

function normalizeAssignees(raw: any): string[] {
  return Array.isArray(raw)
    ? raw.filter(a => typeof a === 'string' && a.length > 0)
    : [];
}

function normalizeCategoryIds(raw: any): string[] {
  return Array.isArray(raw) ? raw.filter(c => typeof c === 'string') : [];
}

/**
 * Coerce whatever was stored (in the shared document) into a valid
 * IBoardState, filling in defaults for anything missing — a board saved by an
 * older version, an empty document, or a first run. Keeping this permissive
 * means the collaborative document can store the board as an opaque JSON blob
 * while the front-end owns the schema.
 */
export function normalizeBoard(raw: unknown): IBoardState {
  const base = defaultBoardState();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const obj = raw as any;
  const columns =
    Array.isArray(obj.columns) && obj.columns.length > 0
      ? obj.columns
      : base.columns;

  const tasks: ITask[] = Array.isArray(obj.tasks)
    ? obj.tasks.map((t: any) => ({
        id: t.id,
        title: t.title ?? '',
        description: t.description ?? '',
        columnId: t.columnId,
        order: typeof t.order === 'number' ? t.order : 0,
        assignees: normalizeAssignees(t.assignees ?? t.assignee),
        categoryIds: normalizeCategoryIds(t.categoryIds)
      }))
    : [];

  return {
    version: 1,
    columns,
    categories: Array.isArray(obj.categories) ? obj.categories : [],
    tasks
  };
}
