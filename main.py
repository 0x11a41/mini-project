from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from zeroconf import ServiceInfo
from contextlib import asynccontextmanager
from zeroconf.asyncio import AsyncZeroconf
import socket

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip

def create_service_info(app, name):
    return ServiceInfo(
        "_vocalink._tcp.local.",
        f"{name}._vocalink._tcp.local.",
        addresses=[socket.inet_aton(app.state.ip_str)],
        port=app.state.port
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.port = 6210
    app.state.ip_str = get_local_ip()
    app.state.server_name = "VocalLink"
    app.state.aiozc = AsyncZeroconf()
    app.state.current_info = create_service_info(app, app.state.server_name)
    await app.state.aiozc.async_register_service(app.state.current_info)
    print(f"Broadcasting {app.state.server_name} at {app.state.ip_str}...")
    
    yield
    
    print("Shutting down...")
    await app.state.aiozc.async_unregister_service(app.state.current_info)
    await app.state.aiozc.async_close()



app = FastAPI(lifespan=lifespan)

clients = []
@app.websocket("/ws/control")
async def handle_control_commands(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    try:
        while True:
            data = await ws.receive_json()
            print(f"websocket: {data}")
            for client in clients:
                if client != ws:
                    await client.send_json(data)
    except WebSocketDisconnect:
        if ws in clients:
            clients.remove(ws)


@app.websocket("/ws/server-rename")
async def update_server_name(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json() # recieve as dictionary
            print(f"websocket: {data}")
            if data.get("action") == "RENAME_SERVER":
                new_name = data.get("newName")
                await app.state.aiozc.async_unregister_service(app.state.current_info)
                app.state.server_name = new_name
                app.state.current_info = create_service_info(app, new_name)
                await app.state.aiozc.async_register_service(app.state.current_info)
                for client in clients:
                    if client != ws:
                        await client.send_json(data)
    except WebSocketDisconnect:
        if ws in clients:
            clients.remove(ws)
                    

@app.get("/ping")
async def ping():
    return { "status": "alive" }
