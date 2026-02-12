import { View, Payloads, ViewStates, WSEvents, WSActions, VERSION, URL, ws, buttonComp, } from './interfaces.js';
class VLApp {
    serverInfo;
    sessions = new Map();
    view;
    canvas = document.getElementById("app");
    sidePanel = document.createElement('aside');
    mainPanel = document.createElement('main');
    constructor() {
        this.view = new View(ViewStates.DASHBOARD);
        if (this.canvas) {
            this.canvas.insertAdjacentElement('afterbegin', this.sidePanel);
            this.canvas.insertAdjacentElement('beforeend', this.mainPanel);
        }
    }
    setActiveMenuItem(state = this.view.get()) {
        const options = this.view.menu.querySelectorAll('li');
        options.forEach(option => {
            option.classList.toggle('active', option.dataset.key === state);
        });
    }
    syncView(newView = this.view.get()) {
        this.view.set(newView);
        this.setActiveMenuItem();
        this.mainPanel.innerHTML = "";
        switch (newView) {
            case ViewStates.DASHBOARD:
                this.renderDashboardView();
                break;
            case ViewStates.RECORDINGS:
                this.renderRecordingsView();
                break;
            case ViewStates.SETTINGS:
                this.renderSettingsView();
                break;
        }
    }
    renderSidebar() {
        const ip = this.serverInfo?.ip || "X.X.X.X";
        this.sidePanel.innerHTML = `
      <h2>VocalLink</h2>
      <div class="qrcode-wrapper">
          <img src="${URL}/dashboard/qr" alt="Server QR Code">
          <div class="label">scan to join session</div>
          <div class="ip-address">${ip}</div> 
      </div>
    `;
        this.sidePanel.insertAdjacentElement('beforeend', this.view.menu);
        this.sidePanel.insertAdjacentHTML('beforeend', `<i class="version">vocal-link-dashboard ${VERSION}</i>`);
        this.view.menu.onmouseup = (ev) => {
            const target = ev.target.closest('li');
            if (target) {
                const state = target.dataset.key;
                if (state !== this.view.get()) {
                    this.syncView(state);
                }
            }
        };
        this.setActiveMenuItem();
    }
    renderDashboardView() {
        const serverName = this.serverInfo?.name || "Undefined";
        const server = this.serverInfo;
        const sessions = this.sessions;
        function viewHeaderComp() {
            const header = document.createElement('div');
            header.classList.add("view-header");
            header.insertAdjacentHTML('beforeend', `
					<div class="head">
						<h1>${serverName}</h1>
						<p class="status">status: <span class="${server ? "success" : "danger"}">${server ? "Active" : "Offline"}</span></p>
					</div>
        `);
            if (sessions.size > 0) {
                header.appendChild(buttonComp({ label: "Start All", classes: ["accent"], onClick: () => {
                        const msg = Payloads.action(WSActions.START, "all");
                        console.log(msg);
                        ws.send(JSON.stringify(msg));
                    } }));
            }
            return header;
        }
        function sessionsWrapperComp() {
            const wrapper = document.createElement('section');
            wrapper.classList.add('sessions-wrapper');
            return wrapper;
        }
        const dashboardView = document.createElement('section');
        dashboardView.classList.add("dashboard-view", "stack");
        dashboardView.appendChild(viewHeaderComp());
        dashboardView.insertAdjacentHTML('beforeend', `
			<b class="muted">Connected devices (${sessions.size})</b>
      `);
        dashboardView.insertAdjacentHTML('beforeend', '<hr>');
        dashboardView.appendChild(sessionsWrapperComp());
        this.mainPanel.replaceChildren(dashboardView);
    }
    renderRecordingsView() {
        this.mainPanel.innerHTML = `
			<section class="recordings-view stack">
				<div class="head">
					<h1 class="view-header">Recordings</h1>
					<div class="file-batch-buttons">
						<button class="immutable highlight-on-cursor">Remove all</button>
						<button class="highlight-on-cursor">Enhance all</button>
						<button class="highlight-on-cursor">Merge</button>
					</div>
				</div>
				<hr>
				<div class="body">
					<section class="recordings-wrapper">
						<div class="recording">
							<div class="left">
								<div class="btn-circle play-icon highlight-on-cursor"></div>
								<div class="info">
									<b>interview_host_final.m4a</b>
									<div class="muted">Naushu - 02:20 sec</div>
									<div class="badges">
										<span class="badge raw">RAW</span>
										<span class="badge transcribed">TRANSCRIBED</span>
										<span class="badge enhanced">ENHANCED</span>
									</div>
								</div>
							</div>
							<div class="right">
								<div class="btn-circle enhance-icon highlight-on-cursor"></div>
								<div class="btn-circle transcript-icon highlight-on-cursor"></div>
								<div class="btn-circle trash-icon highlight-on-cursor"></div>
							</div>
						</div>
					</section>

					<section class="transcript-wrapper">
						<div class="controls">
							<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
								<path d="M12.67 14H5.33V4.67h7.34m0-1.34H5.33c-.35 0-.69.14-.94.39s-.39.59-.39.94V14c0 .35.14.69.39.94.25.25.59.39.94.39h7.34c.35 0 .69-.14.94-.39.25-.25.39-.59.39-.94V4.67c0-.35-.14-.69-.39-.94s-.59-.39-.94-.39ZM10.67.67H2.67c-.35 0-.69.14-.94.39s-.39.6.39.94V11.33h1.33V2h8V.67Z"/>
							</svg>
							<svg width="13" height="14" viewBox="0 0 14 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
								<path d="M8.46 7.5L14 13.44V15h-1.46L7 9.06 1.46 15H0v-1.56L5.54 7.5 0 1.56V0h1.46L7 5.94 12.54 0H14v1.56L8.46 7.5Z"/>
							</svg>
						</div>
						<b>Transcript of interview_host_final.m4a</b>
						<i class="muted">recorded by Hari</i>
						<p>Lorem ipsum dolor sit amet, consecteturnec vel tellus. In hac habitasse platea  dictumst. Phasellus tempus ornare in, maximus vel metus. Cras interdum quam sit amet sem tincidunt fringilla. Vestibulum luctus vehicula gravida. Quisque  aliquam non ipsum eu finibus. Proin ultrices vitae augue sit amet  pellentesque. Sed ex orci, hendrerit nec odio nec, sagittis porta ipsum. Vestibulum augue tortor, congue ut efficitur eu, egestas rutrum diam.  Fusce dignissim erat a risus varius mollis. Cras aliquam lobortis  sapien, nec scelerisque enim ullamcorper nec.</p>
					</section>
				</div>
			</section>
    `;
    }
    renderSettingsView() {
        this.mainPanel.innerHTML = `
			<section class="settings-view stack">
				<h1>Settings</h1>
				<hr>
				<div class="options-wrapper">
  				<div class="setting-card">
              <div class="text-group">
                  <b>Server Name</b>
                  <p class="muted">Visible on recorders</p>
              </div>
    
              <div class="input-group">
                  <input type="text" value="My-Mac-Mini" placeholder="Enter name">
                  <div class="btn-circle tick-icon highlight-on-cursor"></div>
              </div>
          </div>
					<div class="setting-card">
						<div class="text-group">
							<b>Save location</b>
							<p class="muted">current path: /home/hk/Downloads</p>
						</div>
						<button class="accent highlight-on-cursor">Change</button>
					</div>

					<div class="setting-card">
						<div class="text-group">
							<b>Theme</b>
							<p class="muted">Switch between light and dark theme</p>
						</div>
						<label class="toggle-switch">
							<input type="checkbox">
							<span class="slider round"></span>
						</label>
					</div>

					<div class="setting-card">
						<div class="text-group">
							<b>Auto Enhance</b>
							<p class="muted">Automatically run speech enhancement whenever a recording arrive</p>
						</div>
						<label class="toggle-switch">
							<input type="checkbox" checked>
							<span class="slider round"></span>
						</label>
					</div>

					<div class="setting-card">
						<div class="text-group">
							<b>Auto generate transcript</b>
							<p class="muted">Automatically generate transcript whenever a recording arrive</p>
						</div>
						<label class="toggle-switch">
							<input type="checkbox">
							<span class="slider round"></span>
						</label>
					</div>
				</div>
			</section>
    `;
    }
    async init() {
        try {
            const res = await fetch(URL + "/dashboard");
            if (!res.ok) {
                console.error("failed to fetch dashboard information");
                return;
            }
            this.serverInfo = await res.json();
            this.renderSidebar();
            this.syncView();
            ws.onopen = () => ws.send(JSON.stringify(Payloads.event(WSEvents.DASHBOARD_INIT, null)));
            ws.onmessage = (ev) => this.handleWsMessages(ev.data);
        }
        catch (err) {
            console.error("Init failed:", err);
        }
    }
    handleWsMessages(payload) {
        console.log(payload);
    }
}
const app = new VLApp();
await app.init();
