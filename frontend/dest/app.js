var SessionState;
(function (SessionState) {
    SessionState["IDLE"] = "idle";
    SessionState["RECORDING"] = "recording";
    SessionState["UPLOADING"] = "uploading";
    SessionState["ERROR"] = "error";
})(SessionState || (SessionState = {}));
var WSEvent;
(function (WSEvent) {
    WSEvent["SESSION_INIT"] = "session_init";
    WSEvent["DASHBOARD_RENAME"] = "dashboard_rename";
    WSEvent["SESSION_RENAME"] = "session_rename";
    WSEvent["SESSION_REGISTERED"] = "session_registered";
})(WSEvent || (WSEvent = {}));
var WSActionRequest;
(function (WSActionRequest) {
    WSActionRequest["START_ALL"] = "start_all";
    WSActionRequest["STOP_ALL"] = "stop_all";
    WSActionRequest["START_ONE"] = "start_one";
    WSActionRequest["STOP_ONE"] = "stop_one";
})(WSActionRequest || (WSActionRequest = {}));
class VocalLinkApp {
    URL = "http://localhost:6210";
    server = null;
    ws = null;
    sessions = new Map();
    setState(patch) {
        Object.assign(this, patch);
        render(this);
    }
    handleMessage(msg) {
        switch (msg.event) {
            case WSEvent.SESSION_INIT:
            case WSEvent.SESSION_REGISTERED: {
                const session = msg.body;
                this.sessions.set(session.id, session);
                this.setState({});
                break;
            }
            case WSEvent.SESSION_RENAME: {
                const session = this.sessions.get(msg.session_id);
                if (!session)
                    return;
                session.name = msg.body.new_name;
                this.setState({});
                break;
            }
            case WSEvent.DASHBOARD_RENAME: {
                if (!this.server)
                    return;
                this.server.name = msg.body.new_name;
                this.setState({});
                break;
            }
            default:
                console.warn("Unknown WS event:", msg);
        }
    }
    sendAction(action, sessionId, triggerTime) {
        if (!this.ws)
            return;
        const payload = {
            action,
            session_id: sessionId,
            trigger_time: triggerTime
        };
        this.ws.send(JSON.stringify(payload));
    }
    async setup() {
        const WS_URL = this.URL.replace(/^http/, "ws") + "/ws/command";
        try {
            const res = await fetch(this.URL + "/dashboard");
            if (!res.ok)
                return false;
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
        }
        catch (err) {
            console.error("Init failed:", err);
            return false;
        }
    }
}
function renderMainHeader(app) {
    if (!app.server)
        return;
    const header = document.getElementById("header");
    if (!header)
        return;
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
        const trigger = Date.now() + 500;
        app.sendAction(WSActionRequest.START_ALL, undefined, trigger);
    });
    document.getElementById("stop-all")?.addEventListener("click", () => {
        app.sendAction(WSActionRequest.STOP_ALL);
    });
}
function createSessionCard(app, session) {
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
            app.sendAction(WSActionRequest.STOP_ONE, session.id, trigger);
        }
        else {
            app.sendAction(WSActionRequest.START_ONE, session.id, trigger);
        }
    });
    return card;
}
function renderDeviceSection(app) {
    const section = document.getElementById("device-control");
    if (!section)
        return;
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
function render(app) {
    if (!app.server)
        return;
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
export {};
