# Copyright (c) NaaVRE contributors.
# Distributed under the terms of the Apache License 2.0 (see LICENSE).

"""Server-side shared document for NaaVRE ``.naavretb`` task board files.

``jupyter_server_ydoc`` resolves the server-side document class by file type
(``YDOCS.get(file_type, YFILE)``), so three names must agree or it silently
falls back to the generic ``YFile`` and the board stops syncing:

* the entry-point name in ``pyproject.toml``,
* ``BOARD_CONTENT_TYPE`` in ``src/boardModel.ts``,
* the ``contentType`` registered in ``src/index.ts``.

:class:`YBoard` mirrors the front-end shared model (``Board``) so both agree on
the CRDT layout; see its docstring for the schema.
"""

import json
import sys
from functools import partial
from typing import Any, Callable, Optional

from pycrdt import Awareness, Doc, Map

try:
    from jupyter_ydoc.ybasedoc import YBaseDoc
except AttributeError:
    # jupyter_ydoc eagerly loads its entry points on first import, one of which
    # is this module. Importing this module first re-enters here before YBoard
    # exists; the base class is already loaded, so take it directly. Never runs
    # on the normal server path.
    YBaseDoc = sys.modules["jupyter_ydoc.ybasedoc"].YBaseDoc


def _parse_json(raw: Any, fallback: Any) -> Any:
    """``json.loads`` that degrades to a fallback instead of raising."""
    try:
        return json.loads(raw) if raw else fallback
    except (TypeError, ValueError):
        return fallback


class YBoard(YBaseDoc):
    """A :class:`YBaseDoc` for the NaaVRE task board (``.naavretb`` files).

    One JupyterLab-wide document, so every client of the same Jupyter server
    sees the same board. Schema (mirrors ``Board`` in ``src/boardModel.ts``)::

        {
            "state": YMap,
            "content": YMap[
                "columns": str,      # JSON array
                "categories": str,   # JSON array
                "people": str,       # JSON array of assignee names
                "task:<id>": str,    # one JSON object per task card
            ]
        }

    Per-card keys let Yjs merge concurrent edits to different cards. Values stay
    opaque JSON, so the front-end owns the schema and can evolve it alone.
    """

    _TASK_PREFIX = "task:"

    def __init__(self, ydoc: Optional[Doc] = None, awareness: Optional[Awareness] = None):
        super().__init__(ydoc, awareness)
        # Same name ('content') and shape as the front-end
        # `this.ydoc.getMap('content')` in src/boardModel.ts.
        self._ycontent = self._ydoc.get("content", type=Map)

    @property
    def version(self) -> str:
        """Kept in sync with ``Board.version`` (src/boardModel.ts)."""
        return "1.0.0"

    def _get_board(self) -> dict:
        """Reconstruct the board object from the granular content keys.

        Cards are sorted by id: a ``pycrdt.Map`` returns keys in its own order,
        so without this every save reshuffles ``tasks`` on disk. Card order
        carries no meaning (they are placed by ``columnId`` and ``order``).
        ``Board.getBoard`` sorts the same way, so files written by the front end
        and by the server are byte-identical.
        """
        keys = set(self._ycontent.keys())

        tasks = []
        for key in keys:
            if key.startswith(self._TASK_PREFIX):
                task = _parse_json(self._ycontent.get(key), None)
                if task is not None:
                    tasks.append(task)
        tasks.sort(key=lambda t: str(t.get("id", "")) if isinstance(t, dict) else "")

        # Key order must match `Board.getBoard`; a missing key is left out
        # entirely, mirroring the `undefined` fallback there.
        board = {"version": 1}
        for key in ("columns", "categories", "people"):
            if key in keys:
                board[key] = _parse_json(self._ycontent.get(key), [])
        board["tasks"] = tasks
        return board

    def get(self) -> str:
        """Serialize to the on-disk ``.naavretb`` string, called when saving.

        Produces the same ``{"board": ...}`` JSON the front-end writes, so files
        match with or without collaboration enabled.
        """
        return json.dumps({"board": self._get_board()}, indent=2)

    def set(self, value: str) -> None:
        """Populate the shared document from the on-disk string, when loading.

        Splits the board across the granular keys the front-end reads back,
        writing only changed keys and dropping those of removed cards.
        """
        contents = _parse_json(value, {})
        board = contents.get("board", {}) if isinstance(contents, dict) else {}
        if not isinstance(board, dict):
            board = {}
        desired = {}
        for key in ("columns", "categories", "people"):
            if key in board:
                desired[key] = json.dumps(board[key])
        tasks = board.get("tasks")
        if isinstance(tasks, list):
            for task in tasks:
                if isinstance(task, dict) and "id" in task:
                    desired[f"{self._TASK_PREFIX}{task['id']}"] = json.dumps(task)
        with self._ydoc.transaction():
            for key in list(self._ycontent.keys()):
                if key not in desired:
                    del self._ycontent[key]
            for key, val in desired.items():
                if self._ycontent.get(key) != val:
                    self._ycontent[key] = val

    def observe(self, callback: Callable[[str, Any], None]) -> None:
        """Subscribe to document changes (state + content)."""
        self.unobserve()
        self._subscriptions[self._ystate] = self._ystate.observe(
            partial(callback, "state")
        )
        self._subscriptions[self._ycontent] = self._ycontent.observe(
            partial(callback, "content")
        )
