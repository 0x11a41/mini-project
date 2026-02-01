class VocalLinkApp {
    URL = "http://localhost:6210";
    name = "";
    ip = "";
    active = 0;
    serverOk = false;
    devices = [];
    recordings = [];
    ws = null;
    constructor() { }
    setState(patch) {
        Object.assign(this, patch);
    }
    handleMsg(data) {
        console.log("New Command:", data);
    }
    async setup() {
        const WS_URL = this.URL.replace(/^http/, 'ws') + "/ws/command";
        try {
            const res = await fetch(this.URL + '/session');
            if (!res.ok)
                return false;
            const { name, ip, active } = await res.json();
            this.name = name;
            this.ip = ip;
            this.active = active;
            this.ws = new WebSocket(WS_URL);
            this.serverOk = true;
            this.ws.onopen = () => console.log("WS Connected to VocalLink");
            this.ws.onerror = (err) => console.error("WS Error:", err);
            this.ws.onmessage = (msg) => this.handleMsg(JSON.parse(msg.data));
            return true;
        }
        catch (err) {
            console.error('failed to initialize app:', err);
            this.serverOk = false;
            return false;
        }
    }
}
async function renderMainHeader(app) {
    const header = document.getElementById("header");
    if (!header)
        return;
    header.innerHTML = `
      <div class="title">
          <h1 id="server-title">${app.name}</h1>
          <div class="subtitle">
              your VocalLink server is hosted at <strong id="server-ip">${app.ip}</strong>
          </div>
      </div>
      <div class="actions">
          <button id="remove-all-btn" class="btn btn-danger">✖ Remove all</button>
          <button id="start-all-btn" class="btn btn-success">🎤 Start all devices</button>
      </div>`;
    const removeBtn = document.getElementById("remove-all-btn");
    const startBtn = document.getElementById("start-all-btn");
    if (removeBtn)
        removeBtn.onmouseup = () => console.log("Removing...");
    if (startBtn)
        startBtn.onmouseup = () => console.log("Starting...");
}
async function render(app) {
    if (!app.serverOk) {
        console.log("serverNotOk");
        return;
    }
    await renderMainHeader(app);
}
const app = new VocalLinkApp();
app.setup().then((success) => {
    if (success) {
        render(app);
    }
});
export {};
