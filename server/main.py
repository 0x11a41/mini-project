from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

clients = []
@app.websocket("/ws/control")
async def handle_control_commands(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    try:
        while True:
            data = await ws.receive_text()
            print(f"Received: {data}")
            for client in clients:
                await client.send_text(data)
    except WebSocketDisconnect:
        clients.remove(ws)


app.mount("/static", StaticFiles(directory="static"), name="static")
@app.get("/")
async def read_root():
    return FileResponse("static/index.html")
