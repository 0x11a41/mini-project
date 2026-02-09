function renderMainHeader() {
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
        console.log("start all");
    });
    document.getElementById("stop-all")?.addEventListener("click", () => {
        console.log("stop all");
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
