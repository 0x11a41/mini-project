var SessionState;
(function (SessionState) {
    SessionState["IDLE"] = "idle";
    SessionState["RECORDING"] = "recording";
    SessionState["UPLOADING"] = "uploading";
    SessionState["ERROR"] = "error";
})(SessionState || (SessionState = {}));
var EventType;
(function (EventType) {
    EventType["SESSION_INIT"] = "session_init";
    EventType["CLIENT_REGISTERED"] = "client_registered";
    EventType["DASHBOARD_RENAME"] = "dashboard_rename";
    EventType["SYNC_RESULT"] = "sync_result";
})(EventType || (EventType = {}));
var CommandAction;
(function (CommandAction) {
    CommandAction["START_ALL"] = "start_all";
    CommandAction["STOP_ALL"] = "stop_all";
    CommandAction["START_ONE"] = "start_one";
    CommandAction["STOP_ONE"] = "stop_one";
    CommandAction["RENAME"] = "rename";
})(CommandAction || (CommandAction = {}));
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
        console.log("WS:", msg);
        switch (msg.event) {
            case EventType.CLIENT_REGISTERED:
            case EventType.SESSION_INIT: {
                const client = msg.body;
                this.sessions.set(client.id, client);
                this.setState({});
                break;
            }
            case EventType.DASHBOARD_RENAME: {
                if (!this.server)
                    return;
                this.server.name = msg.body.new_name;
                this.setState({});
                break;
            }
            case EventType.SYNC_RESULT: {
                const update = msg.body;
                console.log("Sync:", update);
                break;
            }
            default:
                console.warn("Unknown WS event:", msg);
        }
    }
    sendCommand(action, clientId) {
        if (!this.ws)
            return;
        const payload = { action };
        if (clientId) {
            payload.client_id = clientId;
        }
        this.ws.send(JSON.stringify(payload));
    }
    async setup() {
        const WS_URL = this.URL.replace(/^http/, "ws") + "/ws/command";
        try {
            const res = await fetch(this.URL + "/session");
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
    document.getElementById("start-all")?.addEventListener("click", () => app.sendCommand(CommandAction.START_ALL));
    document.getElementById("stop-all")?.addEventListener("click", () => app.sendCommand(CommandAction.STOP_ALL));
}
function createSessionCard(app, client) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = `client-${client.id}`;
    card.innerHTML = `
    <div class="card-left">
      <div>
        <div class="device-name">
          ${client.name}
          ${client.battery_level
        ? `(${client.battery_level}%)`
        : ""}
        </div>
        <div class="device-meta">
          ${client.ip}
        </div>
      </div>
    </div>
    <div class="card-right">
      <span class="status">
        ${client.state}
      </span>
      <button class="mic-btn">🎤</button>
    </div>
  `;
    card.querySelector(".mic-btn")
        ?.addEventListener("click", () => {
        if (client.state === SessionState.RECORDING) {
            app.sendCommand(CommandAction.STOP_ONE, client.id);
        }
        else {
            app.sendCommand(CommandAction.START_ONE, client.id);
        }
    });
    return card;
}
function renderDeviceSection(app) {
    const section = document.getElementById("device-control");
    if (!section)
        return;
    const clients = Array.from(app.sessions.values());
    section.innerHTML = `
    <div class="section-header">
      <h3>
        🔌 Connected Devices (${clients.length})
      </h3>
    </div>
  `;
    for (const client of clients) {
        const card = createSessionCard(app, client);
        section.appendChild(card);
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
