# Copyright (c) NaaVRE contributors.
# Distributed under the terms of the Apache License 2.0 (see LICENSE).

"""Server-side shared document for NaaVRE ``.naavretb`` task board files.

Real-time collaboration in JupyterLab syncs a Yjs (CRDT) document between every
client *and* the server. ``jupyter_server_ydoc`` looks up the server-side
document class by file type::

    # jupyter_server_ydoc/rooms.py
    self._document = YDOCS.get(self._file_type, YFILE)(self.ydoc, self.awareness)

where ``YDOCS`` is populated from the ``jupyter_ydoc`` entry-point group. Our
file type is ``naavretbdoc`` (see ``src/boardModel.ts`` and ``src/index.ts``);
without a registered class it would fall back to the generic ``YFile`` (a single
``Y.Text``), which does not match the front-end structure. That failure is
silent: the board opens and looks fine, but nothing syncs.

Three names must therefore agree, or the fallback kicks in:

* the entry-point name in ``pyproject.toml``,
* ``BOARD_CONTENT_TYPE`` in ``src/boardModel.ts``,
* the ``contentType`` of the file type registered in ``src/index.ts``.

This class registers a proper server-side document so the server and the
front-end shared model (``src/boardModel.ts`` ``Board``) agree on the CRDT
layout: the board lives in a ``pycrdt.Map`` named ``content``, split across
granular keys — ``columns``, ``categories`` and ``people`` as JSON arrays, plus
one JSON object per card under ``task:<id>`` — exactly how the front-end writes
them.
Matching structures is what lets the board load, sync live between clients, and
save back to disk under RTC.
"""

import json
import sys
from functools import partial
from typing import Any, Callable, Optional

from pycrdt import Awareness, Doc, Map

try:
    from jupyter_ydoc.ybasedoc import YBaseDoc
except AttributeError:
    # jupyter_ydoc eagerly loads every registered entry point when it is first
    # imported (jupyter_ydoc/__init__.py). One of those entry points is this
    # module (see pyproject.toml). If this module is imported *before*
    # jupyter_ydoc finishes initializing, that eager load re-enters here before
    # YBoard is defined and raises AttributeError. The base class itself has
    # already been imported by then, so grab it directly; jupyter_ydoc then
    # re-initializes cleanly on its next import (e.g. from jupyter_server_ydoc),
    # by which point YBoard exists. In the normal server path jupyter_ydoc is
    # imported first and this fallback never runs.
    YBaseDoc = sys.modules["jupyter_ydoc.ybasedoc"].YBaseDoc


def _parse_json(raw: Any, fallback: Any) -> Any:
    """``json.loads`` that degrades to a fallback instead of raising."""
    try:
        return json.loads(raw) if raw else fallback
    except (TypeError, ValueError):
        return fallback


class YBoard(YBaseDoc):
    """A :class:`YBaseDoc` for the NaaVRE task board (``.naavretb`` files).

    The task board is a single, JupyterLab-wide document. Backing it with a
    collaborative file (rather than the browser-local state DB) lets every client
    of the same Jupyter server see the same board, with edits syncing live via
    RTC.

    Schema (mirrors ``Board`` in ``src/boardModel.ts``)::

        {
            "state": YMap,
            "content": YMap[
                "columns": str,      # JSON array
                "categories": str,   # JSON array
                "people": str,       # JSON array of assignee names
                "task:<id>": str,    # one JSON object per task card
            ]
        }

    Storing each card under its own key lets Yjs merge concurrent edits to
    different cards instead of last-write-wins on the whole board. The card
    contents stay opaque JSON strings, so the front-end owns and validates the
    board schema and it can evolve without server changes.
    """

    _TASK_PREFIX = "task:"

    def __init__(self, ydoc: Optional[Doc] = None, awareness: Optional[Awareness] = None):
        super().__init__(ydoc, awareness)
        # Same name ('content') and shape as the front-end
        # `this.ydoc.getMap('content')` in src/boardModel.ts.
        self._ycontent = self._ydoc.get("content", type=Map)

    @property
    def version(self) -> str:
        """Document version, kept in sync with ``Board.version`` (src/boardModel.ts)."""
        return "1.0.0"

    def _get_board(self) -> dict:
        """Reconstruct the board object from the granular content keys.

        Cards are emitted sorted by id. The keys of a ``pycrdt.Map`` come back
        in the map's own order, which is not the order they were inserted in and
        can differ between two documents holding the same board — so without an
        explicit sort, ``get()`` is non-deterministic and every save reshuffles
        the ``tasks`` array on disk. The order carries no meaning (cards are
        placed by ``columnId`` and ``order``), so sorting is free and makes the
        serialization canonical. ``Board.getBoard`` in src/boardModel.ts sorts
        the same way, so a file written by the front end and one written by the
        server are byte-identical.
        """
        keys = set(self._ycontent.keys())

        tasks = []
        for key in keys:
            if key.startswith(self._TASK_PREFIX):
                task = _parse_json(self._ycontent.get(key), None)
                if task is not None:
                    tasks.append(task)
        tasks.sort(key=lambda t: str(t.get("id", "")) if isinstance(t, dict) else "")

        # Insertion order here is the key order of the emitted JSON, and must
        # match `Board.getBoard` in src/boardModel.ts: version, columns,
        # categories, people, tasks. A missing key is left out entirely,
        # mirroring the
        # `undefined` fallback there (JSON.stringify drops those).
        board = {"version": 1}
        for key in ("columns", "categories", "people"):
            if key in keys:
                board[key] = _parse_json(self._ycontent.get(key), [])
        board["tasks"] = tasks
        return board

    def get(self) -> str:
        """Serialize the shared document to the on-disk ``.naavretb`` string.

        Called by the server when saving. Produces the same ``{"board": ...}``
        JSON the front-end writes, so files stay identical whether saved with or
        without collaboration enabled.
        """
        return json.dumps({"board": self._get_board()}, indent=2)

    def set(self, value: str) -> None:
        """Populate the shared document from the on-disk ``.naavretb`` string.

        Called by the server when loading the file. Splits the board across the
        granular keys the front-end reads back (src/boardModel.ts ``getBoard``),
        writing only the keys that changed and dropping the keys of cards that
        are no longer present.
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
