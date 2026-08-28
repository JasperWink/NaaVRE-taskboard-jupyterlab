import { normalizeBoard } from './boardStore';
import { DEFAULT_COLUMNS, defaultBoardState } from './types';

// normalizeBoard is the only thing standing between whatever is in the
// `.naavretb` file (or the shared document) and the React components, which
// index into these fields without checking. Anything it lets through is a
// runtime error in the UI, so it has to be permissive about input and strict
// about output.

describe('normalizeBoard', () => {
  describe('degrades to an empty board rather than throwing', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not a board'],
      ['a number', 42],
      ['an array', []]
    ])('on %s', (_label, input) => {
      expect(normalizeBoard(input)).toEqual(defaultBoardState());
    });
  });

  it('gives a brand-new board the default columns', () => {
    expect(normalizeBoard({}).columns).toEqual(DEFAULT_COLUMNS);
  });

  it('falls back to the default columns when the file has an empty list', () => {
    // An empty column list would leave every card unreachable and the board
    // unusable, with no way to add a column back.
    expect(normalizeBoard({ columns: [] }).columns).toEqual(DEFAULT_COLUMNS);
  });

  it('keeps the columns the file does define', () => {
    const columns = [{ id: 'a', title: 'A' }];
    expect(normalizeBoard({ columns }).columns).toEqual(columns);
  });

  it('always produces the arrays the components iterate over', () => {
    const b = normalizeBoard({ tasks: 'nope', categories: 'nope' });
    expect(Array.isArray(b.tasks)).toBe(true);
    expect(Array.isArray(b.categories)).toBe(true);
  });

  it('fills in missing fields on a partial card', () => {
    const b = normalizeBoard({ tasks: [{ id: 't1', columnId: 'todo' }] });
    expect(b.tasks[0]).toEqual({
      id: 't1',
      title: '',
      description: '',
      columnId: 'todo',
      order: 0,
      assignees: [],
      categoryIds: []
    });
  });

  it('migrates a single `assignee` to the `assignees` list', () => {
    // Older boards stored one name per card.
    const b = normalizeBoard({
      tasks: [{ id: 't1', columnId: 'todo', assignee: ['Ada'] }]
    });
    expect(b.tasks[0].assignees).toEqual(['Ada']);
  });

  it('drops assignee entries that are not usable names', () => {
    const b = normalizeBoard({
      tasks: [
        { id: 't1', columnId: 'todo', assignees: ['Ada', '', null, 7, 'Bob'] }
      ]
    });
    expect(b.tasks[0].assignees).toEqual(['Ada', 'Bob']);
  });

  it('drops category ids that are not strings', () => {
    const b = normalizeBoard({
      tasks: [{ id: 't1', columnId: 'todo', categoryIds: ['c1', 3, null] }]
    });
    expect(b.tasks[0].categoryIds).toEqual(['c1']);
  });

  it('replaces a non-numeric order with 0 so sorting stays total', () => {
    const b = normalizeBoard({
      tasks: [{ id: 't1', columnId: 'todo', order: 'first' }]
    });
    expect(b.tasks[0].order).toBe(0);
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    const once = normalizeBoard({
      columns: [{ id: 'a', title: 'A' }],
      categories: [{ id: 'c1', name: 'Bug', color: '#c0392b' }],
      tasks: [{ id: 't1', columnId: 'a', title: 'T', order: 3 }]
    });
    expect(normalizeBoard(once)).toEqual(once);
  });

  describe('the people roster', () => {
    it('keeps the names the board stored', () => {
      expect(normalizeBoard({ people: ['Ada', 'Grace'] }).people).toEqual([
        'Ada',
        'Grace'
      ]);
    });

    it('seeds itself from the cards on a board saved before it existed', () => {
      // Boards written by an earlier version have no `people` key. Deriving it
      // from the cards means those names are pickable straight away instead of
      // having to be retyped.
      const b = normalizeBoard({
        tasks: [
          { id: 't1', columnId: 'todo', assignees: ['Ada'] },
          { id: 't2', columnId: 'todo', assignees: ['Grace', 'Ada'] }
        ]
      });
      expect(b.people.sort()).toEqual(['Ada', 'Grace']);
    });

    it('never lists someone who is on a card but missing from the roster', () => {
      const b = normalizeBoard({
        people: ['Ada'],
        tasks: [{ id: 't1', columnId: 'todo', assignees: ['Grace'] }]
      });
      expect(b.people).toEqual(['Ada', 'Grace']);
    });

    it('does not repeat a name that is both stored and on a card', () => {
      const b = normalizeBoard({
        people: ['Ada'],
        tasks: [{ id: 't1', columnId: 'todo', assignees: ['Ada'] }]
      });
      expect(b.people).toEqual(['Ada']);
    });

    it('keeps people who are on the roster but assigned to nothing', () => {
      expect(normalizeBoard({ people: ['Ada'], tasks: [] }).people).toEqual([
        'Ada'
      ]);
    });

    it('drops entries that are not usable names', () => {
      expect(
        normalizeBoard({ people: ['Ada', '', null, 7, 'Grace'] }).people
      ).toEqual(['Ada', 'Grace']);
    });

    it('recovers from a roster that is not a list', () => {
      expect(normalizeBoard({ people: 'Ada' }).people).toEqual([]);
    });
  });

  it('always stamps the current version', () => {
    expect(normalizeBoard({ version: 99 }).version).toBe(1);
  });
});
