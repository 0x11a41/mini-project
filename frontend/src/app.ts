enum SessionState {
  IDLE = "idle",
  RECORDING = "recording",
  UPLOADING = "uploading",
  ERROR = "error",
}

enum RESTEvents {
  SESSION_STAGE = "session_stage",
  SESSION_STAGED = "session_staged",
}

enum WSEvents {
  DASHBOARD_INIT = "dashboard_init",
  DASHBOARD_RENAME = "dashboard_rename",
  SESSION_RENAME = "session_rename",

  SESSION_ACTIVATED = "session_activated",
  SESSION_ACTIVATE = "session_activate",
  SESSION_LEFT = "session_left",
}

enum WSActionRequest {
  START_ALL = "start_all",
  STOP_ALL = "stop_all",
  START_ONE = "start_one",
  STOP_ONE = "stop_one",
}


interface SessionMetadata {
  id: string;
  name: string; // 1–50 chars (enforce via validation if needed)
  ip: string;
  state: SessionState;
  battery_level?: number; // 0–100
  theta: number;
  last_rtt: number;
  last_sync?: number;
}


interface ServerInfo {
  name: string; // 1–50 chars
  ip: string;
  sessions: SessionMetadata[];
}

interface SessionActivateReportMsg {
  event: WSEvents.SESSION_ACTIVATED;
  body: SessionMetadata;
}

interface SessionLeftMsg {
  event: WSEvents.SESSION_LEFT;
  body: SessionMetadata;
}

interface DashboardInitMsg {
  event: WSEvents.DASHBOARD_INIT;
  body?: string | null;
}

interface SessionRenameMsg {
  event: WSEvents.SESSION_RENAME;
  session_id: string;
  body: string; // new name
}

interface DashboardRenameMsg {
  event: WSEvents.DASHBOARD_RENAME;
  body: string; // new name
}

interface ActionMsg {
  action: WSActionRequest;
  session_id?: string;
  trigger_time?: number;
}

type WSPayload =
  | DashboardInitMsg
  | SessionRenameMsg
  | DashboardRenameMsg
  | SessionActivateReportMsg
  | SessionLeftMsg
  | ActionMsg;



class VocalLinkApp {
  public readonly URL = "http://localhost:6210";
  public server: ServerInfo | null = null;
  public ws: WebSocket | null = null;
  public sessions = new Map<string, SessionMetadata>(); // Live session map

  setState(patch: Partial<VocalLinkApp>) {
    Object.assign(this, patch);
    render(this);
  }

  handleMessage(msg: WSPayload) {
    switch (msg.event) {
      case WSEvent.SESSION_INIT:
      case WSEvent.SESSION_REGISTERED: {
        const session = msg.body;
        this.sessions.set(session.id, session);
        this.setState({});
        break;
      } case WSEvent.SESSION_RENAME: {
        const session = this.sessions.get(msg.session_id);
        if (!session) return;

        session.name = msg.body.new_name;
        this.setState({});
        break;
      } case WSEvent.DASHBOARD_RENAME: {
        if (!this.server) return;

        this.server.name = msg.body.new_name;
        this.setState({});
        break;
      } default:
        console.warn("Unknown WS event:", msg);
    }
  }

  sendAction(action: WSActionRequest, sessionId?: string, triggerTime?: number) {
    if (!this.ws) return;
    const payload: ActionMsg = {
      action,
      session_id: sessionId,
      trigger_time: triggerTime
    };
    this.ws.send(JSON.stringify(payload));
  }


  async setup(): Promise<boolean> {
    const WS_URL =
      this.URL.replace(/^http/, "ws") + "/ws/command";
    try {
      const res = await fetch(this.URL + "/dashboard");
      if (!res.ok) return false;
      this.server = await res.json();

      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log("WS connected");
      };

      this.ws.onerror = (e) => {
        console.error("WS error:", e);
      };

      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      };

      return true;
    } catch (err) {
      console.error("Init failed:", err);
      return false;
    }
  }
}



function renderMainHeader(app: VocalLinkApp) {
  if (!app.server) return;
  const header = document.getElementById("header");
  if (!header) return;

  header.innerHTML = `
    <div class="title">
      <h1>${app.server.name}</h1>
      <div class="subtitle">
        Server at <b>${app.server.ip}</b>
      </div>
    </div>
    <div class="actions">
      <button id="start-all" class="btn btn-success">
        🎤 Start All
      </button>
      <button id="stop-all" class="btn btn-danger">
        ⏹ Stop All
      </button>
    </div>
  `;

  document.getElementById("start-all")?.addEventListener("click", () => {
      // future time (500ms)
      const trigger = Date.now() + 500;
      app.sendAction(WSActionRequest.START_ALL, undefined, trigger);
    });

  document.getElementById("stop-all")?.addEventListener("click", () => {
      app.sendAction(
        WSActionRequest.STOP_ALL
      );
    });
}


function createSessionCard(app: VocalLinkApp, session: SessionMetadata): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";
  card.id = `session-${session.id}`;

  card.innerHTML = `
    <div class="card-left">
      <div>
        <div class="device-name">
          ${session.name}
          ${session.battery_level ? `(${session.battery_level}%)` : ""}
        </div>
        <div class="device-meta"> ${session.ip} </div>
      </div>
    </div>
    <div class="card-right">
      <span class="status">
        ${session.state}
      </span>
      <button class="mic-btn">🎤</button>
    </div>
  `;

  card.querySelector(".mic-btn")?.addEventListener("click", () => {
      const trigger = Date.now() + 500;
      if (session.state === SessionState.RECORDING) {
        app.sendAction(
          WSActionRequest.STOP_ONE,
          session.id,
          trigger
        );
      } else {
        app.sendAction(
          WSActionRequest.START_ONE,
          session.id,
          trigger
        );
      }
    });
  return card;
}

function renderDeviceSection(app: VocalLinkApp) {
  const section = document.getElementById("device-control");
  if (!section) return;

  const sessions = Array.from(app.sessions.values());

  section.innerHTML = `
    <div class="section-header">
      <h3> 🔌 Connected Devices (${sessions.length}) </h3>
    </div>
  `;

  for (const s of sessions) {
    section.appendChild(createSessionCard(app, s));
  }
}

function render(app: VocalLinkApp) {
  if (!app.server) return;
  renderMainHeader(app);
  renderDeviceSection(app);
}

const app = new VocalLinkApp();
app.setup().then((ok) => {
  if (!ok) {
    console.error("Startup failed");
    return;
  }
  render(app);
});

