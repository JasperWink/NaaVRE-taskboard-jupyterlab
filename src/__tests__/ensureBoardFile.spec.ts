import { ServerConnection } from '@jupyterlab/services';

import { BOARD_PATH, ensureBoardFile } from '../commands';

function notFound(): ServerConnection.ResponseError {
  return new ServerConnection.ResponseError({ status: 404 } as Response);
}

function serverError(): ServerConnection.ResponseError {
  return new ServerConnection.ResponseError({ status: 503 } as Response);
}

/**
 * The slice of JupyterFrontEnd that ensureBoardFile touches. `present` is the
 * server's view of whether the file exists and `save` flips it, so the fake
 * behaves like a contents manager rather than just recording calls.
 */
function fakeApp(options: { present: boolean; getFails?: () => unknown }) {
  let present = options.present;
  const get = jest.fn(async () => {
    if (options.getFails) {
      throw options.getFails();
    }
    if (!present) {
      throw notFound();
    }
    return {};
  });
  const save = jest.fn(async () => {
    present = true;
    return {};
  });
  return {
    app: { serviceManager: { contents: { get, save } } } as any,
    get,
    save,
    exists: () => present
  };
}

describe('ensureBoardFile', () => {
  it('creates the board when the server does not have one', async () => {
    const f = fakeApp({ present: false });
    await ensureBoardFile(f.app);

    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.save).toHaveBeenCalledWith(
      BOARD_PATH,
      expect.objectContaining({ type: 'file', format: 'text' })
    );
    expect(f.exists()).toBe(true);
  });

  it('leaves an existing board alone', async () => {
    const f = fakeApp({ present: true });
    await ensureBoardFile(f.app);
    expect(f.save).not.toHaveBeenCalled();
  });

  it('refuses to write when the server is failing for any other reason', async () => {
    // Treating a 503 as "missing" would write an empty board over a real one.
    const f = fakeApp({ present: true, getFails: serverError });
    await expect(ensureBoardFile(f.app)).rejects.toBeInstanceOf(
      ServerConnection.ResponseError
    );
    expect(f.save).not.toHaveBeenCalled();
  });

  it('issues a single check when several callers race', async () => {
    // Each redundant save writes around any live collaboration room, so the
    // concurrent callers must collapse into one check.
    const f = fakeApp({ present: false });
    await Promise.all([
      ensureBoardFile(f.app),
      ensureBoardFile(f.app),
      ensureBoardFile(f.app)
    ]);
    expect(f.save).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh check after the previous one settled', async () => {
    const f = fakeApp({ present: false });
    await ensureBoardFile(f.app);
    await ensureBoardFile(f.app);
    // The second call re-checks and finds the file this time.
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.get.mock.calls.length).toBeGreaterThan(1);
  });

  it('accepts losing the race to another client', async () => {
    // Another client created it between our check and our write; not an error.
    let present = false;
    const get = jest.fn(async () => {
      if (!present) {
        throw notFound();
      }
      return {};
    });
    const save = jest.fn(async () => {
      present = true; // the other client's file is now there
      throw new Error('409 Conflict');
    });
    const app = { serviceManager: { contents: { get, save } } } as any;

    await expect(ensureBoardFile(app)).resolves.toBeUndefined();
  });

  it('reports a write failure that left no board behind', async () => {
    const get = jest.fn(async () => {
      throw notFound();
    });
    const save = jest.fn(async () => {
      throw new Error('disk full');
    });
    const app = { serviceManager: { contents: { get, save } } } as any;

    await expect(ensureBoardFile(app)).rejects.toThrow('disk full');
  });
});
