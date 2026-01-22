#### Server Dashboard UI
![dashboard](mockups/dashboard.png)

#### Client's Server Selection Page
![client](mockups/client's-server-selection-view.png)
# 1. mDNS for server discovery
clients do not know server's IP address, host name or port number. mDNS is a network advertisement service for local network that multicasts the IP address, host name and port number onto the devices connected to local network periodically. Clients listening on the same multicast channel can discover information that is being brodcasted. 'm' in 'mDNS' stands for multicast.
```
Server
   |
   | mDNS broadcast
   v
---------------------------------
|  Local network (WiFi)         |
---------------------------------
   ^            ^           ^
   |            |           |
 Client A    Client B    Client C
```
After discovery about the server info on client side, websockets and REST api's are used to establish connection and carrying client-server communication.
This can be achieved in python using **zeroconf** library.

in this example, we attach a custom server name along with the broadcast message
```python
from zeroconf import Zeroconf, ServiceInfo
import socket

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip

SERVER_NAME = "Studio Server"
PORT = 8000

ip_str = get_local_ip()
ip_bytes = socket.inet_aton(ip_str)

info = ServiceInfo(
    "_vocalink._tcp.local.",
    f"{SERVER_NAME}._vocalink._tcp.local.",
    addresses=[ip_bytes],
    port=PORT
)

zeroconf = Zeroconf()
zeroconf.register_service(info)

print(f"Broadcasting '{SERVER_NAME}' at {ip_str}:{PORT}")
input("Press Enter to stop...")

zeroconf.unregister_service(info)
zeroconf.close()

```

since we support changing server name from the frontend, we need to dynamically update server name. for that, we have to do unregister and re-register nDNS server with the new name. the snippet shown below demonstrates it
```python
zeroconf.unregister_service(info)
info = ServiceInfo(...new name...)
zeroconf.register_service(info)
```

mDNS should be ran as a background task inside the VocalLink server like the following
```python
from fastapi import FastAPI
import threading

app = FastAPI()

def start_mdns():
    # your mDNS code here
    pass

@app.on_event("startup")
def startup_event():
    threading.Thread(target=start_mdns, daemon=True).start()
```

---
# 2. REST API and WebSockets for communication
After the client discovers server information, it can now use the server's ip address and port number to communicate to that server using predefined **routes**.
A route is a path within our server that essentially leads to a function call. For example, we can define `http://localhost:8000/ping` where **`/ping`** is a route that calls a function that lies on the server to check whether server is alive or not.

## What's REST API ?
A REST API (Representational State Transfer Application Programming Interface) is a set of rules for building web services that allow different applications to communicate over the internet using standard HTTP methods like GET, POST, PUT, and DELETE.
[read about REST API methods](https://restfulapi.net/http-methods/)
### Why do we need it?
everything we will be doing apart from control commands (ie, START_RECORD, STOP_RECORD) will be using REST API methods. 

---
## What purpose does WebSockets serve in our project?
WebSockets is a communication protocol that enables **two-way** (full-duplex), **real-time** interaction between a client  and a server over a single, persistent connection.
We will be using this technology to enable real time control command transfer and updation. The dataflow will be like the following

1. The user clicks on "Start Recording" button
2. the frontend sends a message to backend via websockets to tell the client to start recording.
```json
{
  "action": "START_RECORDING"
}
```
3. The backend broadcast this message to all or specific client(s)
4. each client will recieve this message
5. the server should acknowledge the request back to server.

We will be using **python** to develop the server backend. Python offers sever libraries to interfere with REST APIs.
- Flask
- Django REST Framework
- FastAPI
From these popular options, we ought to use FastAPI. **WHY ?**
> below are some good points that I stole from gemini
- FastAPI is one of the fastest Python frameworks available. It is built on **Starlette** (for web parts) and **Uvicorn** (the server), allowing it to handle thousands of concurrent requests.
- The moment you write a route, FastAPI generates a professional, interactive documentation page.
- FastAPI uses **Python Type Hints** and a library called **Pydantic** to validate data.
- In **FastAPI**, WebSockets are a "first-class citizen." They work out of the box with the same simple syntax as your REST routes.

**It seems understandable just by stare-ing at example codes.**  


---

## Backend project structure
```
server/
├── main.py
├── websocket_manager.py
├── routes/
│ ├── audio.py
│ ├── client.py
│ └── enhance.py
├── mdns_service.py
├── storage/
└── models/
```

---
## Examples
#### server backend implementation using fastapi, websockets
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

clients = []

# ---------------- WebSocket ---------------- #

@app.websocket("/ws/control")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    print("Client connected")

    try:
        while True:
            data = await ws.receive_text()
            print("Received:", data)

            # Broadcast to all connected clients
            for client in clients:
                await client.send_text(data)

    except WebSocketDisconnect:
        clients.remove(ws)
        print("Client disconnected")

# ---------------- REST ---------------- #

@app.get("/ping")
def ping():
    return {"status": "server alive"}
```

#### server frontend implementation
```html
<!DOCTYPE html>
<html>
	<head>
		<title>VocalLink Dashboard</title>
	</head>
	<body>

		<h2>Server Controller</h2>

		<button onclick="start()">Start Recording</button>
		<button onclick="stop()">Stop Recording</button>
		<button onClick="isAlive()">
			ping server
		</button>

		<p id="log"></p>

		<script src="script.js"></script>
	</body>
</html>
```
```javascript
let ws = new WebSocket("ws://localhost:8000/ws/control");

function log(text){
	document.getElementById("log").innerHTML += "<br>" + text;
}

socket.onopen = () => {
	log("Connected to server");
};

socket.onmessage = (event) => {
	log("Server: " + event.data);
};
	
function start(){
	let msg = {
		action: "START_RECORDING"
	};
	socket.send(JSON.stringify(msg));
}

function stop(){
	let msg = {
		action: "STOP_RECORDING"
	};
	socket.send(JSON.stringify(msg));
}

function isAlive() {
	fetch('http://127.0.0.1:8000/ping')
    .then(response => response.json())
    .then(data => {
    	document.getElementById("log").innerText += "\n" + data.status;
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
```

#### dummy client implementation
```html
<!DOCTYPE html>
<html>
	<head>
		<title>recorder</title>
	</head>
	<body>
		<h3>Client Simulator</h3>
		<p id="status">Waiting...</p>

		<script>
			let ws = new WebSocket("ws://localhost:8000/ws/control");
			
			ws.onmessage = (event) => {
				let msg = JSON.parse(event.data);
				
				if(msg.action === "START_RECORDING"){
					document.getElementById("status").innerText = "RECORDING...";
				}
				
				if(msg.action === "STOP_RECORDING"){
					document.getElementById("status").innerText = "STOPPED";
				}
			};
		</script>
	</body>
</html>
```


# 3. API Route Design
### 1. Client (Mobile App) → Server Routes

| Trigger (UI / Event) | Route                     | Method | Purpose                     | Payload (Summary)            |
| -------------------- | ------------------------- | ------ | --------------------------- | ---------------------------- |
| Connect button       | `/api/clients/register`   | POST   | Register client with server | Client name, IP, device info |
| Disconnect button    | `/api/clients/unregister` | POST   | Remove client from server   | Client ID                    |
| Periodic (heartbeat) | `/api/clients/status`     | POST   | Update recording state      | Client ID, state, battery    |
| Recording stop       | `/api/audio/upload`       | POST   | Upload recorded audio       | Audio file + metadata        |

### 2. Server → Client Control (WebSocket)

| Trigger (Dashboard)    | Channel       | Message Type      | Action                 |
| ---------------------- | ------------- | ----------------- | ---------------------- |
| Start all / mic button | `/ws/control` | `START_RECORDING` | Begin recording        |
| Stop button            | `/ws/control` | `STOP_RECORDING`  | Stop recording         |
| Client event           | `/ws/control` | `STATE_UPDATE`    | Update dashboard state |

### 3. Server Dashboard – Device Control Routes

| UI Element            | Route                       | Method | Purpose                |
| --------------------- | --------------------------- | ------ | ---------------------- |
| Header section        | `/api/server/info`          | GET    | Fetch server name & IP |
| Device list           | `/api/clients`              | GET    | List connected clients |
| Start all recordings  | `/api/control/start-all`    | POST   | Start all clients      |
| Stop all recordings   | `/api/control/stop-all`     | POST   | Stop all clients       |
| Individual mic button | `/api/control/client/start` | POST   | Start single client    |
| Individual stop       | `/api/control/client/stop`  | POST   | Stop single client     |
| X button              | `/api/clients/remove`       | POST   | Remove client          |

### 4. Recordings Management Routes

| UI Element       | Route                                  | Method | Function               |
| ---------------- | -------------------------------------- | ------ | ---------------------- |
| Recordings list  | `/api/recordings`                      | GET    | List all recordings    |
| Trash icon       | `/api/recordings/{id}`                 | DELETE | Delete recording       |
| Delete all       | `/api/recordings`                      | DELETE | Remove all recordings  |
| ✨ button         | `/api/recordings/{id}/enhance`         | POST   | Enhance recording      |
| Enhance all      | `/api/recordings/enhance-all`          | POST   | Enhance all recordings |
| Play button      | `/api/recordings/{id}/stream`          | GET    | Stream audio           |
| Merge & download | `/api/recordings/merge`                | POST   | Merge all audio        |
| Download         | `/api/recordings/merged/{session}.wav` | GET    | Download merged file   |

### 5. Discovery (Non-HTTP)

|Mechanism|Purpose|
|---|---|
|mDNS / UDP broadcast|Discover available VocalLink servers|

