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
 * Coerce whatever the shared document holds into a valid IBoardState, filling
 * in defaults. Staying permissive is what lets the document store the board as
 * opaque JSON while the front-end owns the schema.
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

  // Union of the stored roster and every name on a card, so a name can never be
  // on a card but missing from the picker.
  const stored: string[] = Array.isArray(obj.people)
    ? obj.people.filter((p: any) => typeof p === 'string' && p.length > 0)
    : [];
  const people = Array.from(
    new Set([...stored, ...tasks.flatMap(t => t.assignees)])
  );

  return {
    version: 1,
    columns,
    categories: Array.isArray(obj.categories) ? obj.categories : [],
    people,
    tasks
  };
}
