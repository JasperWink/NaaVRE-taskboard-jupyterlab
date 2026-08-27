import { Board } from '../../boardModel';
import { defaultBoardState, IBoardState, ITask } from './types';
import { normalizeBoard } from './boardStore';

function makeTask(id: string, title: string): ITask {
  return {
    id,
    title,
    description: '',
    columnId: 'todo',
    assignees: [],
    categoryIds: [],
    order: 0
  };
}

function makeBoard(tasks: ITask[]): IBoardState {
  return { ...defaultBoardState(), tasks };
}

describe('Board (shared model)', () => {
  it('round-trips a board through the granular keys', () => {
    const board = new Board();
    const state = makeBoard([makeTask('t1', 'A'), makeTask('t2', 'B')]);
    board.setBoard(state);
    expect(normalizeBoard(board.getBoard())).toEqual(state);
  });

  it('serializes to and from the on-disk format', () => {
    const board = new Board();
    board.setBoard(makeBoard([makeTask('t1', 'A')]));
    const source = board.getSource();

    const board2 = new Board();
    board2.setSource(source);
    expect(normalizeBoard(board2.getBoard())).toEqual(
      normalizeBoard(board.getBoard())
    );
  });

  it('degrades to an empty board on a corrupt file instead of throwing', () => {
    const board = new Board();
    expect(() => board.setSource('{not json')).not.toThrow();
    expect(normalizeBoard(board.getBoard())).toEqual(defaultBoardState());
  });

  it('removes keys of deleted tasks', () => {
    const board = new Board();
    board.setBoard(makeBoard([makeTask('t1', 'A'), makeTask('t2', 'B')]));
    board.setBoard(makeBoard([makeTask('t2', 'B')]));
    expect(normalizeBoard(board.getBoard()).tasks.map(t => t.id)).toEqual([
      't2'
    ]);
  });

  it('does not emit a change for a no-op write', () => {
    const board = new Board();
    const state = makeBoard([makeTask('t1', 'A')]);
    board.setBoard(state);
    let changes = 0;
    board.changed.connect(() => {
      changes += 1;
    });
    board.setBoard(state);
    expect(changes).toBe(0);
  });
});
