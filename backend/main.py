from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uuid

from backend.interfaces import AppState, ClientMetadata, EventType, SessionState, ClientRegisteredMessage, CommandAction, CommandMessage


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
    if await app_state.dashboard.available():
        await ws.accept()
        await ws.send_json({"error": "ALREADY_CONNECTED"})
        await ws.close(code=1008)
        return

    # Register dashboard
    await app_state.dashboard.connect(ws)
    clients = await app_state.sessions.get_info()

    for client in clients:
        msg = ClientRegisteredMessage(
            event=EventType.CLIENT_REGISTERED,
            body=client
        )
        await ws.send_json(msg.model_dump())

    try:
        while True:
            data = await ws.receive_json()
            if "action" not in data:
                await ws.send_json({"error": "MISSING_ACTION"})
                continue

            try:
                action = CommandAction(data["action"])
            except ValueError:
                await ws.send_json({"error": "INVALID_ACTION"})
                continue

            payload = CommandMessage(action=action)
            if action in (CommandAction.START_ALL, CommandAction.STOP_ALL):
                await app_state.sessions.broadcast(payload.model_dump())

            elif action in (CommandAction.START_ONE, CommandAction.STOP_ONE):
                client_id = data.get("client_id")
                if not client_id:
                    await ws.send_json({"error": "MISSING_CLIENT_ID"})
                    continue

                await app_state.sessions.send_to_one(
                    client_id,
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


# @app.websocket("/ws/inform")
# async def handle_sevants(ws: WebSocket):
#     await ws.accept()
#     app.state.recorders.add(ws)
#     try:
#         while True:
#             data = await ws.receive_json()
#             print(f"/ws/inform: {data}")
#             if app.state.controller:
#                 await app.state.controller.send_json(data)
#     except WebSocketDisconnect:
#         app.state.recorders.discard(ws)


# # documentation in docs/NOTES.md
# @app.websocket("/ws/sync")
# async def websocket_sync(ws: WebSocket):
#     await ws.accept()
#     while True:
#         try:
#             data = await ws.receive_json()
#             t1 = int(data.get("t1"))  # validate early
#             t2 = int(time.time() * 1000)
#             t3 = int(time.time() * 1000)
#             await ws.send_json(SyncResponse(t1=t1, t2=t2, t3=t3).model_dump())

#         except WebSocketDisconnect:
#             return
#         except Exception as e:
#             print("Sync error:", e)
#             break
#     await ws.close()


@app.get("/session")
async def getServerInfo():
    return app_state.server_info.model_dump()


@app.post("/clients", response_model=ClientMetadata)
async def register_client(client: ClientMetadata):
    client_id = str(uuid.uuid4())

    client.id = client_id
    client.state = SessionState.IDLE
    client.clock_offset = 0.0
    client.last_rtt = 0.0
    client.last_sync = None

    async with app_state.pending_lock:
        app_state.pending_clients[client_id] = client

    return client
