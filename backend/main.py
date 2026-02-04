from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uuid

from backend.protocols import AppState, SessionMetadata, SessionState, SessionInitReportMsg, WSActionRequest, ActionMsg, SyncResponse, SyncReport, SyncRequest, SessionInitResponseMsg


app_state = AppState(port = 6210) # source of truth


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_state.start_mdns()
    yield
    await app_state.shutdown()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,  # ty:ignore[invalid-argument-type]
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/command")
async def handle_commander(ws: WebSocket):
    if await app_state.dashboard.is_active():
        await ws.accept()
        await ws.send_json({"error": "ALREADY_CONNECTED"})
        await ws.close(code=1008)
        return

    await app_state.dashboard.connect(ws)
    sessionMetas = await app_state.sessions.getAllMeta()

    for meta in sessionMetas:
        await ws.send_json(SessionInitReportMsg(body=meta).model_dump())

    try:
        while True:
            data = await ws.receive_json()
            if "action" not in data:
                await ws.send_json({"error": "MISSING_ACTION"})
                continue

            try:
                action = WSActionRequest(data["action"])
            except ValueError:
                await ws.send_json({"error": "INVALID_ACTION"})
                continue

            payload = ActionMsg(action=action)
            if action in (WSActionRequest.START_ALL, WSActionRequest.STOP_ALL):
                await app_state.sessions.broadcast(payload.model_dump())

            elif action in (WSActionRequest.START_ONE, WSActionRequest.STOP_ONE):
                session_id = data.get("session_id")
                if not session_id:
                    await ws.send_json({"error": "MISSING_SESSION_ID"})
                    continue

                await app_state.sessions.send_to_one(
                    session_id,
                    payload.model_dump()
                )
            else:
                await ws.send_json({
                    "error": "UNKNOWN_ACTION",
                    "action": action.value
                })
    except WebSocketDisconnect:
        print("Dashboard disconnected")
    except Exception as e:
        print("Dashboard error:", e)
    finally:
        await app_state.dashboard.disconnect()


@app.websocket("/ws/inform")
async def handle_sessions(ws: WebSocket):
    pass


@app.websocket("/ws/sync/{session_id}")
async def sync_endpoint(websocket: WebSocket, session_id: str):
    if not await app_state.sessions.is_active(session_id):
        await websocket.close(code=4003)
        return

    await websocket.accept()
    await app_state.sync.add(session_id, websocket)
    try:
        while True:
            if not await app_state.sync.get(session_id):
                return

            data = await websocket.receive_json()
            if "t1" in data:
                req = SyncRequest.model_validate(data)
                await app_state.sync.handle_ping(session_id, req)
            elif "theta" in data:
                report = SyncReport.model_validate(data)
                await app_state.sessions.update_sync(session_id, report)
                
    except WebSocketDisconnect:
        meta = await app_state.sessions.getMeta(session_id)
        print(f"Sync disconnected: {meta and meta.name}")
    finally:
        await app_state.sync.remove(session_id)



@app.get("/dashboard")
async def getServerInfo():
    serverinfo = await app_state.server_info()
    return serverinfo.model_dump()


@app.post("/sessions", response_model=SessionInitResponseMsg)
async def register_session(meta: SessionMetadata):
    session_id = str(uuid.uuid4())

    meta.id = session_id
    meta.state = SessionState.IDLE
    meta.theta = 0.0 # latency
    meta.last_rtt = 0.0 # round trip time
    meta.last_sync = None # to resync

    await app_state.sessions.stage(meta)
    return SessionInitResponseMsg(body=meta).model_dump()
