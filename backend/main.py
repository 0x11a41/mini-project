from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import ValidationError
import uuid
import qrcode
import io

from backend.protocols import (
    AppState, 
    SessionStageRequestMsg, 
    SessionStageResponseMsg, 
    SyncRequest, 
    SyncReport,
    ServerInfo,
    WSPayload,
    WSKind,
    WSErrors,
    QRData,
    send_error,
)


app = AppState(port = 6210) # source of truth


@asynccontextmanager
async def lifespan(api: FastAPI):
    await app.start_mdns()
    yield
    await app.shutdown()


api = FastAPI(lifespan=lifespan)
api.add_middleware(
    CORSMiddleware,  # ty:ignore[invalid-argument-type]
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@api.websocket("/ws/control")
async def orchistrate_messages(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            try:
                raw = WSPayload.model_validate(await ws.receive_json())
            except ValidationError as e:
                print(e)
                continue

            if raw.kind == WSKind.ACTION:
                await app.handle_ws_actions(raw, ws)
            elif raw.kind == WSKind.EVENT:
                await app.handle_ws_events(raw, ws)
            elif raw.kind == WSKind.ERROR:
                pass # todo
            else:
                await send_error(ws, WSErrors.INVALID_KIND)
                
    except WebSocketDisconnect:
        await app.handle_disconnect(ws)
    except Exception as e:
        print("/ws/control: unexpected problem: ", e)
        try:
            await ws.close()
        except Exception:
            pass



@api.websocket("/ws/sync/{session_id}")
async def sync_endpoint(websocket: WebSocket, session_id: str):
    if not await app.sessions.is_active(session_id):
        await websocket.close(code=4003)
        return

    await websocket.accept()
    await app.clock.add(session_id, websocket)
    try:
        while True:
            if not await app.clock.get(session_id):
                return

            data = await websocket.receive_json()
            if "t1" in data:
                try:
                    req = SyncRequest.model_validate(data)
                except ValidationError:
                    continue

                await app.clock.handle_ping(session_id, req)

            elif "theta" in data:
                report = SyncReport.model_validate(data)
                await app.sessions.update_sync(session_id, report)
                
    except WebSocketDisconnect:
        meta = await app.sessions.getMetaFromActive(session_id)
        print(f"Sync disconnected: {meta and meta.name}")
    finally:
        await app.clock.remove(session_id)




@api.post("/sessions", response_model=SessionStageResponseMsg)
async def stage_session(req: SessionStageRequestMsg):
    req.body.id = str(uuid.uuid4())
    await app.sessions.stage(req.body)
    return SessionStageResponseMsg(body=req.body).model_dump()



@api.get("/dashboard", response_model=ServerInfo)
async def getServerInfo():
    return await app.server_info()



@api.get("/dashboard/qr")
async def get_server_qr():
    payload = QRData(name=app.name, ip=app.ip)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=20,
        border=2
    )
    qr.add_data(payload.model_dump())
    qr.make(fit=True)
   
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")
