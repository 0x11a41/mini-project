from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from zeroconf import ServiceInfo
from contextlib import asynccontextmanager
from zeroconf.asyncio import AsyncZeroconf
import socket
import time
import asyncio
from backend.interfaces import SyncResponse
from backend.utils import getRandomName
from typing import Optional, Set

PORT = 6210


def getLocalIp() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip


"""
app.state.prototype => 
    controller: Optional[WebSocket]
    recorders: Set[WebSocket]
    port: int
    ip: str
    session_name: str
    zc_engine: AsyncZeroconf
    current_info: ServiceInfo
"""
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.controller: Optional[WebSocket] = None
    app.state.recorders: Set[WebSocket] = set()

    app.state.port = PORT
    app.state.ip = getLocalIp()
    app.state.session_name = getRandomName()
    app.state.zc_engine = AsyncZeroconf()

    app.state.current_info = ServiceInfo(
        type_ = "_vocalink._tcp.local.",
        name = f"{app.state.session_name}._vocalink._tcp.local.",
        port = app.state.port,
        addresses = [socket.inet_aton(app.state.ip)],
    )

    await app.state.zc_engine.async_register_service(app.state.current_info)
    print(f"Advertising {app.state.session_name} to local network...")
    yield
    print("Shutting down...")
    await app.state.zc_engine.async_unregister_service(app.state.current_info)
    await app.state.zc_engine.async_close()


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
    if app.state.controller is not None:
        print("Connection rejected. Controller already attached!")
        await ws.accept()
        await ws.send_json({"error": "ALREADY_CONNECTED"})
        await ws.close(code=1008) 
        return

    await ws.accept()
    app.state.controller = ws
    
    try:
        while True:
            data = await ws.receive_json()
            print(f"/ws/command: {data}")
            
            if app.state.recorders:
                # Parallel broadcast to all nodes
                await asyncio.gather(
                    *[r.send_json(data) for r in app.state.recorders],
                    return_exceptions=True
                )
    except Exception as e:
        print(f"Controller error or disconnect: {e}")
    finally:
        app.state.controller = None
        print("Controller slot freed.")


@app.websocket("/ws/inform")
async def handle_sevants(ws: WebSocket):
    await ws.accept()
    app.state.recorders.add(ws)
    try:
        while True:
            data = await ws.receive_json()
            print(f"/ws/inform: {data}")
            if app.state.controller:
                await app.state.controller.send_json(data)
    except WebSocketDisconnect:
        app.state.recorders.discard(ws)


# documentation in docs/NOTES.md
@app.websocket("/ws/sync")
async def websocket_sync(ws: WebSocket):
    await ws.accept()
    while True:
        try:
            data = await ws.receive_json()
            t1 = int(data.get("t1"))  # validate early
            t2 = int(time.time() * 1000)
            t3 = int(time.time() * 1000)
            await ws.send_json(SyncResponse(t1=t1, t2=t2, t3=t3).model_dump())

        except WebSocketDisconnect:
            return
        except Exception as e:
            print("Sync error:", e)
            break
    await ws.close()


@app.get("/session")
async def session_info():
    return {
        "name": app.state.session_name,
         "ip": app.state.ip,
         "active": len(app.state.recorders),
    }
