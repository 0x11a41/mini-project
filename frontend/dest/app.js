class VLApp {
    URL = "http://localhost:6210";
    ws = null;
    server = null;
    sessions = new Array();
    async setup() {
        try {
            const res = await fetch(this.URL + "/dashboard");
            if (!res.ok)
                return false;
            this.server = await res.json();
            this.ws = new WebSocket(this.URL.replace(/^http/, "ws") + "/ws/command");
            this.ws.onmessage = (ev) => {
                const msg = JSON.parse(ev.data);
                console.log(msg);
            };
            this.ws.onopen = () => {
                console.log("WS connected");
            };
            this.ws.onerror = (e) => {
                console.error("WS error:", e);
            };
            return true;
        }
        catch (err) {
            console.error("Init failed:", err);
            return false;
        }
    }
}
function renderMainView() {
    const mv = document.getElementById("main-view");
}
function renderSidebar() {
    const sidebar = document.getElementById("side-panel");
}
function render(app) {
    renderSidebar();
    renderMainView();
    console.log('rendering');
}
const app = new VLApp();
app.setup().then((ok) => {
    if (!ok) {
        console.error("startup failed");
        return;
    }
    render(app);
});
export {};
