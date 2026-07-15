"""Tests for per-session soul_override in the API server.

When a session is created with ``POST /api/sessions {"soul": "..."}``, the
provided text replaces the SOUL.md identity block for that session only.
"""

from unittest.mock import AsyncMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from gateway.config import PlatformConfig
from gateway.platforms.api_server import APIServerAdapter
from hermes_state import SessionDB


@pytest.fixture
def session_db(tmp_path):
    db = SessionDB(tmp_path / "state.db")
    try:
        yield db
    finally:
        close = getattr(db, "close", None)
        if callable(close):
            close()


@pytest.fixture
def adapter(session_db):
    adapter = APIServerAdapter(PlatformConfig(enabled=True))
    adapter._session_db = session_db
    return adapter


def _create_session_app(adapter: APIServerAdapter) -> web.Application:
    app = web.Application()
    app.router.add_post("/api/sessions", adapter._handle_create_session)
    app.router.add_get("/api/sessions/{session_id}", adapter._handle_get_session)
    app.router.add_post("/api/sessions/{session_id}/chat", adapter._handle_session_chat)
    app.router.add_post("/api/sessions/{session_id}/chat/stream", adapter._handle_session_chat_stream)
    app.router.add_post("/api/sessions/{session_id}/fork", adapter._handle_fork_session)
    return app


@pytest.mark.asyncio
async def test_create_session_with_soul(adapter):
    """POST /api/sessions with a 'soul' field stores it as soul_override."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        resp = await cli.post("/api/sessions", json={
            "session_id": "test-soul-1",
            "soul": "You are a terse voice assistant.",
        })
        assert resp.status == 201

        db_session = adapter._ensure_session_db().get_session("test-soul-1")
        assert db_session is not None
        assert db_session.get("soul_override") == "You are a terse voice assistant."


@pytest.mark.asyncio
async def test_create_session_with_soul_override_alias(adapter):
    """'soul_override' is accepted as an alias for 'soul'."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        resp = await cli.post("/api/sessions", json={
            "session_id": "test-soul-2",
            "soul_override": "Custom persona.",
        })
        assert resp.status == 201
        db_session = adapter._ensure_session_db().get_session("test-soul-2")
        assert db_session.get("soul_override") == "Custom persona."


@pytest.mark.asyncio
async def test_create_session_without_soul(adapter):
    """Sessions without a soul field have soul_override=None."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        resp = await cli.post("/api/sessions", json={
            "session_id": "test-soul-3",
        })
        assert resp.status == 201
        db_session = adapter._ensure_session_db().get_session("test-soul-3")
        assert db_session.get("soul_override") is None


@pytest.mark.asyncio
async def test_create_session_soul_must_be_string(adapter):
    """Non-string soul is rejected with 400."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        resp = await cli.post("/api/sessions", json={
            "session_id": "test-soul-4",
            "soul": 12345,
        })
        assert resp.status == 400


@pytest.mark.asyncio
async def test_soul_override_passed_to_run_agent(adapter):
    """When chatting on a session with soul_override, _run_agent receives it."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        # Create session with soul
        await cli.post("/api/sessions", json={
            "session_id": "test-soul-5",
            "soul": "You are Aria.",
        })

        captured = {}
        original = adapter._run_agent

        async def spy(**kwargs):
            captured["soul_override"] = kwargs.get("soul_override")
            # Return minimal valid result
            return {"final_response": "ok", "session_id": "test-soul-5"}, {}

        adapter._run_agent = spy
        resp = await cli.post(
            "/api/sessions/test-soul-5/chat",
            json={"message": "Hello"},
        )
        assert resp.status == 200
        assert captured.get("soul_override") == "You are Aria."


@pytest.mark.asyncio
async def test_no_soul_override_when_not_set(adapter):
    """When chatting on a session without soul_override, None is passed."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        await cli.post("/api/sessions", json={
            "session_id": "test-soul-6",
        })

        captured = {}
        async def spy(**kwargs):
            captured["soul_override"] = kwargs.get("soul_override")
            return {"final_response": "ok", "session_id": "test-soul-6"}, {}

        adapter._run_agent = spy
        resp = await cli.post(
            "/api/sessions/test-soul-6/chat",
            json={"message": "Hello"},
        )
        assert resp.status == 200
        assert captured.get("soul_override") is None


# ── Fork propagation ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fork_propagates_soul_override(adapter):
    """Forking a session copies soul_override to the child."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        # Create source session with a soul override
        await cli.post("/api/sessions", json={
            "session_id": "fork-source",
            "soul": "You are Aria.",
        })

        # Fork it
        resp = await cli.post("/api/sessions/fork-source/fork", json={
            "id": "fork-child",
        })
        assert resp.status == 201

        # The forked child must carry the soul_override
        db_session = adapter._ensure_session_db().get_session("fork-child")
        assert db_session is not None
        assert db_session.get("soul_override") == "You are Aria."


@pytest.mark.asyncio
async def test_fork_without_soul_override(adapter):
    """Forking a session without soul_override yields None in the child."""
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        await cli.post("/api/sessions", json={
            "session_id": "fork-source-2",
        })

        resp = await cli.post("/api/sessions/fork-source-2/fork", json={
            "id": "fork-child-2",
        })
        assert resp.status == 201

        db_session = adapter._ensure_session_db().get_session("fork-child-2")
        assert db_session is not None
        assert db_session.get("soul_override") is None


@pytest.mark.asyncio
async def test_fork_before_first_chat_propagates_soul(adapter):
    """A fork made before the source's first chat still carries soul_override.

    This is the edge case from the review: the fork path previously only
    copied ``model`` and ``system_prompt``, losing the configured identity.
    """
    app = _create_session_app(adapter)
    async with TestClient(TestServer(app)) as cli:
        # Create session with soul but never chat on it
        await cli.post("/api/sessions", json={
            "session_id": "pre-chat-source",
            "soul": "You are a pre-chat fork test agent.",
        })

        # Fork immediately — no chat has happened on the source
        resp = await cli.post("/api/sessions/pre-chat-source/fork", json={
            "id": "pre-chat-fork",
        })
        assert resp.status == 201

        db_session = adapter._ensure_session_db().get_session("pre-chat-fork")
        assert db_session is not None
        assert db_session.get("soul_override") == "You are a pre-chat fork test agent."
