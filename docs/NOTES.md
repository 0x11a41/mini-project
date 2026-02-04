### Table of Contents

1. [Project Proposal](#project-proposal)
2. [Anticipated Communication Architecture](#anticipated-communication-architecture)
3. [UI Mockups](#ui-mockups)
4. [Endpoints](#Endpoints)
5. [Problems to be identified](#Problems-to-be-identified)
6. [Resources](#Resources)

# Project Proposal

## Idea

VocalLink is a distributed audio recording system that functions as a sophisticated standalone mobile voice recorder while offering an enhanced client-server architecture for professional studio environments. Operating autonomously, the smartphone application provides high-quality, noise-cancelled recording for everyday use; however, upon detecting a server via mDNS, it transforms into a remote recording node capable of being managed through a centralized dashboard. This architecture allows a single server to orchestrate multiple mobile clients simultaneously—ideal for multi-speaker scenarios like podcasts or interviews—and leverages the server's superior computational power to apply resource-intensive deep learning algorithms for professional-grade speech enhancement and post-processing.

## Purpose

Our project makes professional audio recording easy and affordable by using the smartphones people already own. In common situations like group podcasts or interviews, it removes the hassle of trying to sync different recordings manually and solves the problem of phones not being powerful enough to handle high-end audio cleaning. By letting a central server control all the phones at once and then using ML to automatically enhance the speech, it turns basic mobile recordings into high-quality files. This gives creators a simple way to get great sound without needing to buy expensive microphones, mixers, or professional studio space. 

## Target Audience

- **Indie Podcasters:** Creators who need synchronized multi-person recordings without costly equipment.

- **Journalists & Researchers:** Professionals who record interviews in the field and enhance them ~~later~~ with AI processing.

- **Content Creators & YouTubers:** Users who want their phones to act as wireless microphones that send audio directly to their editing setup.

- **Educators:** Teachers who need clear recordings for lectures, discussions, and accessibility.

## Useful Situations

- **Multi-Guest Interviews:** Use multiple phones as microphones, controlled from one central dashboard.

- **Noisy Environments:** Remove background noise using server-based deep learning and client's DSP processing.

- **Low-Budget Studios:** Act as a "poor man's recording studio"

- ~~***On-the-Go Recording:** Record anywhere and automatically enhance files when reconnecting to the server.*~~
  
  ---

# Anticipated communication architecture

## server discovery

#### Option 1: mDNS for server discovery

VocalLink advertises it's IP address and port number on the local network using mDNS protocol. Recorder's, with the same protocol, should discover this advertisement and try to reach any endpoint.

#### ~~Option 2: Subnet Scanning~~

#### Option 3: using QR code

server displays a qr code containing info about ip address, port number and server's name.

---

## REST API and WebSockets for communication

After the client discovers server information, it can now use the server's ip address and port number to communicate to that server using predefined **routes**.
A route is a path within our server that essentially leads to a function call. For example, we can define `http://localhost:8000/ping` where **`/ping`** is a route that calls a function that lies on the server to check whether server is alive or not.

#### REST API

 It is basically a cool name for http methods - GET, POST, PUT, DELETE ... [read more](https://restfulapi.net/http-methods/)

**Why do we need it ?** everything we will be doing apart from control commands (ie, START_RECORD, STOP_RECORD) will be using REST API methods. 

#### WebSockets

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

5. the client should acknowledge the request back to server.
   
   ---

## Backend

We will be deploying our **backend in python**, due for the following **reasons**.

1. familiarity of team with python code.
2. since we are planning on adding ML based post processing on server
3. Offers a mature ecosystem of libraries for our usecase

| Technology    | Python Library we plan on use |
| ------------- | ----------------------------- |
| WebSockets    | FastAPI                       |
| routing       | FastAPI                       |
| ML processing | librosa/PyTorch               |

---

## Clock synchronization problem

In a distributed recording system, a "START" command sent via WebSocket does not reach all clients simultaneously. Factors like WiFi congestion can introduce latencies ranging from 10ms to 150ms or more. Without synchronization, merging these audio files results in "phasing" or echo effects that ruin professional recordings.

To address this, VocalLink implements a simplified version of the **Network Time Protocol (NTP)**. By exchanging four high-precision timestamps, each client calculates its unique **Clock Offset (θ)** relative to the server.

#### The Handshake Steps:

1. **T1​ (Origin):** Client records its local time and sends a sync request.

2. **T2​ (Receive):** Server records the exact time the request arrived.

3. **T3​ (Transmit):** Server records the time the response is sent back.

4. **T4​ (Destination):** Client records its local time upon receiving the response.

> /ws/sync is the backend endpoint for perform syncing

**What happens inside the Recorder (pseudo code):**

```python
def handle_sync_response(t1, t2, t3):
    t4 = int(time.time() * 1000) # Current local time
    rtt = (t4 - t1) - (t3 - t2)  # 1. Calculate Round Trip Time (RTT)
    theta=((t2-t1)+(t3-t4))/2 # 2. Calculate Clock Offset (theta)
    # This is how much the client must add/subtract to match the server
    return theta, rtt
```

When the user clicks "Start All" on the dashboard, the server sends a future-dated command:

- **Server Message:** `{"action": "START", "target_time": <CurrentServerTime + 500ms>}`

- **Client Calculation:** Each phone calculates its own trigger time: `LocalTriggerTime = target_time - theta`.

- **Result:** Every microphone triggers at the same absolute moment in time, regardless of individual network delays.

---

# UI Mockups

#### Server Dashboard

![dashboard](mockups/dashboard.png)

![dashboard_unreachable](mockups/dashboard_unreachable.png)

#### Client's Server Selection Page

<div>
    <img src="mockups/recorder.png" width="48%">
    <img src="mockups/recorder_unreachable.png" width = "48%">
</div>

> [link to choosen client side application](https://github.com/0x11a41/fossify-voice-recorder#)

---

# Endpoints

#### 1. Server Metadata

| Purpose            | Endpoint        | Method |
| ------------------ | --------------- | ------ |
| Get server info    | `/dashboard`    | GET    |
| Update server name | `/dashboard`    | PATCH  |
| Get QR code        | `/dashboard/qr` | GET    |

Example:

```json
// GET /dashboard
{
  "name": "Podcast101",
  "ip": "192.168.1.172",
  "clients": 3
}
```

#### 2. Client Lifecycle

| Purpose         | Endpoint         | Method |
| --------------- | ---------------- | ------ |
| Register client | `/sessions`      | POST   |
| List clients    | `/sessions`      | GET    |
| Get client info | `/sessions/{id}` | GET    |
| Remove client   | `/sessions/{id}` | DELETE |
| Rename client   | `/sessions/{id}` | PATCH  |

Example:

```json
// POST /sessions
{
  "name": "Ester Brown",
  "ip": "192.168.1.132",
  "device": "Pixel 6"
}
```

#### 4. Upload After Recording

| Purpose      | Endpoint      | Method |
| ------------ | ------------- | ------ |
| Upload audio | `/recordings` | POST   |

Payload: multipart/form-data

```
file
client_id
timestamp
session_id
```

#### 5. List & Delete

| Purpose         | Endpoint           | Method |
| --------------- | ------------------ | ------ |
| List recordings | `/recordings`      | GET    |
| Get recording   | `/recordings/{id}` | GET    |
| Delete          | `/recordings/{id}` | DELETE |
| Delete all      | `/recordings`      | DELETE |

#### 6. Enhancement

| Purpose     | Endpoint                   | Method |
| ----------- | -------------------------- | ------ |
| Enhance one | `/recordings/{id}/enhance` | POST   |
| Enhance all | `/recordings/enhance`      | POST   |

Optional body:

```json
{
  "model": "denoise-v2",
  "level": "high"
}
```

#### 7. Streaming & Download

| Purpose  | Endpoint                    | Method |
| -------- | --------------------------- | ------ |
| Stream   | `/recordings/{id}/stream`   | GET    |
| Download | `/recordings/{id}/download` | GET    |

#### 8. Merging / Export

| Purpose         | Endpoint         | Method |
| --------------- | ---------------- | ------ |
| Merge           | `/export/merge`  | POST   |
| Download merged | `/export/latest` | GET    |

#### 9. WebSockets Control Channels

1. **/ws/command** - Dedicated endpoint for controller dashboard. Multiple instances of frontend will not be allowed here.

2. **/ws/inform** - For recorders to communicate to the dashboard.

**Example Message Formats :**

```json
// record all
{
  "type": "command",
  "target": "all",
  "action": "start_recording"
}
```

```json
// record specific client - /ws/command
{
  "type": "command",
  "target": "client",
  "client_id": 42,
  "action": "stop_recording"
}
```

```json
// State Updates (Client → Server) - /ws/inform
{
  "type": "state",
  "client_id": 42,
  "recording": true,
  "battery": "23%",
}
```

---

# Problems to be identified

1. **~~Clock synchronization:~~** 

2. **Android development:** This is the unknown territory we will be facing. A lot of LLM generated code will be required.

3. **Speech enhancement:** using ML and DSP-absed processing pipelines

4. **Failures and recovery:** Recovering disconnected recording sessions.

5. **Enhancement processing states:** The `/enhance` endpoint shouldn't just be a POST that hangs. We might need a "status" field in our recording metadata: `[Original, Processing, Enhanced, Failed]`

---

# Resources

- [REST API Introduction - GeeksforGeeks](https://www.geeksforgeeks.org/node-js/rest-api-introduction/)

- [WebSockets - an article](https://siddharthsahu.com/websocket-an-in-depth-beginners-guide)

- [mDNS - medium.com](https://medium.com/@potto_94870/understand-mdns-with-an-example-1e05ef70013b)

#### Research papers

- [Autodirective Audio Capturing Through a
  Synchronized Smartphone Array](https://xyzhang.ucsd.edu/papers/Sur_Wei_MobiSys14_Dia.pdf) - Similar to our project, contains info about clock synchronization problem.

---
