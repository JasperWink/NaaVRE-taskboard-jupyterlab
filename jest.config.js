const jestJupyterLab = require('@jupyterlab/testutils/lib/jest-config');

// Packages published as ESM, which jest must transform rather than require().
// @jupyter/react-components and its dependencies come in via
// @jupyterlab/ui-components (LabIcon), so anything importing src/icons.tsx —
// directly or through src/commands.ts — needs them listed here.
const esModules = [
  '@codemirror',
  '@jupyter/react-components',
  '@jupyter/web-components',
  '@jupyter/ydoc',
  '@jupyterlab/',
  '@microsoft',
  'exenv-es6',
  'lib0',
  'nanoid',
  'vscode-ws-jsonrpc',
  'y-protocols',
  'y-websocket',
  'yjs'
].join('|');

const baseConfig = jestJupyterLab(__dirname);

module.exports = {
  ...baseConfig,
  automock: false,
  // Both the built labextension and an editable install's copy of it carry a
  // package.json with this package's own "name", which jest's haste map
  // reports as a duplicate-module collision. Neither is a source tree.
  modulePathIgnorePatterns: [
    '<rootDir>/venv/',
    '<rootDir>/NaaVRE_taskboard_jupyterlab/labextension/'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/.ipynb_checkpoints/*'
  ],
  coverageReporters: ['lcov', 'text'],
  testRegex: 'src/.*/.*.spec.ts[x]?$',
  transformIgnorePatterns: [`/node_modules/(?!${esModules}).+`]
};
