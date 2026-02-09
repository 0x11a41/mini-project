interface SessionMetadata {
  id: string;
  name: string;
  ip: string;
  battery_level: number;
  theta: number;
  last_rtt: number;
  last_sync?: number;  
}

interface ServerInfo {
  name: string;
  ip: string;
  active_sessions: number;
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

      this.ws = new WebSocket(this.URL.replace(/^http/, "ws") + "/ws/command");

      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        console.log(msg)
      };

      this.ws.onopen = () => {
        console.log("WS connected");
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
