"""Integration check: two independent clients share one task board.

Run against a JupyterLab already serving this extension, e.g.

    ./venv/bin/jupyter lab --notebook-dir=./notebook-dir --port=8899 \
        --no-browser --ServerApp.token=devtoken --ServerApp.disable_check_xsrf=True
    ./venv/bin/python dev/check-sharing.py

Verify that two independent clients share one task board through the
jupyter-collaboration server, exactly as two browsers would.

Speaks the y-sync protocol over the collaboration websocket:
    message := varuint(msgType) varuint(syncType) varbytes(payload)
    msgType 0 = sync;  syncType 0 = step1 (state vector), 1 = step2, 2 = update
"""
import asyncio
import json
import sys

import httpx
from pycrdt import Doc, Map
from websockets.asyncio.client import connect

BASE = "http://localhost:8899"
WS = "ws://localhost:8899"
TOKEN = "devtoken"
PATH = "naavre-taskboard.naavreboard"
CONTENT_TYPE = "naavreboarddoc"


def w_varuint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def w_bytes(b: bytes) -> bytes:
    return w_varuint(len(b)) + b


class Reader:
    def __init__(self, buf):
        self.buf, self.i = buf, 0

    def varuint(self):
        n = shift = 0
        while True:
            b = self.buf[self.i]
            self.i += 1
            n |= (b & 0x7F) << shift
            if not (b & 0x80):
                return n
            shift += 7

    def bytes(self):
        ln = self.varuint()
        out = self.buf[self.i:self.i + ln]
        self.i += ln
        return out


class Client:
    """One browser tab's worth of shared-document state."""

    def __init__(self, name):
        self.name = name
        self.doc = Doc()
        self.content = self.doc.get("content", type=Map)
        self.synced = asyncio.Event()

    async def connect(self, room_url):
        self.ws = await connect(room_url, max_size=None)
        await self.ws.send(b"\x00\x00" + w_bytes(self.doc.get_state()))
        self.pump = asyncio.create_task(self._pump())

    async def _pump(self):
        try:
            async for msg in self.ws:
                if not msg or msg[0] != 0:  # ignore awareness/presence
                    continue
                r = Reader(msg)
                r.varuint()
                stype = r.varuint()
                payload = r.bytes()
                if stype == 0:  # server asked for our state
                    await self.ws.send(
                        b"\x00\x01" + w_bytes(self.doc.get_update(payload))
                    )
                elif stype in (1, 2):
                    if payload:
                        self.doc.apply_update(payload)
                    if stype == 1:
                        self.synced.set()
        except Exception:
            pass

    async def publish(self, key, value):
        before = self.doc.get_state()
        self.content[key] = value
        await self.ws.send(
            b"\x00\x02" + w_bytes(self.doc.get_update(before))
        )

    def tasks(self):
        return {k: json.loads(v) for k, v in self.content.items()
                if k.startswith("task:")}

    async def close(self):
        self.pump.cancel()
        await self.ws.close()


async def wait_for(pred, what, timeout=10.0):
    loop = asyncio.get_event_loop()
    end = loop.time() + timeout
    while loop.time() < end:
        if pred():
            return True
        await asyncio.sleep(0.1)
    print(f"  TIMEOUT waiting for {what}")
    return False


async def main():
    ok = True
    async with httpx.AsyncClient(params={"token": TOKEN}) as http:
        # Create the board only if it is missing, exactly as the extension's
        # ensureBoardFile() does. Writing it unconditionally would go through
        # the contents API behind the back of any live collaboration room, and
        # the server would then treat it as an out-of-band change and reset the
        # room from disk — silently discarding whatever was on the board.
        exists = (await http.get(f"{BASE}/api/contents/{PATH}",
                                 params={"content": "0"})).status_code == 200
        if not exists:
            await http.put(
            f"{BASE}/api/contents/{PATH}",
            json={"type": "file", "format": "text", "content": json.dumps({
                "board": {
                    "version": 1,
                    "columns": [{"id": "todo", "title": "To Do"},
                                {"id": "done", "title": "Done"}],
                    "categories": [],
                    "tasks": [],
                }
            })},
            )

        r = await http.put(
            f"{BASE}/api/collaboration/session/{PATH}",
            json={"format": "text", "type": CONTENT_TYPE},
        )
        r.raise_for_status()
        s = r.json()
        print(f"  session: fileId={s['fileId'][:18]}...  type={s['type']}")
        assert s["type"] == CONTENT_TYPE, s
        room = f"{WS}/api/collaboration/room/text:{CONTENT_TYPE}:{s['fileId']}?sessionId={s['sessionId']}&token={TOKEN}"

        # --- the sharer opens the board ---
        a = Client("A")
        await a.connect(room)
        if not await wait_for(lambda: a.synced.is_set(), "client A initial sync"):
            return False
        print(f"  A synced: columns present = {'columns' in dict(a.content)}")

        await a.publish("task:t-alpha", json.dumps({
            "id": "t-alpha", "title": "Written by A", "description": "",
            "columnId": "todo", "assignees": [], "categoryIds": [], "order": 1}))
        print("  A added a card")

        # --- someone else joins the shared instance ---
        b = Client("B")
        await b.connect(room)
        if not await wait_for(lambda: "task:t-alpha" in b.tasks(), "B to see A's card"):
            ok = False
        else:
            print("  B joined and sees A's card          -> SHARED, not a new board")

        # --- B edits; A must see it live ---
        await b.publish("task:t-beta", json.dumps({
            "id": "t-beta", "title": "Written by B", "description": "",
            "columnId": "done", "assignees": [], "categoryIds": [], "order": 1}))
        if not await wait_for(lambda: "task:t-beta" in a.tasks(), "A to see B's card"):
            ok = False
        else:
            print("  A sees B's card without reloading    -> LIVE two-way sync")

        # --- concurrent edits to different cards must merge, not clobber ---
        await asyncio.gather(
            a.publish("task:t-a2", json.dumps({"id": "t-a2", "title": "A concurrent",
                      "description": "", "columnId": "todo", "assignees": [],
                      "categoryIds": [], "order": 2})),
            b.publish("task:t-b2", json.dumps({"id": "t-b2", "title": "B concurrent",
                      "description": "", "columnId": "done", "assignees": [],
                      "categoryIds": [], "order": 2})),
        )
        both = {"task:t-a2", "task:t-b2"}
        if not await wait_for(lambda: both <= set(a.tasks()) and both <= set(b.tasks()),
                              "concurrent edits to merge"):
            ok = False
        else:
            print("  concurrent edits both survive        -> MERGED, no last-write-wins")

        print(f"  final: A sees {len(a.tasks())} cards, B sees {len(b.tasks())} cards")
        await a.close()
        await b.close()

        # --- does the server persist it through YBoard? ---
        await asyncio.sleep(3)
        r = await http.get(f"{BASE}/api/contents/{PATH}", params={"content": "1"})
        disk = json.loads(r.json()["content"])
        titles = sorted(t["title"] for t in disk["board"]["tasks"])
        print(f"  on disk: {len(disk['board']['tasks'])} cards {titles}")
        if len(disk["board"]["tasks"]) < 4:
            print("  (file not flushed yet — the server writes on its own schedule)")
    return ok


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(main()) else 1)
