import {
  addCategory,
  addColumn,
  addPerson,
  addTask,
  buildCards,
  cardsForColumn,
  deleteCategory,
  deleteColumn,
  deletePerson,
  deleteTask,
  orderForInsertion,
  renameColumn,
  updateTask
} from './boardLogic';
import { IBoardState, ITask, defaultBoardState } from './types';

function task(id: string, patch: Partial<ITask> = {}): ITask {
  return {
    id,
    title: id,
    description: '',
    columnId: 'todo',
    assignees: [],
    categoryIds: [],
    order: 0,
    ...patch
  };
}

function board(patch: Partial<IBoardState> = {}): IBoardState {
  return { ...defaultBoardState(), ...patch };
}

describe('buildCards', () => {
  it('leaves cards on columns that exist', () => {
    const b = board({ tasks: [task('t1', { columnId: 'done' })] });
    expect(buildCards(b)[0].columnId).toBe('done');
  });

  it('rehomes a card whose column was removed, so it stays reachable', () => {
    const b = board({ tasks: [task('t1', { columnId: 'deleted-column' })] });
    expect(buildCards(b)[0].columnId).toBe('todo');
  });

  it('does not mutate the board it was given', () => {
    const b = board({ tasks: [task('t1', { columnId: 'gone' })] });
    buildCards(b);
    expect(b.tasks[0].columnId).toBe('gone');
  });

  it('survives a board with no columns at all', () => {
    const b = board({ columns: [], tasks: [task('t1')] });
    expect(buildCards(b)[0].columnId).toBe('');
  });
});

describe('cardsForColumn', () => {
  it('returns only that column, sorted by order', () => {
    const cards = [
      task('c', { order: 2 }),
      task('a', { order: 0 }),
      task('other', { columnId: 'done', order: 1 }),
      task('b', { order: 1 })
    ];
    expect(cardsForColumn(cards, 'todo').map(c => c.id)).toEqual([
      'a',
      'b',
      'c'
    ]);
  });

  it('sorts numerically, not lexicographically', () => {
    const cards = [task('ten', { order: 10 }), task('two', { order: 2 })];
    expect(cardsForColumn(cards, 'todo').map(c => c.id)).toEqual([
      'two',
      'ten'
    ]);
  });
});

describe('orderForInsertion', () => {
  // Fractional ordering: inserting between two cards must not renumber their
  // neighbours, because every rewritten card is another key written to the
  // shared document and another chance for two clients to conflict.
  it('is 0 for the first card in an empty column', () => {
    expect(orderForInsertion([], 0)).toBe(0);
  });

  it('goes before the first card when inserting at the head', () => {
    const cards = [task('a', { order: 5 })];
    expect(orderForInsertion(cards, 0)).toBeLessThan(5);
  });

  it('goes after the last card when inserting at the tail', () => {
    const cards = [task('a', { order: 5 })];
    expect(orderForInsertion(cards, 1)).toBeGreaterThan(5);
  });

  it('lands strictly between the two neighbours', () => {
    const cards = [task('a', { order: 1 }), task('b', { order: 2 })];
    const order = orderForInsertion(cards, 1);
    expect(order).toBeGreaterThan(1);
    expect(order).toBeLessThan(2);
  });

  it('keeps the intended position after repeated inserts into the same gap', () => {
    // Drag a card into the same slot ten times over; the ordering must still
    // place it between its neighbours rather than collapsing onto one of them.
    let cards = [task('a', { order: 0 }), task('b', { order: 1 })];
    for (let i = 0; i < 10; i++) {
      const order = orderForInsertion(cards, 1);
      expect(order).toBeGreaterThan(cards[0].order);
      expect(order).toBeLessThan(cards[1].order);
      cards = [cards[0], task(`x${i}`, { order }), cards[1]];
      cards = cardsForColumn(cards, 'todo');
      cards = [cards[0], cards[1]];
    }
  });
});

describe('addTask', () => {
  it('appends to the end of the target column', () => {
    let b = board({ tasks: [task('t1', { order: 7 })] });
    b = addTask(b, 'todo', { title: 'New' });
    const added = b.tasks[b.tasks.length - 1];
    expect(added.order).toBeGreaterThan(7);
    expect(added.columnId).toBe('todo');
  });

  it('fills in defaults for the fields the caller omitted', () => {
    const b = addTask(board(), 'todo', { title: 'Only a title' });
    expect(b.tasks[0]).toEqual(
      expect.objectContaining({
        title: 'Only a title',
        description: '',
        assignees: [],
        categoryIds: []
      })
    );
    expect(b.tasks[0].id).toBeTruthy();
  });

  it('gives every card a distinct id', () => {
    let b = board();
    for (let i = 0; i < 50; i++) {
      b = addTask(b, 'todo', { title: `t${i}` });
    }
    expect(new Set(b.tasks.map(t => t.id)).size).toBe(50);
  });

  it('keeps the description, assignees and categories the caller passed', () => {
    const b = addTask(board(), 'todo', {
      title: 'Full',
      description: 'A description',
      assignees: ['Ada'],
      categoryIds: ['c1']
    });
    expect(b.tasks[0]).toEqual(
      expect.objectContaining({
        description: 'A description',
        assignees: ['Ada'],
        categoryIds: ['c1']
      })
    );
  });

  it('only considers the target column when picking an order', () => {
    const b = addTask(
      board({ tasks: [task('big', { columnId: 'done', order: 99 })] }),
      'todo',
      {
        title: 'New'
      }
    );
    expect(b.tasks[b.tasks.length - 1].order).toBe(1);
  });
});

describe('updateTask', () => {
  it('patches only the named card', () => {
    const b = updateTask(board({ tasks: [task('t1'), task('t2')] }), 't1', {
      title: 'Changed'
    });
    expect(b.tasks[0].title).toBe('Changed');
    expect(b.tasks[1].title).toBe('t2');
  });

  it('is a no-op for an unknown id', () => {
    const before = board({ tasks: [task('t1')] });
    expect(updateTask(before, 'nope', { title: 'x' }).tasks).toEqual(
      before.tasks
    );
  });
});

describe('deleteTask', () => {
  it('removes just that card', () => {
    const b = deleteTask(board({ tasks: [task('t1'), task('t2')] }), 't1');
    expect(b.tasks.map(t => t.id)).toEqual(['t2']);
  });
});

describe('columns', () => {
  it('adds a column with a generated id', () => {
    const b = addColumn(board(), 'Review');
    const added = b.columns[b.columns.length - 1];
    expect(added.title).toBe('Review');
    expect(added.id).toBeTruthy();
  });

  it('renames only the named column', () => {
    const b = renameColumn(board(), 'todo', 'Backlog');
    expect(b.columns.find(c => c.id === 'todo')?.title).toBe('Backlog');
    expect(b.columns.find(c => c.id === 'done')?.title).toBe('Done');
  });

  it('moves the cards of a deleted column to the first remaining one', () => {
    const b = deleteColumn(
      board({ tasks: [task('t1', { columnId: 'in-progress' })] }),
      'in-progress'
    );
    expect(b.columns.map(c => c.id)).toEqual(['todo', 'done']);
    expect(b.tasks[0].columnId).toBe('todo');
  });

  it('refuses to delete the last column, so cards keep a home', () => {
    const single = board({
      columns: [{ id: 'only', title: 'Only' }],
      tasks: [task('t1', { columnId: 'only' })]
    });
    expect(deleteColumn(single, 'only')).toEqual(single);
  });
});

describe('categories', () => {
  it('adds a category', () => {
    const b = addCategory(board(), { id: 'c1', name: 'Bug', color: '#c0392b' });
    expect(b.categories).toEqual([{ id: 'c1', name: 'Bug', color: '#c0392b' }]);
  });

  it('deleting a category also strips it from every card that used it', () => {
    const b = deleteCategory(
      board({
        categories: [
          { id: 'c1', name: 'Bug', color: '#c0392b' },
          { id: 'c2', name: 'Docs', color: '#0f4e8a' }
        ],
        tasks: [
          task('t1', { categoryIds: ['c1', 'c2'] }),
          task('t2', { categoryIds: ['c1'] })
        ]
      }),
      'c1'
    );
    expect(b.categories.map(c => c.id)).toEqual(['c2']);
    expect(b.tasks[0].categoryIds).toEqual(['c2']);
    expect(b.tasks[1].categoryIds).toEqual([]);
  });
});

describe('people', () => {
  // The roster is what makes a name reusable: typed once on one card, then
  // picked from a list on every other card.
  it('remembers a name so it can be assigned again later', () => {
    expect(addPerson(board(), 'Ada').people).toEqual(['Ada']);
  });

  it('keeps the roster free of duplicates', () => {
    let b = addPerson(board(), 'Ada');
    b = addPerson(b, 'Ada');
    expect(b.people).toEqual(['Ada']);
  });

  it('trims the name, so " Ada " and "Ada" are the same person', () => {
    let b = addPerson(board(), '  Ada  ');
    b = addPerson(b, 'Ada');
    expect(b.people).toEqual(['Ada']);
  });

  it('ignores an empty or blank name', () => {
    expect(addPerson(board(), '   ').people).toEqual([]);
    expect(addPerson(board(), '').people).toEqual([]);
  });

  it('preserves the order names were added in', () => {
    let b = board();
    for (const n of ['Ada', 'Grace', 'Alan']) {
      b = addPerson(b, n);
    }
    expect(b.people).toEqual(['Ada', 'Grace', 'Alan']);
  });

  it('deleting someone removes them from the roster and every card', () => {
    const b = deletePerson(
      board({
        people: ['Ada', 'Grace'],
        tasks: [
          task('t1', { assignees: ['Ada', 'Grace'] }),
          task('t2', { assignees: ['Ada'] })
        ]
      }),
      'Ada'
    );
    expect(b.people).toEqual(['Grace']);
    expect(b.tasks[0].assignees).toEqual(['Grace']);
    expect(b.tasks[1].assignees).toEqual([]);
  });

  it('deleting an unknown name changes nothing', () => {
    const before = board({ people: ['Ada'], tasks: [task('t1')] });
    const after = deletePerson(before, 'Nobody');
    expect(after.people).toEqual(['Ada']);
    expect(after.tasks).toEqual(before.tasks);
  });
});

describe('immutability', () => {
  // Every helper returns a new board; the React components rely on identity
  // changing to re-render, and the shared model diffs against the old value.
  const base = board({
    categories: [{ id: 'c1', name: 'Bug', color: '#c0392b' }],
    people: ['Ada'],
    tasks: [task('t1', { categoryIds: ['c1'], assignees: ['Ada'] })]
  });

  const cases: [string, (b: IBoardState) => IBoardState][] = [
    ['addTask', b => addTask(b, 'todo', { title: 'x' })],
    ['updateTask', b => updateTask(b, 't1', { title: 'x' })],
    ['deleteTask', b => deleteTask(b, 't1')],
    ['addColumn', b => addColumn(b, 'x')],
    ['renameColumn', b => renameColumn(b, 'todo', 'x')],
    ['deleteColumn', b => deleteColumn(b, 'done')],
    [
      'addCategory',
      b => addCategory(b, { id: 'c2', name: 'x', color: '#000' })
    ],
    ['deleteCategory', b => deleteCategory(b, 'c1')],
    ['addPerson', b => addPerson(b, 'Grace')],
    ['deletePerson', b => deletePerson(b, 'Ada')]
  ];

  it.each(cases)(
    '%s returns a new board and leaves the old one alone',
    (_name, fn) => {
      const snapshot = JSON.parse(JSON.stringify(base));
      const next = fn(base);
      expect(next).not.toBe(base);
      expect(base).toEqual(snapshot);
    }
  );
});
