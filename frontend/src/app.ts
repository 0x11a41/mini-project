export interface SessionMetadata {
  id: string;
  name: string;
  ip: string;
  battery_level: number;
  theta: number; 
  last_rtt: number; 
  last_sync?: number | null;
}

export interface ServerInfo {
  name: string;
  ip: string;
  active_sessions: number;
}

export enum RESTEvents {
  SESSION_STAGE = "session_stage",
  SESSION_STAGED = "session_staged",
}

export interface SessionStageRequestMsg {
  event: RESTEvents.SESSION_STAGE;
  body: SessionMetadata;
}

export interface SessionStageResponseMsg {
  event: RESTEvents.SESSION_STAGED;
  body: SessionMetadata;
}

export enum WSKind {
  ACTION = "action",
  EVENT = "event",
  ERROR = "error",
}

export enum WSErrors {
  INVALID_KIND = "invalid_kind",
  INVALID_EVENT = "invalid_event",
  INVALID_BODY = "invalid_body",
  ACTION_NOT_ALLOWED = "action_not_allowed",
  SESSION_NOT_FOUND = "session_not_found",
}

export enum WSEvents {
  DASHBOARD_INIT = "dashboard_init",
  DASHBOARD_RENAME = "dashboard_rename",
  SESSION_RENAME = "session_rename",
  SESSION_ACTIVATE = "session_activate",
  SESSION_ACTIVATED = "session_activated",
  SESSION_LEFT = "session_left",
  SESSION_SELF_START = "session_self_start",
  SESSION_SELF_STOP = "session_self_stop",
  SUCCESS = "success",
  FAIL = "failed",
}

export enum WSActions {
  START_ALL = "start_all",
  STOP_ALL = "stop_all",
  START_ONE = "start_one",
  STOP_ONE = "stop_one",
}

export interface Rename {
  new_name: string;
  session_id?: string | null;
}

export interface WSActionTarget {
  session_id?: string | null;
  trigger_time?: number | null;
}

export interface WSPayload {
  kind: WSKind;
  msg_type: WSActions | WSEvents | WSErrors;
  body?: SessionMetadata | WSActionTarget | Rename | null;
}

export interface QRData {
  type: "vocal_link_server";
  name: string;
  ip: string;
}

class VLApp {
  public readonly URL = "http://localhost:6210";
  public ws: WebSocket | null = null;  
  server: ServerInfo | null = null;
  public sessions = new Array<SessionMetadata>();

  async setup(): Promise<boolean> {
    try {
      const res = await fetch(this.URL + "/dashboard");
      if (!res.ok) return false;
      this.server = await res.json();

      this.ws = new WebSocket(this.URL.replace(/^http/, "ws") + "/ws/control");

      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        console.log(msg)
      };

      this.ws.onopen = () => {
        const payload: WSPayload = {
          kind: WSKind.EVENT,
          msg_type: WSEvents.DASHBOARD_INIT,
          body: null
        }
        this.ws?.send(JSON.stringify(payload));
      };

      this.ws.onerror = (e) => {
        console.error("WS error:", e);
      };

      return true;
    } catch (err) {
      console.error("Init failed:", err);
      return false;
    }
  }  
}

function renderMainView() {
  const mv = document.getElementById("main-view");
}

function renderSidebar() {
  const sidebar = document.getElementById("side-panel")
}

function render(app: VLApp) {
  renderSidebar();
  renderMainView();
  console.log('rendering')
}

const app = new VLApp()
app.setup().then((ok) => {
  if (!ok) {
    console.error("startup failed");
    return;
  }
  render(app)
})
