import { VERSION, URL } from './env.js';
import { ws, sendPayload } from './websockets.js';
import { ServerInfo, WSKind, WSEvents, WSActions, WSActionTarget, WSPayload, Payloads, SessionMetadata } from './types.js';
import { SessionCard, SessionState } from './components/SessionCard.js';
import { button } from './components/button.js';


export enum Views {
  DASHBOARD = "dashboard",
  RECORDINGS = "recordings",
  SETTINGS = "settings"
}


class VLApp {
  private serverInfo?: ServerInfo;
  private sessions = new Map<string, SessionCard>();

  public canvas = document.getElementById("app");
  public sidePanel = document.createElement('aside');
  public mainPanel: HTMLElement = document.createElement('main');

  private currentView: Views = Views.DASHBOARD;
  public viewSelector: HTMLElement = document.createElement('menu');

  private activeRecordings: number = 0;
  private masterToggleBtn!: HTMLElement;

  constructor() {
    this.viewSelector.innerHTML = `
      <li data-key="${Views.DASHBOARD}">Dashboard</li>
      <li data-key="${Views.RECORDINGS}">Recordings</li>
      <li data-key="${Views.SETTINGS}">Settings</li>
    `;
    if (this.canvas) {
        this.canvas.insertAdjacentElement('afterbegin', this.sidePanel);
        this.canvas.insertAdjacentElement('beforeend', this.mainPanel);
    }

    this.masterToggleBtn = button({label:"Start All", classes: ["accent"], onClick: () => {
    	if (this.activeRecordings == 0) {
    		this.startMaster();
    	} else {
    		this.stopMaster();
    	}
    }});
  }

	private startMaster(): void {
		this.masterToggleBtn.classList.replace("accent", "immutable");
		this.masterToggleBtn.innerText = "Stop All";
  	this.sessions.forEach((session) => {
  		if (session.state == SessionState.IDLE) {
        sendPayload(Payloads.action(WSActions.START, session.meta.id))
  		}
  	});
	}
	private stopMaster(): void {
		this.masterToggleBtn.classList.replace("immutable", "accent");
		this.masterToggleBtn.innerText = "Start All";
  	this.sessions.forEach((session) => {
  		if (session.state == SessionState.RECORDING) {
        sendPayload(Payloads.action(WSActions.STOP, session.meta.id));
  		}
  	});
	}

  private setActiveMenuItem(state: Views = this.currentView): void {
    const options = this.viewSelector.querySelectorAll('li');
    options.forEach(option => {
      option.classList.toggle('active', option.dataset.key === state);
    });
  }

  public syncView(newView: Views) {
    this.currentView = newView;
    this.setActiveMenuItem();

    this.mainPanel.innerHTML = "";
    switch (newView) {
      case Views.DASHBOARD:
        this.renderDashboardView();
        break;
      case Views.RECORDINGS:
        this.renderRecordingsView();
        break;
      case Views.SETTINGS:
        this.renderSettingsView();
        break;
    }
  }

  private renderSidebar() {
    const ip = this.serverInfo?.ip || "X.X.X.X";
    this.sidePanel.innerHTML = `
      <h2>VocalLink</h2>
      <div class="qrcode-wrapper">
          <img src="${URL}/dashboard/qr" alt="Server QR Code">
          <div class="label">scan to join session</div>
          <div class="ip-address">${ip}</div> 
      </div>
    `;

    this.sidePanel.appendChild(this.viewSelector);
    this.sidePanel.insertAdjacentHTML('beforeend', `<i class="version">vocal-link-dashboard ${VERSION}</i>`);
    
    this.viewSelector.onmouseup = (ev: Event) => {
      const target = (ev.target as HTMLElement).closest('li');
      if (target) {
        const state = target.dataset.key as Views;
        if (state !== this.currentView) {
          this.syncView(state);
        }
      }
    };
    this.setActiveMenuItem();
  }

  private dashboardHeader():HTMLElement {
    const header = document.createElement('div');
    header.classList.add("view-header");
    header.insertAdjacentHTML('beforeend', `
				<div class="head">
					<h1>${this.serverInfo?.name || "undefined"}</h1>
					<p class="status">status: <span class="${this.serverInfo ? "success" : "danger"}">${this.serverInfo ? "Active" : "Offline"}</span></p>
				</div>
      `); 
    if (this.sessions.size > 0) {
      header.appendChild(this.masterToggleBtn);
    }
    return header;
  }

  private sessionsWrapper():HTMLElement {
    const wrapper = document.createElement('section');
    wrapper.classList.add('sessions-wrapper');
    if (this.sessions.size > 0) {
	    this.sessions.forEach((session) => {
	    	wrapper.appendChild(session.card);
	    })
    } else {
    	wrapper.innerHTML = `
			<section class="no-sessions-wrapper stack">
				<b>No Active Connections</b>
				<p class="muted">Waiting for recording nodes to join the network...</p>
				<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M1.90909 0C1.20273 0 0.636364 0.566364 0.636364 1.27273V3.81818C0.636364 4.52455 1.20273 5.09091 1.90909 5.09091H0V6.36364H7.63636V5.09091H5.72727C6.43364 5.09091 7 4.52455 7 3.81818V1.27273C7 0.566364 6.43364 0 5.72727 0H1.90909ZM1.90909 1.27273H5.72727V3.81818H1.90909V1.27273ZM8.27273 7.63636C7.56636 7.63636 7 8.20273 7 8.90909V11.4546C7 12.1609 7.56636 12.7273 8.27273 12.7273H6.36364V14H14V12.7273H12.0909C12.7973 12.7273 13.3636 12.1609 13.3636 11.4546V8.90909C13.3636 8.20273 12.7973 7.63636 12.0909 7.63636H8.27273ZM1.83273 7.92909L0.929091 8.83273L2.28455 10.1818L0.929091 11.5309L1.83273 12.4346L3.18182 11.0791L4.53091 12.4346L5.43455 11.5309L4.07909 10.1818L5.43455 8.83273L4.53091 7.92909L3.18182 9.28455L1.83273 7.92909ZM8.27273 8.90909H12.0909V11.4546H8.27273V8.90909Z"/>
				</svg>
			</section>
    	`;
    }
    return wrapper;
  }

  private renderDashboardView() {
    const dashboardView = document.createElement('section');
    dashboardView.classList.add("dashboard-view", "stack");

    dashboardView.appendChild(this.dashboardHeader());
    dashboardView.insertAdjacentHTML('beforeend', `
			<b class="muted">Connected devices (${this.sessions.size})</b>
      `);
    dashboardView.insertAdjacentHTML('beforeend', '<hr>');
    dashboardView.appendChild(this.sessionsWrapper())

    this.mainPanel.replaceChildren(dashboardView);
  }

  private renderRecordingsView() {
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

  private renderSettingsView() {
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

  async init(): Promise<void> {
    try {
      const serverInfoResponse = await fetch(URL + "/dashboard");
      if (!serverInfoResponse.ok) {
        console.error("failed to fetch dashboard information");
        return;
      }
      this.serverInfo = await serverInfoResponse.json() as ServerInfo;

      const sessionsResponse = await fetch(URL + "/sessions");
	    const sessions: SessionMetadata[] = await sessionsResponse.json();
	    sessions.forEach(meta => {
	        this.sessions.set(meta.id, new SessionCard(meta));
	    });

      this.renderSidebar(); 
      this.syncView(this.currentView);

      ws.onmessage = (ev: MessageEvent) => this.handleWsMessages(JSON.parse(ev.data));
    } catch (err) {
      console.error("Init failed:", err);
    }
  }

  handleWsMessages(payload: WSPayload): void {
	  if (payload.kind === WSKind.ERROR) {
	    console.error("Server error:", payload.msg_type);
	    return;
	  }

	  if (payload.kind === WSKind.EVENT) {
	    switch (payload.msg_type) {
	      case WSEvents.SESSION_ACTIVATED: {
	        payload.body = payload.body as SessionMetadata;
	        if (!this.sessions.has(payload.body.id)) {
	          const s = new SessionCard(payload.body);
	          this.sessions.set(payload.body.id, s);
	          this.syncView(Views.DASHBOARD);
	        }
	        break;
	      } case WSEvents.SESSION_LEFT: {
	        payload.body = payload.body as SessionMetadata;
	        this.sessions.delete(payload.body.id);
	        this.syncView(Views.DASHBOARD);
	        break;
	      } case WSEvents.SESSION_UPDATE: {
	        payload.body = payload.body as SessionMetadata;
					const session = this.sessions.get(payload.body.id);
					if (session) {
						session.updateMeta(payload.body);
					}
	      	break;
	      } case "success": case "failed":
	        console.log("Session result:", payload.msg_type, payload.body);
	        break;
	      default:
	        console.warn("Unhandled event:", payload.msg_type, payload);
	    }
	    return;
	  }

	  if (payload.kind === WSKind.ACTION) {
	    switch (payload.msg_type) {
	      case WSActions.STARTED: {
	      	payload.body = payload.body as WSActionTarget;
	        const id = payload.body.session_id;
	        const session = this.sessions.get(id);
	        session?.start();
	        if (this.activeRecordings == 0) {
						this.masterToggleBtn.classList.replace("accent", "immutable");
						this.masterToggleBtn.innerText = "Stop All";
	        }
	        this.activeRecordings++;
	        break;
	      } case WSActions.STOPPED: {
	      	payload.body = payload.body as WSActionTarget;
	        const id = payload.body.session_id;
	        const s = this.sessions.get(id);
	        s?.stop();
	        this.activeRecordings--
	        if (this.activeRecordings == 0) {
						this.masterToggleBtn.classList.replace("immutable", "accent");
						this.masterToggleBtn.innerText = "Start All";
	        }
	        break;
	      } default:
	        console.warn("Unhandled action:", payload.msg_type, payload);
	    }
	    return;
	  }
	  console.warn("Unknown WS message:", payload);
	}
}

const app = new VLApp();
await app.init();
