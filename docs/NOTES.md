### Table of Contents

1. [Project Proposal](#project-proposal)
2. [UI Mockups](#ui-mockups)
3. [Anticipated Communication Architecture](#anticipated-communication-architecture)
4. [Endpoints](#Endpoints)

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

# UI Mockups

#### Server Dashboard

![dashboard](mockups/dashboard.png)

#### Client's Server Selection Page

![client](mockups/client's-server-selection-view.png)

>  [link to choosen client side application](https://github.com/0x11a41/fossify-voice-recorder#)

---

# Anticipated communication architecture

## server discovery

### Option 1: Subnet Scanning

**How it works:**

1. The Recorder (client) identifies its own IP (e.g., `192.168.1.15`).

2. It loops through every IP on that subnet (`192.168.1.1` to `192.168.1.255`).

3. It sends a "ping" (a quick HTTP GET) to `http://[IP]:6210/ping`.

4. The IP's that responds "alive" is identified as the Controllers.

send the pings asyncronously to discover the server faster. **Optimization :** do a light-weigh TCP handshake on the ip:port before trying sending http request.

### Option 2: using QR code

server displays a qr code containing info about ip address, port number and server's name.

### Option 3: (Fallback) manually entering IP address

Option 1 is not garunteed to find the server since some routers interpret the bruite force method as a security attack and blocks the traffic. That's why option 2 exist. If option two doesn't work for some reason, manually entering the ip address will be the last resort for establishing connection.

### ~~mDNS for server discovery~~

> NOTE: option one appeared more reliable than mDNS; when tested. 

---

## REST API and WebSockets for communication

After the client discovers server information, it can now use the server's ip address and port number to communicate to that server using predefined **routes**.
A route is a path within our server that essentially leads to a function call. For example, we can define `http://localhost:8000/ping` where **`/ping`** is a route that calls a function that lies on the server to check whether server is alive or not.

**What's REST API ?** It is basically a cool name for http methods - GET, POST, PUT, DELETE ... [read more](https://restfulapi.net/http-methods/)

**Why do we need it ?** everything we will be doing apart from control commands (ie, START_RECORD, STOP_RECORD) will be using REST API methods. 

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

# Endpoints

#### 1. Server Metadata

| Purpose            | Endpoint      | Method |
| ------------------ | ------------- | ------ |
| Get server info    | `/session`    | GET    |
| Update server name | `/session`    | PATCH  |
| Get QR code        | `/session/qr` | GET    |

Example:

```json
// GET /session
{
  "name": "Podcast101",
  "ip": "192.168.1.172",
  "clients": 3
}
```

#### 2. Client Lifecycle

| Purpose         | Endpoint        | Method |
| --------------- | --------------- | ------ |
| Register client | `/clients`      | POST   |
| List clients    | `/clients`      | GET    |
| Get client info | `/clients/{id}` | GET    |
| Remove client   | `/clients/{id}` | DELETE |
| Rename client   | `/clients/{id}` | PATCH  |

Example:

```json
// POST /clients
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

#### 9. WebSockets Control Channel

```
/ws/control
```

All commands go through this endpoint.

**Message Format :**
```json
// status
{
  "active": true, 
  "recording": true,
}
```

```json
// record all
{
  "type": "command",
  "target": "all",
  "action": "start_recording"
}
```

```json
// record specific client
{
  "type": "command",
  "target": "client",
  "client_id": 42,
  "action": "stop_recording"
}
```

```json
// State Updates (Client → Server)
{
  "type": "state",
  "client_id": 42,
  "recording": true,
}
```

#### Summary

| Category   | Purpose               | Endpoint                    | Method | Description                                    |
| ---------- | --------------------- | --------------------------- | ------ | ---------------------------------------------- |
| Session    | Get session info      | `/session`                  | GET    | Fetch server name, IP, and session metadata    |
| Session    | Update session        | `/session`                  | PATCH  | Rename or update session information           |
| Session    | Get QR code           | `/session/qr`               | GET    | Generate connection QR code                    |
| Client     | Register client       | `/clients`                  | POST   | Register new device with server                |
| Client     | List clients          | `/clients`                  | GET    | Retrieve all connected clients                 |
| Client     | Get client details    | `/clients/{id}`             | GET    | Fetch specific client information              |
| Client     | Update client         | `/clients/{id}`             | PATCH  | Rename or update client metadata               |
| Client     | Remove client         | `/clients/{id}`             | DELETE | Disconnect and remove client                   |
| Recordings | Upload recording      | `/recordings`               | POST   | Upload recorded audio file                     |
| Recordings | List recordings       | `/recordings`               | GET    | Retrieve all recordings                        |
| Recordings | Get recording info    | `/recordings/{id}`          | GET    | Fetch recording metadata                       |
| Recordings | Delete recording      | `/recordings/{id}`          | DELETE | Remove specific recording                      |
| Recordings | Delete all recordings | `/recordings`               | DELETE | Remove all recordings                          |
| Recordings | Enhance recording     | `/recordings/{id}/enhance`  | POST   | Apply ML enhancement to one recording          |
| Recordings | Enhance all           | `/recordings/enhance`       | POST   | Apply ML enhancement to all recordings         |
| Recordings | Stream recording      | `/recordings/{id}/stream`   | GET    | Stream audio playback                          |
| Recordings | Download recording    | `/recordings/{id}/download` | GET    | Download audio file                            |
| Export     | Merge recordings      | `/export/merge`             | POST   | Merge all session recordings into one file     |
| Export     | Download merged file  | `/export/latest`            | GET    | Download most recent merged output             |
| WebSocket  | Real-time control     | `/ws/control`               | WS     | Bidirectional channel for commands and updates |
