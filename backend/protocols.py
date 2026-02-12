from enum import Enum
from typing import Optional, List, Dict, Union, Literal
import asyncio
import socket
import time
from fastapi import WebSocket
from pydantic import BaseModel, Field, ValidationError
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceInfo
from backend.utils import get_local_ip, get_random_name


class SessionMetadata(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=50)
    ip: str
    battery: int = -1
    device: str
    theta: float = -1
    last_rtt: float = -1
    last_sync: Optional[int] = None

class ServerInfo(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    ip: str
    active_sessions: int = 0



############## REST API message models ##############
class RESTEvents(str, Enum):
    SESSION_STAGE = "session_stage" # stage request
    SESSION_STAGED = "session_staged" # staging acknoledgement

class SessionStageRequestMsg(BaseModel):
    event: Literal[RESTEvents.SESSION_STAGE] = RESTEvents.SESSION_STAGE
    body: SessionMetadata

class SessionStageResponseMsg(BaseModel): # server -> session
    event: Literal[RESTEvents.SESSION_STAGED] = RESTEvents.SESSION_STAGED
    body: SessionMetadata



############# WebSocket messages #####################
class Rename(BaseModel):
    new_name: str
    session_id: Optional[str] = None

class WSActionTarget(BaseModel):
    session_id: str # "session_id=all" is multicast message
    trigger_time: Optional[int] = None

class WSKind(str, Enum):
    ACTION = "action"
    EVENT = "event"
    ERROR= "error"

class WSErrors(str, Enum):
    INVALID_KIND = "invalid_kind" # kind field is invalid inside payload
    INVALID_EVENT = "invalid_event" # event field is invalid
    INVALID_ACTION = "invalid_action" # action field is invalid
    INVALID_BODY = "invalid_body" # couldn't validate body
    ACTION_NOT_ALLOWED = "action_not_allowed"
    SESSION_NOT_FOUND = "session_not_found"

class WSEvents(str, Enum): # these are facts that should be notified
    DASHBOARD_INIT = "dashboard_init" # dashboard[None]::server 
    DASHBOARD_RENAME = "dashboard_rename" # dashboard[Rename]::server::session
    SESSION_RENAME = "session_rename" # session[Rename]::server::dashboard
    SESSION_ACTIVATE = "session_activate" # session[SessionMetadata]::
    SESSION_ACTIVATED = "session_activated" # server[SessionMetadata]::dashboard
    SESSION_LEFT = "session_left" # server[SessionMetadata]::dashboard
    SESSION_SELF_START = "session_self_start" # session[SessionMetadata]::server::dashboard
    SESSION_SELF_STOP = "session_self_stop" # session[SessionMetadata]::server::dashboard
    SUCCESS="success" # session[SessionMetadata]::server::dashboard
    FAIL="failed" # session[SessionMetadata]::server::dashboard

class WSActions(str, Enum): # these are intents of session or dashboard
    START = "start" # dashboard[WSActionTarget]::server::target_session
    STOP = "stop" # dashboard[WSActionTarget]::server::target_session
    STARTED = "started" # session[session_id]::server::dashboard
    STOPPED = "stopped" # session[session_id]::server::dashboard


class WSPayload(BaseModel):
    kind: WSKind
    msg_type: Union[WSActions, WSEvents, WSErrors]
    body: Optional[Union[SessionMetadata, WSActionTarget, Rename]] = None



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



# QR code data interface
class QRData(BaseModel):
    type: str = "vocal_link_server"
    name: str
    ip: str



async def send_error(ws: WebSocket, type: WSErrors):
    msg = WSPayload(kind=WSKind.ERROR, msg_type=type).model_dump()
    print(msg)
    await ws.send_json(msg)

def now_ms():
    return time.time_ns() // 1_000_000



class DashboardHandler:
    def __init__(self):
        self._dashboard: Optional[WebSocket] = None
        self.lock = asyncio.Lock()


    def ws(self) -> Optional[WebSocket]:
        return self._dashboard


    async def assign(self, ws: WebSocket):
        async with self.lock:
            if self._dashboard and self._dashboard != ws:
                try:
                    await self._dashboard.close()
                except Exception:
                    pass 
            self._dashboard = ws


    async def drop(self, ws: WebSocket):
        async with self.lock:
            if self._dashboard == ws:
                self._dashboard = None


    async def notify(self, payload: WSPayload):
        if not self._dashboard:
            print("failed to update UI: dashboard is offline")
            return
        try:
            await self._dashboard.send_json(payload.model_dump())
        except Exception as e:
            print(f"Error sending to dashboard: {e}")


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

    async def replaceMeta(self, new_meta: SessionMetadata):
        async with self._lock:
            session = self._active.get(new_meta.id)
            if session:
                session.meta = session.meta.model_copy(update=new_meta.model_dump())
                

    async def rename(self, session_id: str, new_name: str):
        async with self._lock:
            session = self._active.get(session_id)
            if session:
                session.meta.name = new_name


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
            return [s.meta.model_copy() for s in self._active.values()]


    async def getMetaFromActive(self, session_id: str) -> Optional[SessionMetadata]:
        async with self._lock:
            s = self._active.get(session_id)
            return s.meta.model_copy() if s else None


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
                    self._active[session_id].ws = session_ws
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


    async def send_to_one(self, session_id, payload):
        async with self._lock:
            session = self._active.get(session_id)
            ws = session.ws if session else None

        if not ws:
            return

        try:
            await ws.send_json(payload.model_dump())
        except Exception as e:
            print(e)


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
                session.meta.last_sync = now_ms()


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
        t2_ms = now_ms() 
        if not ws:
            return
        try:
            t3_ms = now_ms()
            await ws.send_json(SyncResponse(
                t1=req.t1, 
                t2=t2_ms,
                t3=t3_ms
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

        self.ip:str = ip or get_local_ip()
        self.port:int = port
        self.name:str = server_name or get_random_name()

        self.dashboard: DashboardHandler = DashboardHandler()
        self.sessions: SessionsHandler = SessionsHandler()
        self.clock: SyncHandler = SyncHandler()

        self.mdns: AsyncZeroconf = AsyncZeroconf()
        self.mdns_conf: Optional[AsyncServiceInfo] = None


    async def _eval_trigger_time(self) -> int:
        SAFETY_MS = 200
        MIN_DELAY = 500
        DEFAULT_DELAY = 800
        MAX_SYNC_AGE = 10_000  # ms

        metas = await self.sessions.getMetaFromAllActive()
        valid_rtts = []
        now = now_ms()

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


    async def rename(self, data: Rename):
        old_name = self.name
        self.name = data.new_name

        try:
            if self.mdns_conf:
                await self.mdns.async_unregister_service(self.mdns_conf)
        
            self.mdns_conf = self._make_mdns_conf()
            await self.mdns.async_register_service(self.mdns_conf)
            print(f"[SERVER] Renamed from '{old_name}' to '{self.name}'")

        except Exception as e:
            self.name = old_name
            print(f"[SERVER] mDNS Rename Failed: {e}")
            return
    
        await self.sessions.broadcast(WSPayload(
                            kind=WSKind.EVENT,
                            msg_type=WSEvents.DASHBOARD_RENAME,
                            body=data
                        ))

    
    async def shutdown(self):
        if self.mdns_conf:
            await self.mdns.async_unregister_service(self.mdns_conf)
        await self.mdns.async_close()


    async def handle_ws_events(self, payload: WSPayload, ws: WebSocket):
        if payload.kind != WSKind.EVENT:
            return

        event_type = payload.msg_type

        if event_type == WSEvents.DASHBOARD_INIT:
            await self.dashboard.assign(ws)            
            print("dashboard online.")

        elif event_type == WSEvents.DASHBOARD_RENAME:
            try:
                rename = Rename.model_validate(payload.body)
            except ValidationError:
                await send_error(ws, WSErrors.INVALID_BODY)
                try:
                    await ws.close(code=1007)
                except Exception:
                    pass
                return

            await self.rename(rename)


        elif event_type == WSEvents.SESSION_RENAME:
            try:
                rename = Rename.model_validate(payload.body)
            except ValidationError:
                await send_error(ws, WSErrors.INVALID_BODY)
                try:
                    await ws.close(code=1007)
                except Exception:
                    pass
                return
            
            await self.dashboard.notify(payload)


        elif event_type == WSEvents.SESSION_ACTIVATE:
            try:
                meta = SessionMetadata.model_validate(payload.body)
            except ValidationError:
                await send_error(ws, WSErrors.INVALID_BODY)
                try:
                    await ws.close(code=1007)
                except Exception:
                    pass
                return

            session_id = meta.id
            sessionMeta = await self.sessions.commit(session_id, ws)
            if not sessionMeta:
                send_error(ws, WSErrors.SESSION_NOT_FOUND)
                try:
                    await ws.close(code=1007)
                except Exception:
                    pass
                return

            await self.dashboard.notify(
                    WSPayload(
                          kind=WSKind.EVENT,
                          msg_type=WSEvents.SESSION_ACTIVATED,
                          body=sessionMeta
                      )
                )


        elif event_type in (WSEvents.SESSION_SELF_START, WSEvents.SESSION_SELF_STOP):
            try:
                meta = SessionMetadata.model_validate(payload.body)
            except ValidationError:
                await send_error(ws, WSErrors.INVALID_BODY)
                try:
                    await ws.close(code=1007)
                except Exception:
                    pass
                return

            await self.dashboard.notify(payload)


        elif event_type in (WSEvents.SUCCESS, WSEvents.FAIL):
            await self.dashboard.notify(payload)

        else:
            await send_error(ws, WSErrors.INVALID_EVENT)
            try:
                await ws.close(code=1007)
            except Exception:
                pass


    async def handle_ws_actions(self, payload: WSPayload, ws: WebSocket):
        if payload.kind != WSKind.ACTION:
            return

        from_session_id = await self.sessions.session_id(ws)
        is_dashboard = (ws == self.dashboard.ws())
        
        if not is_dashboard and not from_session_id:
            print("[error] Unauthenticated action sender")
            await send_error(ws, WSErrors.ACTION_NOT_ALLOWED)
            return

        action_type = payload.msg_type

        if action_type in (WSActions.START, WSActions.STOP):
            if not is_dashboard:
                print(f"[warn] Session {from_session_id} attempted to issue command {action_type}")
                await send_error(ws, WSErrors.ACTION_NOT_ALLOWED)
                return

            try:
                target = WSActionTarget.model_validate(payload.body)
            except ValidationError as e:
                print(f"[error] Invalid action body: {e}")
                await send_error(ws, WSErrors.INVALID_BODY)
                return

            if action_type == WSActions.START:
                trigger = await self._eval_trigger_time()
                target.trigger_time = trigger
                payload.body = target

            if target.session_id.lower() == "all":
                await self.sessions.broadcast(payload)
            else:
                if await self.sessions.is_active(target.session_id):
                    await self.sessions.send_to_one(target.session_id, payload)
                else:
                    await send_error(ws, WSErrors.SESSION_NOT_FOUND)

        elif action_type in (WSActions.STARTED, WSActions.STOPPED):
            if not from_session_id:
                print("[warn] Dashboard attempted to fake a status update")
                return

            try:
                status_update = WSActionTarget.model_validate(payload.body)
            except ValidationError:
                await send_error(ws, WSErrors.INVALID_BODY)
                return

            if status_update.session_id != from_session_id:
                print(f"[warn] Spoofing attempt: {from_session_id} tried to report for {status_update.session_id}")
                return

            await self.dashboard.notify(payload)
        else:
            await send_error(ws, WSErrors.INVALID_ACTION)
                
        

    async def handle_disconnect(self, ws: WebSocket):
        if ws == self.dashboard.ws():
            await self.dashboard.drop(ws)
            print("dashboard went offline.")
            return

        session_id = await self.sessions.session_id(ws)
        if session_id:
            meta = await self.sessions.getMetaFromActive(session_id)
            meta and await self.dashboard.notify(
                WSPayload(
                    kind=WSKind.EVENT,
                    msg_type=WSEvents.SESSION_LEFT,
                    body=meta
                )
            )

            await self.sessions.drop(session_id)
            await self.clock.remove(session_id)

            print("session [" + session_id + "] disconnected.")
        else:
            print("unknown session disconnected")
