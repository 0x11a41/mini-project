from enum import Enum
from typing import Optional, List, Dict, Union, Literal
import asyncio
import socket
import uuid
import time

from fastapi import WebSocket
from pydantic import BaseModel, Field
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceInfo

from backend.utils import getLocalIp, getRandomName


# =========================================================
# Enums
# =========================================================
class SessionState(str, Enum):
    IDLE = "idle"
    RECORDING = "recording"
    UPLOADING = "uploading"
    ERROR = "error"

class EventType(str, Enum):
    SESSION_INIT = "session_init"
    DASHBOARD_RENAME = "dashboard_rename"
    SYNC_RESULT = "sync_result"
    CLIENT_REGISTERED = "client_registered"

class CommandAction(str, Enum):
    START_ALL = "start_all"
    STOP_ALL = "stop_all"
    START_ONE = "start_one"
    STOP_ONE = "stop_one"
    RENAME = "rename"

# =========================================================
# Core Models
# =========================================================
class ClientMetadata(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=50)
    ip: str
    state: SessionState = SessionState.IDLE
    battery_level: Optional[int] = Field(default=None, ge=0, le=100)
    # Clock sync
    clock_offset: float = 0.0
    last_rtt: float = 0.0
    last_sync: Optional[int] = None


class ServerInfo(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    ip: str
    session_count: int = 0


# =========================================================
# WebSocket Payload Schemas (Discriminated)
# =========================================================
class BaseWSMessage(BaseModel):
    version: int = 1
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


# ---- Bodies ------------------------------------------------
class WSRename(BaseModel):
    new_name: str

class SyncResult(BaseModel):
    clock_offset: float
    rtt: float


# ---- Messages ---------------------------------------------
class SessionInitMessage(BaseWSMessage):
    event: Literal[EventType.SESSION_INIT]
    body: ClientMetadata


class DashboardRenameMessage(BaseWSMessage):
    event: Literal[EventType.DASHBOARD_RENAME]
    body: WSRename


class SyncResultMessage(BaseWSMessage):
    event: Literal[EventType.SYNC_RESULT]
    body: SyncResult


class ClientRegisteredMessage(BaseWSMessage):
    event: Literal[EventType.CLIENT_REGISTERED]
    body: ClientMetadata


class CommandMessage(BaseModel):
    action: CommandAction


WSPayload = Union[
    SessionInitMessage,
    DashboardRenameMessage,
    SyncResultMessage,
    ClientRegisteredMessage,
    CommandMessage,
]


# =========================================================
# Clock Sync Models
# =========================================================
class SyncResponse(BaseModel):
    type: str = "SYNC"
    t1: int
    t2: int
    t3: int


# =========================================================
# Sessions Handler (Thread-Safe)
# =========================================================
class SessionsHandler:
    def __init__(self):
        self.sessions: Dict[str, Dict] = {}
        self.lock = asyncio.Lock()


    async def connect(self, meta: ClientMetadata, ws: WebSocket) -> str:
        """
        Register new client session. Server always generates ID.
        """
        client_id = str(uuid.uuid4())
        meta.id = client_id
        await ws.accept()
        async with self.lock:
            self.sessions[client_id] = { "meta": meta, "ws": ws }

        # Send init packet
        payload = SessionInitMessage(
            event=EventType.SESSION_INIT,
            body=meta
        )
        await ws.send_json(payload.model_dump())
        return client_id


    async def terminate(self, session_id: str):
        async with self.lock:
            session = self.sessions.get(session_id)
            if not session:
                return
            try:
                await session["ws"].close()
            except Exception:
                pass

            del self.sessions[session_id]


    async def send_to_one(self, session_id: str, data: WSPayload):
        async with self.lock:
            session = self.sessions.get(session_id)
        if not session:
            return
        await session["ws"].send_json(data.model_dump())


    async def broadcast(self, data: WSPayload):
        async with self.lock:
            session_ids = list(self.sessions.keys())
        dead = []
        for sid in session_ids:
            try:
                await self.send_to_one(sid, data)
            except Exception:
                dead.append(sid)

        for sid in dead:
            await self.terminate(sid)


    async def update_sync( self, session_id: str, theta: float, rtt: float ):
        async with self.lock:
            session = self.sessions.get(session_id)
            if not session:
                return

            meta: ClientMetadata = session["meta"]
            meta.clock_offset = theta
            meta.last_rtt = rtt
            meta.last_sync = int(time.time() * 1000)


    async def get_info(self) -> List[ClientMetadata]:
        async with self.lock:
            return [s["meta"] for s in self.sessions.values()]


    async def count(self) -> int:
        async with self.lock:
            return len(self.sessions)


# =========================================================
# Dashboard Manager
# =========================================================
class DashboardManager:
    def __init__(self):
        self.dashboard: Optional[WebSocket] = None
        self.lock = asyncio.Lock()


    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.dashboard = ws


    async def disconnect(self):
        async with self.lock:
            if not self.dashboard:
                return
            try:
                await self.dashboard.close()
            except Exception:
                pass
            self.dashboard = None


    async def notify(self, data: WSPayload):
        async with self.lock:
            ws = self.dashboard
        if not ws:
            return
        try:
            await ws.send_json(data.model_dump())
        except Exception:
            await self.disconnect()


    async def available(self) -> bool:
        async with self.lock:
            return self.dashboard is not None


# =========================================================
# Application State
# =========================================================
class AppState:
    def __init__(
        self,
        port: int,
        ip: Optional[str] = None,
        server_name: Optional[str] = None
    ):

        self.ip = ip or getLocalIp()
        self.port = port

        self.server_info: ServerInfo = ServerInfo(
            name=server_name or getRandomName(),
            ip=self.ip
        )

        self.dashboard: DashboardManager = DashboardManager()
        self.sessions: SessionsHandler = SessionsHandler()

        self.mdns: AsyncZeroconf = AsyncZeroconf()
        self.mdns_conf: Optional[AsyncServiceInfo] = None

        self.pending_clients: Dict[str, ClientMetadata] = {}
        self.pending_lock = asyncio.Lock()


    def _make_mdns_conf(self, name: str) -> AsyncServiceInfo:
        return AsyncServiceInfo(
            type_="_vocalink._tcp.local.",
            name=f"{name}._vocalink._tcp.local.",
            addresses=[socket.inet_aton(self.ip)],
            port=self.port,
            properties={
                b"service": b"vocalink",
                b"name": name.encode()
            }
        )


    async def start_mdns(self):
        self.mdns_conf = self._make_mdns_conf(self.server_info.name)
        await self.mdns.async_register_service(self.mdns_conf)


    async def rename_dashboard(self, new_name: str):
        self.server_info.name = new_name
        if self.mdns_conf:
            await self.mdns.async_unregister_service(self.mdns_conf)

        self.mdns_conf = self._make_mdns_conf(new_name)
        await self.mdns.async_register_service(self.mdns_conf)

        payload = DashboardRenameMessage(
            event=EventType.DASHBOARD_RENAME,
            body=WSRename(new_name=new_name)
        )
        await self.sessions.broadcast(payload)


    async def update_session_count(self):
        self.server_info.session_count = await self.sessions.count()


    async def shutdown(self):
        if self.mdns_conf:
            await self.mdns.async_unregister_service(self.mdns_conf)
        await self.mdns.async_close()
