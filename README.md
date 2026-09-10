# NaaVRE_taskboard_jupyterlab

[![Github Actions Status](https://github.com/JasperWink/NaaVRE-taskboard-jupyterlab/workflows/Build/badge.svg)](https://github.com/JasperWink/NaaVRE-taskboard-jupyterlab/actions/workflows/build.yml)

NaaVRE collaborative task board on Jupyter Lab

## What it is

A Kanban board that lives in JupyterLab: columns, cards, categories and a roster of people. It is backed by a single collaborative document, so everyone sharing a Jupyter server sees the same board and edits appear live.

- **One board per Jupyter server.** The board is the file `taskboard.naavretb` at the root of the notebook directory. That path is the sharing mechanism — every client opens the same path, so they all land in the same Yjs room. The scope of "shared" is therefore exactly one server: on a deployment where each user gets their own server, each user gets their own board.
- **Created on demand.** The file is written on first use if it does not exist.
- **Opened like any document.** From the file browser.

Cards can also be created by other extensions — see [Command API](#command-api) below.

## Requirements

- JupyterLab >= 4.0.0
- **For collaboration:** Python >= 3.10 and JupyterLab >= 4.5, < 4.6. See the `collaboration`
  extra in `pyproject.toml`; the pins there are deliberate and explained in place. Without it the board still opens, but each client edits its own copy of the file rather than one shared document — which is the whole point of the board.

## Install

This extension is not published to PyPI. Install it from source:

```bash
git clone https://github.com/JasperWink/NaaVRE-taskboard-jupyterlab
cd NaaVRE-taskboard-jupyterlab
./run.sh
```

## Command API

Commands are the board's entire public surface. Other extensions add cards by executing a command through `app.commands`, never by importing from this package — so neither repository depends on the other, and the board stays optional.

| Command | Arguments | Effect |
|---|---|---|
| `naavre-taskboard:open` | none | Opens the shared board, creating it if missing, and focuses it |
| `naavre-taskboard:add-task` | `{ title: string; description?: string }` | Adds a card to the first column |

```ts
// Guard first: the board may not be installed.
if (app.commands.hasCommand('naavre-taskboard:add-task')) {
  await app.commands.execute('naavre-taskboard:add-task', {
    title: 'Load raster',
    description: 'Read the input GeoTIFF and return an array.'
  });
}
```

The command ids and their argument names are a contract — **additive changes only**. A consumer discovers the board with `hasCommand`, so a renamed command does not raise an error; the calling feature silently disappears. `NaaVRE-workflow-jupyterlab` consumes this API from `src/boardAccess.ts`.

A card is an independent copy: nothing links it back to whatever created it, and editing the card does not change the source.

## Running with the workflow extension

Both extensions must load into **one** JupyterLab. The command registry that connects them belongs to a single browser page, and the collaboration server resolves both `naavrewfdoc` and `naavretbdoc` from `jupyter_ydoc` entry points registered in the environment serving them. Split them across two environments and the workflow extension's button silently never renders, while the board falls back to a generic document and stops syncing.

Use the orchestrator one level up, which installs every extension in the folder into one
environment and launches a single JupyterLab:

```bash
cd ..
./run.sh
```

## Uninstall

```bash
pip uninstall NaaVRE_taskboard_jupyterlab
```

## Contributing

### Development install

`./run.sh` creates a virtual environment, installs and builds the extension, and starts JupyterLab. 
It takes no options.

<details>
<summary>Manual setup, if you would rather not use the script</summary>

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Create a virtual environment and activate it — Python 3.10+ for collaboration
python3 -m venv venv
. venv/bin/activate
pip install 'jupyterlab>=4.0.0,<5'
# Install package in development mode. The [collaboration] extra is what makes
# the board shared rather than per-client; without it nothing errors, the board
# simply stops being collaborative.
pip install -e ".[collaboration]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

</details>

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab --notebook-dir ./notebook-dir
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
pip uninstall NaaVRE_taskboard_jupyterlab
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop` command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions` folder is located. Then you can remove the symlink named `@naavre/taskboard-jupyterlab` within that folder.

### Code layout

| Path | What lives there |
|---|---|
| `src/index.ts` | Plugin activation: file type, factories, RTC wiring, layout restoration |
| `src/commands.ts` | The public command surface and the board file's lifecycle |
| `src/boardModel.ts` | Shared Yjs model — cards under `task:<id>` keys, so concurrent card edits merge |
| `src/sharedDocumentModel.ts` | Document-model boilerplate, forked from the workflow extension |
| `src/components/taskBoard/types.ts` | `IBoardState` and defaults |
| `src/components/taskBoard/boardLogic.ts` | Pure state transitions — where most of the test coverage sits |
| `src/components/taskBoard/boardStore.ts` | Coerces whatever the shared document holds into a valid state |
| `NaaVRE_taskboard_jupyterlab/ydoc.py` | Server-side `YBoard`, registered as the `naavretbdoc` entry point |

Two pieces are deliberately **copied** from `NaaVRE-workflow-jupyterlab` rather than shared, so that neither repository build-depends on the other: `src/sharedDocumentModel.ts` and `getVariableColor` in `src/components/taskBoard/avatarUtils.ts`. Fix bugs in both.

### Testing the extension

#### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```sh
jlpm
jlpm test
```

#### Server tests

`tests/test_ydoc.py` checks the server-side document, including that the `jupyter_ydoc` entry point actually resolves to `YBoard` rather than the generic `YFile` — a mismatch there stops the board syncing without any error.

```sh
pip install -e ".[test]"
pytest tests/
```

#### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

More information are provided within the [ui-tests](./ui-tests/README.md) README.

`dev/check-sharing.py` is a manual integration check that drives two independent clients against one board, for verifying that collaboration actually works end to end.

### Packaging the extension

See [RELEASE](RELEASE.md)
