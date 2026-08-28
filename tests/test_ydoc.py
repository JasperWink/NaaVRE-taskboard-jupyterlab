"""Tests for the server-side shared document (NaaVRE_taskboard_jupyterlab.ydoc).

Two things are checked here that nothing else catches:

1. That ``jupyter_ydoc`` actually resolves our file type to :class:`YBoard`.
   ``jupyter_server_ydoc`` looks the class up with ``YDOCS.get(file_type, YFILE)``
   — a rename on either side falls back to the generic ``YFile`` with no error
   at all, and the board simply stops syncing.

2. That ``get()`` is deterministic. The keys of a ``pycrdt.Map`` come back in
   the map's own order, so without an explicit sort the ``tasks`` array is
   reshuffled on every save and the ``.naavretb`` file churns.
"""

import json

import pytest

from NaaVRE_taskboard_jupyterlab.ydoc import YBoard

CONTENT_TYPE = "naavretbdoc"


def board_json(tasks=(), columns=None, categories=(), people=()):
    if columns is None:
        columns = [{"id": "todo", "title": "To Do"}, {"id": "done", "title": "Done"}]
    return json.dumps(
        {
            "board": {
                "version": 1,
                "columns": columns,
                "categories": list(categories),
                "people": list(people),
                "tasks": list(tasks),
            }
        }
    )


def task(id_, **patch):
    base = {
        "id": id_,
        "title": id_,
        "description": "",
        "columnId": "todo",
        "assignees": [],
        "categoryIds": [],
        "order": 0,
    }
    base.update(patch)
    return base


def loaded(doc):
    return json.loads(doc.get())["board"]


class TestEntryPoint:
    def test_file_type_resolves_to_yboard(self):
        """Without this the collaboration server silently uses YFile."""
        from jupyter_ydoc import ydocs

        assert ydocs.get(CONTENT_TYPE) is YBoard, (
            f"'{CONTENT_TYPE}' does not resolve to YBoard. The jupyter_ydoc "
            "entry-point name in pyproject.toml must equal the document's "
            "content type (BOARD_CONTENT_TYPE in src/boardModel.ts)."
        )

    def test_content_type_matches_the_front_end(self):
        """The three places the content type is spelled must agree."""
        import pathlib
        import re

        root = pathlib.Path(__file__).resolve().parent.parent
        model = (root / "src" / "boardModel.ts").read_text()
        match = re.search(r"BOARD_CONTENT_TYPE = '([^']+)'", model)
        assert match, "BOARD_CONTENT_TYPE not found in src/boardModel.ts"
        assert match.group(1) == CONTENT_TYPE

        pyproject = (root / "pyproject.toml").read_text()
        assert f"{CONTENT_TYPE} = " in pyproject


class TestRoundTrip:
    def test_set_then_get_preserves_the_board(self):
        doc = YBoard()
        doc.set(board_json(tasks=[task("t1"), task("t2")]))
        board = loaded(doc)
        assert [t["id"] for t in board["tasks"]] == ["t1", "t2"]
        assert [c["id"] for c in board["columns"]] == ["todo", "done"]

    def test_get_is_a_fixed_point(self):
        """set(get(x)) == get(x), byte for byte."""
        doc = YBoard()
        doc.set(board_json(tasks=[task("b"), task("a"), task("c")]))
        once = doc.get()

        again = YBoard()
        again.set(once)
        assert again.get() == once

    def test_tasks_come_out_sorted_by_id(self):
        """Canonical order, so the file does not churn between saves."""
        doc = YBoard()
        doc.set(board_json(tasks=[task("c"), task("a"), task("b")]))
        assert [t["id"] for t in loaded(doc)["tasks"]] == ["a", "b", "c"]

    def test_key_order_matches_the_front_end(self):
        """`Board.getBoard` in src/boardModel.ts emits exactly this order."""
        doc = YBoard()
        doc.set(board_json(tasks=[task("t1")]))
        assert list(loaded(doc).keys()) == [
            "version",
            "columns",
            "categories",
            "people",
            "tasks",
        ]

    def test_each_card_gets_its_own_key(self):
        """Granular keys are what let two clients edit different cards at once."""
        doc = YBoard()
        doc.set(board_json(tasks=[task("t1"), task("t2")]))
        keys = set(doc._ycontent.keys())
        assert {"task:t1", "task:t2", "columns", "categories", "people"} == keys

    def test_deleting_a_card_removes_its_key(self):
        doc = YBoard()
        doc.set(board_json(tasks=[task("t1"), task("t2")]))
        doc.set(board_json(tasks=[task("t2")]))
        assert [k for k in doc._ycontent.keys() if k.startswith("task:")] == [
            "task:t2"
        ]

    def test_a_card_without_an_id_is_dropped(self):
        """It could not be addressed by key, so it cannot be stored."""
        doc = YBoard()
        doc.set(json.dumps({"board": {"tasks": [{"title": "no id"}]}}))
        assert loaded(doc)["tasks"] == []


class TestPeopleRoster:
    """The roster of assignee names is a flat array key, like `categories`."""

    def test_round_trips(self):
        doc = YBoard()
        doc.set(board_json(people=["Ada", "Grace"]))
        assert loaded(doc)["people"] == ["Ada", "Grace"]

    def test_survives_a_save_with_no_cards_using_it(self):
        """A name stays pickable even when nothing is assigned to it."""
        doc = YBoard()
        doc.set(board_json(people=["Ada"], tasks=[task("t1")]))
        assert loaded(doc)["people"] == ["Ada"]

    def test_is_its_own_key_so_two_clients_can_edit_it_independently(self):
        doc = YBoard()
        doc.set(board_json(people=["Ada"]))
        assert "people" in doc._ycontent.keys()

    def test_absent_on_a_board_written_before_the_roster_existed(self):
        """The front end derives it from the cards; the server just omits it."""
        doc = YBoard()
        doc.set(json.dumps({"board": {"tasks": [task("t1", assignees=["Ada"])]}}))
        assert "people" not in loaded(doc)


class TestDegradation:
    @pytest.mark.parametrize(
        "source",
        ["", "{not json", "null", "[]", '{"board": null}', '{"board": "text"}', "{}"],
    )
    def test_unreadable_content_yields_an_empty_board(self, source):
        """A corrupt file must open empty, not fail to open."""
        doc = YBoard()
        doc.set(source)
        assert loaded(doc)["tasks"] == []

    def test_a_corrupt_card_does_not_take_the_board_with_it(self):
        doc = YBoard()
        doc.set(board_json(tasks=[task("good")]))
        doc._ycontent["task:broken"] = "{not json"
        assert [t["id"] for t in loaded(doc)["tasks"]] == ["good"]


class TestVersion:
    def test_matches_the_front_end_shared_model(self):
        import pathlib
        import re

        model = (
            pathlib.Path(__file__).resolve().parent.parent / "src" / "boardModel.ts"
        ).read_text()
        match = re.search(r"readonly version: string = '([^']+)'", model)
        assert match, "version not found in src/boardModel.ts"
        assert YBoard().version == match.group(1)
