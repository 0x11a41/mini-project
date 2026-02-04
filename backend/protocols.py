from enum import Enum
from typing import Optional, List, Dict, Union, Literal
import asyncio
import socket
import time
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceInfo

from backend.utils import getLocalIp, getRandomName

######### Enums ###########
class SessionState(str, Enum):
    IDLE = "idle"
    RECORDING = "recording"
    UPLOADING = "uploading"
    ERROR = "error"

class WSEvent(str, Enum): # these are facts that should be notified
    SESSION_INIT = "session_init"
    DASHBOARD_RENAME = "dashboard_rename"
    SESSION_RENAME = "session_rename"
    SESSION_REGISTERED = "session_registered" # to update session registration to frontend

class WSActionRequest(str, Enum): # these are intents of session or dashboard
    START_ALL = "start_all"
    STOP_ALL = "stop_all"
    START_ONE = "start_one" # bidirectional
    STOP_ONE = "stop_one" # bidirectional



class SessionMetadata(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=50)
    ip: str
    state: SessionState = SessionState.IDLE
    battery_level: Optional[int] = Field(default=None, ge=0, le=100)
    # Clock sync
    theta: float = 0.0
    last_rtt: float = 0.0
    last_sync: Optional[int] = None

class ServerInfo(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    ip: str
    session_count: int



# WebSocket Payload Schemas (Discriminated)
class BaseWSMsg(BaseModel):
    version: float = 1.0
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


class SessionInitResponseMsg(BaseWSMsg): # session -> server -> session
    event: Literal[WSEvent.SESSION_INIT] = WSEvent.SESSION_INIT
    body: SessionMetadata

class SessionRenameMsg(BaseWSMsg): # session -> server -> dashboard
    event: Literal[WSEvent.SESSION_RENAME] = WSEvent.SESSION_RENAME
    session_id: str
    body: str # new_name

class DashboardRenameMsg(BaseWSMsg): # dashboard -> server -> sessions
    event: Literal[WSEvent.DASHBOARD_RENAME] = WSEvent.DASHBOARD_RENAME
    body: str # new_name

# informs dashboard that a new device just joined, send on ws connection success
class SessionInitReportMsg(BaseWSMsg): # server -> dashboard
    event: Literal[WSEvent.SESSION_REGISTERED] = WSEvent.SESSION_REGISTERED
    body: SessionMetadata

# to contain action messages like start_all, end_all...
class ActionMsg(BaseModel): # bidirectional
    action: WSActionRequest
    session_id: Optional[str] = None
    trigger_time: Optional[int] = None

WSPayload = Union[
    SessionInitResponseMsg,
    SessionRenameMsg,
    DashboardRenameMsg,
    SessionInitReportMsg,
    ActionMsg,
]



# Clock Sync Models : endpoint => /ws/sync, no timestamps or versioning
class SyncRequest(BaseModel): # client -> server (The ping)
    t1: int

class SyncResponse(BaseModel): # server -> client (The pong)
    type: str = "SYNC_RESPONSE" # to distingush on client side
    t1: int
    t2: int
    t3: int

class SyncReport(BaseModel): # client -> server (The report)
    theta: float
    rtt: float



class DashboardHandler:
    def __init__(self):
        self._dashboard: Optional[WebSocket] = None
        self.lock = asyncio.Lock()


    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self._dashboard = ws


    async def disconnect(self):
        async with self.lock:
            if not self._dashboard:
                return
            try:
                await self._dashboard.close()
            except Exception:
                pass
            self._dashboard = None


    async def notify(self, data: WSPayload):
        async with self.lock:
            ws = self._dashboard
        if not ws:
            return
        try:
            await ws.send_json(data.model_dump())
        except Exception:
            await self.disconnect()


    async def is_active(self) -> bool:
        async with self.lock:
            return self._dashboard is not None




class SessionsHandler: # thread safe
    def __init__(self):
        self._sessions: Dict[str, Dict] = {}
        self.lock = asyncio.Lock()
        self._pending_sessions: Dict[str, SessionMetadata] = {} # session_id, meta
        self.pending_lock = asyncio.Lock()


    async def getAllMeta(self) -> List[SessionMetadata]:
        async with self.lock:
            return [s["meta"] for s in self._sessions.values()]


    async def count(self) -> int:
        async with self.lock:
            return len(self._sessions)


    async def is_active(self, session_id: str) -> bool:
        async with self.lock:
            return session_id in self._sessions


    async def exists(self, session_id: str) -> bool:
        async with self.lock, self.pending_lock:
            return (
                session_id in self._sessions or
                session_id in self._pending_sessions
            )


    async def getMeta(self, session_id: str) -> Optional[SessionMetadata]:
        async with self.lock:
            s = self._sessions.get(session_id)
            return s["meta"] if s else None


    async def stage(self, meta: SessionMetadata) -> None:
        async with self.pending_lock:
            self._pending_sessions[meta.id] = meta


    async def claim(self, session_id: str, session_ws: WebSocket) -> SessionMetadata | None:
        async with self.pending_lock:
            meta = self._pending_sessions.pop(session_id, None)
        if not meta:
            return None

        async with self.lock:
            self._sessions[meta.id] = { "meta": meta, "ws": session_ws }
        return meta


    async def terminate(self, session_id: str) -> None:
        async with self.lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            try:
                await session["ws"].close()
            except Exception:
                pass

            del self._sessions[session_id]


    async def send_to_one(self, session_id: str, data: WSPayload) -> None:
        async with self.lock:
            session = self._sessions.get(session_id)
        if not session:
            return
        await session["ws"].send_json(data.model_dump())


    async def broadcast(self, data: WSPayload) -> None:
        async with self.lock:
            session_ids = list(self._sessions.keys())
        dead = []
        for sid in session_ids:
            try:
                await self.send_to_one(sid, data)
            except Exception:
                dead.append(sid)

        for sid in dead:
            await self.terminate(sid)

    
    async def update_sync(self, session_id: str, report: SyncReport):
        meta = await self.getMeta(session_id)
        if not meta:
            return

        async with self.lock:
            meta.theta = report.theta
            meta.last_rtt = report.rtt
            meta.last_sync = int(time.time() * 1000)



class SyncHandler:
    def __init__(self):
        self._channels: Dict[str, WebSocket] = {} # session_id -> ws
        self.lock = asyncio.Lock()


    async def add(self, session_id: str, ws: WebSocket):
        async with self.lock:
            self._channels[session_id] = ws


    async def remove(self, session_id: str):
        async with self.lock:
            ws = self._channels.pop(session_id, None)

        if ws:
            try:
                await ws.close()
            except Exception:
                pass


    async def get(self, session_id: str) -> WebSocket | None:
        async with self.lock:
            return self._channels.get(session_id)


    async def handle_ping(self, session_id: str, req: SyncRequest):
        ws = await self.get(session_id)
        t2_ns = time.time_ns() 
        if not ws:
            return
        try:
            t3_ns = time.time_ns()
            await ws.send_json(SyncResponse(
                t1=req.t1, 
                t2=t2_ns // 1_000_000, 
                t3=t3_ns // 1_000_000
            ).model_dump())
        except Exception:
            await ws.send_json({"error": "MALFORMED_T1"})



class AppState:
    def __init__(
        self,
        port: int,
        ip: Optional[str] = None,
        server_name: Optional[str] = None
    ):

        self.ip:str = ip or getLocalIp()
        self.port:int = port
        self.name:str = server_name or getRandomName()

        self.dashboard: DashboardHandler = DashboardHandler()
        self.sessions: SessionsHandler = SessionsHandler()
        self.sync: SyncHandler = SyncHandler()

        self.mdns: AsyncZeroconf = AsyncZeroconf()
        self.mdns_conf: Optional[AsyncServiceInfo] = None

        self.sync_channels: dict[str, WebSocket] = {}
        self.sync_lock = asyncio.Lock()

    async def server_info(self) -> ServerInfo:
        return ServerInfo(
            name=self.name,
            ip=self.ip,
            session_count = await self.sessions.count()
        )

    def _make_mdns_conf(self) -> AsyncServiceInfo:
        return AsyncServiceInfo(
            type_="_vocalink._tcp.local.",
            name=f"{self.name}._vocalink._tcp.local.",
            addresses=[socket.inet_aton(self.ip)],
            port=self.port,
            properties={
                b"service": b"vocalink",
                b"name": self.name
            }
        )


    async def start_mdns(self):
        self.mdns_conf = self._make_mdns_conf()
        await self.mdns.async_register_service(self.mdns_conf)


    async def rename(self, new_name: str):
        old_name = self.name
        self.name = new_name

        try:
            if self.mdns_conf:
                await self.mdns.async_unregister_service(self.mdns_conf)
        
            self.mdns_conf = self._make_mdns_conf()
            await self.mdns.async_register_service(self.mdns_conf)
            print(f"[SERVER] Renamed from '{old_name}' to '{new_name}'")

        except Exception as e:
            print(f"[SERVER] mDNS Rename Failed: {e}")
    
        await self.sessions.broadcast(DashboardRenameMsg(body=new_name))


    async def update_session_count(self):
        self.session_count = await self.sessions.count()


    async def shutdown(self):
        if self.mdns_conf:
            await self.mdns.async_unregister_service(self.mdns_conf)
        await self.mdns.async_close()
