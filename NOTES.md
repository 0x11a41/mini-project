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

---



# 3. Problems to be clarified
## 0. Why are we creating this system?
## 1. client side recorder application
we will be using an existing open source voice recorder as a base, and sugarcoat it with our server-side communication endpoints. We will have to figure the **how** part, as well as **noise supression**.
#### Existing Projects that I found
- [option 1](https://github.com/FossifyOrg/Voice-Recorder)
- [option 2](https://github.com/Dimowner/AudioRecorder)

## 2. Audio Processing Pipeline
## 3. Mr. GPT's suggestions
Below are **critical points** you should add for completeness.
#### A. Client Identification
Right now:
- All clients are treated equally
- No identity tracking
You should add:
```json
{
  "type": "REGISTER",
  "device_id": "android-123",
  "name": "Alice"
}
```

Server must maintain:
```python
clients = {
   "android-123": websocket
}
```

So you can:
✔ Control specific client  
✔ Show names in dashboard  
✔ Track status

#### B. ACK Handling
You mention ACK, but you should define:
```json
{
  "type": "ACK",
  "action": "START_RECORDING",
  "device_id": "android-123",
  "status": "SUCCESS"
}
```

Server should:
- Wait for ACK
- Update UI per client
This improves **reliability**.

#### C. File Upload Endpoints (Missing)
You MUST define:
```
POST /api/audio/upload
```
Flow:
1. Client finishes recording
2. Sends file via multipart/form-data
3. Server stores file
4. Returns file_id
This is a **core requirement** (FR5, FR10).

#### D. Recording Management APIs
You need:
```
GET /api/audio/list
GET /api/audio/{id}
DELETE /api/audio/{id}
POST /api/audio/merge
POST /api/audio/{id}/enhance
```

For dashboard features:
- Download
- Delete
- Merge
- Enhance

#### E. WebSocket Protocol Design
Right now you only have:
```json
{ "action": "START_RECORDING" }
```

You should formalize it:
```json
{
  "type": "COMMAND",
  "action": "START",
  "targets": ["android-123"]
}
```

This allows:
✔ Broadcast  
✔ Individual control

#### F. Server-side Client State
You should track:
```python
client_states = {
   "android-123": "RECORDING"
}
```

Used for:
✔ Dashboard status  
✔ Error detection

#### H. Offline Continuity (NFR1)
You mention it conceptually, but should document:
Flow:
1. Server goes offline
2. Client continues recording
3. Stores locally
4. Periodic retry upload

This is an **important design point**.

## 4. Figure out everything that is needed to build the frontend UI
