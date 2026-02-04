from enum import Enum
from typing import Optional, List, Dict, Union, Literal
import asyncio
import socket
import time
from fastapi import WebSocket
from pydantic import BaseModel, Field, ValidationError
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceInfo

from backend.utils import getLocalIp, getRandomName

######### Enums ###########
class SessionState(str, Enum):
    IDLE = "idle"
    RECORDING = "recording"
    UPLOADING = "uploading"
    ERROR = "error"

class RESTEvents(str, Enum):
    SESSION_STAGE = "session_stage" # stage request
    SESSION_STAGED = "session_staged" # staging acknoledgement

class WSEvents(str, Enum): # these are facts that should be notified
    DASHBOARD_INIT = "dashboard_init"
    DASHBOARD_RENAME = "dashboard_rename"
    SESSION_RENAME = "session_rename"
    # events produced by server
    SESSION_ACTIVATED = "session_activated" # to update session registration to frontend
    SESSION_ACTIVATE = "session_activate"
    SESSION_LEFT = "session_left"
    VOLUNTARY_START = "voluntary_start"
    VOLUNTARY_STOP = "voluntary_STOP"

class WSAction(str, Enum): # these are intents of session or dashboard
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
    active_sessions: int = 0



# WebSocket Payload Schemas (Discriminated)
class SessionStageRequestMsg(BaseModel):
    event: Literal[RESTEvents.SESSION_STAGE] = RESTEvents.SESSION_STAGE
    body: SessionMetadata

class SessionStageResponseMsg(BaseModel): # server -> session
    event: Literal[RESTEvents.SESSION_STAGED] = RESTEvents.SESSION_STAGED
    body: SessionMetadata

class SessionActivateRequestMsg(BaseModel): # session -> server
    event: Literal[WSEvents.SESSION_ACTIVATE] = WSEvents.SESSION_ACTIVATE
    body: str # session id

class SessionActivateReportMsg(BaseModel): # server -> dashboard
    event: Literal[WSEvents.SESSION_ACTIVATED] = WSEvents.SESSION_ACTIVATED
    body: SessionMetadata

class SessionLeftMsg(BaseModel):
    event: Literal[WSEvents.SESSION_LEFT] = WSEvents.SESSION_LEFT
    body: SessionMetadata
    
class DashboardInitMsg(BaseModel): # dashboard -> server
    event: Literal[WSEvents.DASHBOARD_INIT] = WSEvents.DASHBOARD_INIT
    body: Optional[str] = None

class SessionRenameMsg(BaseModel): # session -> server -> dashboard
    event: Literal[WSEvents.SESSION_RENAME] = WSEvents.SESSION_RENAME
    session_id: str
    body: str # new_name

class DashboardRenameMsg(BaseModel): # dashboard -> server -> sessions
    event: Literal[WSEvents.DASHBOARD_RENAME] = WSEvents.DASHBOARD_RENAME
    body: str # new_name

class VoluntaryStartMsg(BaseModel): # session -> server -> dashboard
    event: Literal[WSEvents.VOLUNTARY_START] = WSEvents.VOLUNTARY_START
    body: SessionMetadata

class VoluntaryStopMsg(BaseModel): # session -> server -> dashboard
    event: Literal[WSEvents.VOLUNTARY_STOP] = WSEvents.VOLUNTARY_STOP
    body: SessionMetadata

# to contain action messages like start_all, end_all...
class ActionMsg(BaseModel): # bidirectional
    action: WSAction
    session_id: Optional[str] = None
    trigger_time: Optional[int] = None



WSPayload = Union[
    DashboardInitMsg,
    SessionRenameMsg,
    DashboardRenameMsg,
    SessionActivateRequestMsg,
    SessionActivateReportMsg,
    SessionLeftMsg,
    VoluntaryStartMsg,
    VoluntaryStopMsg,
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

    def ws(self) -> Optional[WebSocket]:
        return self._dashboard

    async def assign(self, ws: WebSocket):
        async with self.lock:
            if self._dashboard is None:
                self._dashboard = ws


    async def drop(self):
        async with self.lock:
            self._dashboard = None


    async def notify(self, payload: WSPayload):
        if not self._dashboard:
            print("failed to update UI: dashboard is offline")
            return
        try:
            await self._dashboard.send_json(payload.model_dump())
        except Exception:
            pass


    async def available(self) -> bool:
        async with self.lock:
            return self._dashboard is not None



class Session:
    __slots__ = ('meta', 'ws') 
    def __init__(self, meta: SessionMetadata, ws: WebSocket):
        self.meta: SessionMetadata = meta
        self.ws: WebSocket = ws


class SessionsHandler: # thread safe
    def __init__(self):
        self._active: Dict[str, Session] = {}
        self._staging: Dict[str, SessionMetadata] = {} # session_id, meta
        self._lock = asyncio.Lock()


    async def setStateAll(self, new_state: SessionState):
        async with self._lock:
            for session in self._active.values():
                session.meta.state = new_state


    async def setState(self, session_id: str, new_state: SessionState):
        async with self._lock:
            session = self._active.get(session_id)
            if session:
                session.meta.state = new_state
            

    async def getActiveCount(self) -> int:
        async with self._lock:
            return len(self._active)


    async def is_active(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._active


    async def exists(self, session_id: str) -> bool:
        async with self._lock:
            return (session_id in self._active or session_id in self._staging)


    async def getMetaFromAllActive(self) -> List[SessionMetadata]:
        async with self._lock:
            return [s.meta for s in self._active.values()]


    async def getMetaFromActive(self, session_id: str) -> Optional[SessionMetadata]:
        async with self._lock:
            s = self._active.get(session_id)
            return s.meta if s else None


    # puts metadata into staging
    async def stage(self, meta: SessionMetadata) -> None:
        async with self._lock:
            self._staging[meta.id] = meta

    # release session_id entry from staging and put it into active 
    async def commit(self, session_id: str, session_ws: WebSocket) -> Optional[SessionMetadata]:
        async with self._lock:
            meta = self._staging.pop(session_id, None)
            if not meta:
                if session_id in self._active:
                    return self._active[session_id].meta
                return None

            self._active[meta.id] = Session(meta, session_ws)
            return meta


    async def drop(self, session_id: str):
        async with self._lock:
            if session_id in self._active:
                del self._active[session_id]
            elif session_id in self._staging:
                del self._staging[session_id]


    async def send_to_one(self, session_id: str, data: WSPayload) -> None:
        async with self._lock:
            if session := self._active.get(session_id):
                try:
                    await session.ws.send_json(data.model_dump())
                except Exception as e:
                    print(f"Error sending to {session_id}: {e}")


    async def broadcast(self, data: WSPayload) -> None:
        async with self._lock:
            targets = [(sid, s.ws) for sid, s in self._active.items()]
        
        payload = data.model_dump()
        for sid, ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:
                pass

    
    async def update_sync(self, session_id: str, report: SyncReport) -> None:
        async with self._lock:
            session = self._active.get(session_id)
            if session:
                session.meta.theta = report.theta
                session.meta.last_rtt = report.rtt
                session.meta.last_sync = int(time.time() * 1000)


    async def session_id(self, ws: WebSocket) -> Optional[str]:
        async with self._lock:
            for session_id, session in self._active.items():
                if session.ws is ws:
                    return session_id
        return None
        


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
        self.clock: SyncHandler = SyncHandler()

        self.mdns: AsyncZeroconf = AsyncZeroconf()
        self.mdns_conf: Optional[AsyncServiceInfo] = None

    async def server_info(self) -> ServerInfo:
        return ServerInfo(
            name=self.name,
            ip=self.ip,
            active_sessions = await self.sessions.getActiveCount()
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


    async def shutdown(self):
        if self.mdns_conf:
            await self.mdns.async_unregister_service(self.mdns_conf)
        await self.mdns.async_close()


    async def handle_ws_events(self, data, ws: WebSocket):
        event: WSEvents = data.get("event")

        if event == WSEvents.DASHBOARD_INIT:
            await self.dashboard.assign(ws)            
            print("dashboard online.")

        elif event == WSEvents.DASHBOARD_RENAME:
            payload = DashboardRenameMsg.model_validate(data)            
            await self.sessions.broadcast(payload)

        elif event == WSEvents.SESSION_RENAME:
            payload = SessionRenameMsg.model_validate(data)
            await self.dashboard.notify(payload)

        elif event == WSEvents.SESSION_ACTIVATE:
            request = SessionActivateRequestMsg.model_validate(data)
            session_id = str(request.body)
            sessionMeta = await self.sessions.commit(session_id, ws)
            if not sessionMeta:
                print(session_id + "was not found in staging area")
                return

            await self.dashboard.notify(SessionActivateReportMsg(body=sessionMeta))
        elif event == WSEvents.VOLUNTARY_START:
            msg = VoluntaryStartMsg.model_validate(data)
            self.dashboard.notify(msg)

        elif event == WSEvents.VOLUNTARY_STOP:
            msg = VoluntaryStopMsg.model_validate(data)
            self.dashboard.notify(msg)

        else:
            print("[error] invalid event received: " + event)


    async def _calc_trigger_time(self) -> int:
        SAFETY_MS = 200
        MIN_DELAY = 500
        DEFAULT_DELAY = 800
        MAX_SYNC_AGE = 10_000  # ms

        metas = await self.sessions.getMetaFromAllActive()
        valid_rtts = []
        now = int(time.time() * 1000)

        for meta in metas:
            if not meta:
                continue
            if meta.last_rtt is None:
                continue
            if meta.last_sync is None:
                continue
            if now - meta.last_sync > MAX_SYNC_AGE:
                continue
            valid_rtts.append(meta.last_rtt)

        if not valid_rtts:
            delay = DEFAULT_DELAY
        else:
            max_rtt = max(valid_rtts)
            delay = max(MIN_DELAY, int(max_rtt * 2) + SAFETY_MS)

        return now + delay


    async def handle_ws_actions(self, msg: ActionMsg, ws: WebSocket):
        from_session = await self.sessions.session_id(ws)
        from_dashboard = ws == self.dashboard.ws()
        if not from_dashboard and not from_session:
            print("[error] Unauthenticated action sender")
            return

        try:
            msg = ActionMsg.model_validate(msg)
        except ValidationError as e:
            print(e)
            return

        if msg.action in (WSAction.START_ALL, WSAction.START_ONE) and not from_dashboard:
            print("[warn] Session attempted to start recording")
            return

        trigger = None
        if msg.action in (WSAction.START_ALL, WSAction.START_ONE):
            trigger = await self._calc_trigger_time()


        if msg.action == WSAction.START_ALL:
            action = ActionMsg(
                action=msg.action,
                trigger_time=trigger
            )
            await self.sessions.broadcast(action)
            await self.sessions.setStateAll(SessionState.RECORDING)

        elif msg.action == WSAction.START_ONE:
            if not msg.session_id:
                return

            action = ActionMsg(
                action=msg.action,
                session_id=msg.session_id,
                trigger_time=trigger
            )
            await self.sessions.send_to_one(msg.session_id, action)
            await self.sessions.setState(msg.session_id, SessionState.RECORDING)

        elif msg.action == WSAction.STOP_ALL:
            await self.sessions.broadcast(msg)
            await self.sessions.setStateAll(SessionState.IDLE)

        elif msg.action == WSAction.STOP_ONE:
            if msg.session_id:
                await self.sessions.send_to_one(msg.session_id, msg)
                await self.sessions.setState(msg.session_id, SessionState.IDLE)
        

    
    async def handle_disconnect(self, ws: WebSocket):
        if ws == self.dashboard.ws():
            await self.dashboard.drop()
            print("dashboard went offline.")
            return

        session_id = await self.sessions.session_id(ws)
        if session_id:
            meta = await self.sessions.getMetaFromActive(session_id)
            meta and await self.dashboard.notify(SessionLeftMsg(body=meta))

            await self.sessions.drop(session_id)
            await self.clock.remove(session_id)

            print("session [" + session_id + "] disconnected.")
        else:
            print("unknown session disconnected")
