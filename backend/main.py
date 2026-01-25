from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()
clients = []


@app.websocket("/ws/control")
async def handle_control_commands(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    try:
        while True:
            data = await ws.receive_json()
            print(f"/ws/control => {data}")
            for client in clients:
                if client != ws:
                    await client.send_json(data)
    except WebSocketDisconnect:
        if ws in clients:
            clients.remove(ws)


@app.get("/ping")
async def ping():
    return { "_VOCAL_LINK_SERVER_": "running" }
