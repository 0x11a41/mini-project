from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uuid

from backend.protocols import (
    AppState, 
    SessionState,
    SessionStageRequestMsg, 
    SessionStageResponseMsg, 
    SyncRequest, 
    SyncReport,
    ServerInfo,
)



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

@app.websocket("/ws/control")
async def orchistrate_messages(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            if "event" in data:
                await app_state.handle_ws_events(data, ws)
            elif "action" in data:
                await app_state.handle_ws_actions(data, ws)
            else:
                ws.send_json({"error": "INVALID_MESSAGE"})
                
    except WebSocketDisconnect:
        await app_state.handle_disconnect(ws)
    except Exception as e:
        print("/ws/control: unexpected problem: ", e)
        try:
            await ws.close()
        except Exception:
            pass


@app.websocket("/ws/sync/{session_id}")
async def sync_endpoint(websocket: WebSocket, session_id: str):
    if not await app_state.sessions.is_active(session_id):
        await websocket.close(code=4003)
        return

    await websocket.accept()
    await app_state.clock.add(session_id, websocket)
    try:
        while True:
            if not await app_state.clock.get(session_id):
                return

            data = await websocket.receive_json()
            if "t1" in data:
                req: SyncRequest = SyncRequest.model_validate(data)
                await app_state.clock.handle_ping(session_id, req)
            elif "theta" in data:
                report = SyncReport.model_validate(data)
                await app_state.sessions.update_sync(session_id, report)
                
    except WebSocketDisconnect:
        meta = await app_state.sessions.getMetaFromActive(session_id)
        print(f"Sync disconnected: {meta and meta.name}")
    finally:
        await app_state.clock.remove(session_id)



@app.get("/dashboard", response_model=ServerInfo)
async def getServerInfo():
    return await app_state.server_info()


@app.post("/sessions", response_model=SessionStageResponseMsg)
async def stage_session(req: SessionStageRequestMsg):
    req.body.id = str(uuid.uuid4())
    req.body.state = SessionState.IDLE

    await app_state.sessions.stage(req.body)
    return SessionStageResponseMsg(body=req.body).model_dump()
