export const VERSION = "v0.5-alpha";
export const URL = "http://localhost:6210";
export const ws: WebSocket = new WebSocket("ws://127.0.0.1:6210/ws/control");

export interface SessionMetadata {
  id: string;
  name: string;
  ip: string;
  battery: number;
  device: string;
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
  START = "start",
  STOP = "stop",
  STARTED = "started",
  STOPPED = "stopped",
}

export interface Rename {
  new_name: string;
  session_id?: string | null;
}

export interface WSActionTarget {
  session_id: string;
  trigger_time?: number | null;
}

type WSBodyTypes = SessionMetadata | WSActionTarget | Rename | null;
type WSMsgTypes = WSActions | WSEvents | WSErrors;

export interface WSPayload {
  kind: WSKind;
  msg_type: WSMsgTypes;
  body: WSBodyTypes;
}

export enum ViewStates {
  DASHBOARD = "dashboard",
  RECORDINGS = "recordings",
  SETTINGS = "settings"
}

export const Payloads = {
  action: (type: WSActions, session_id: string = "all"): WSPayload => ({
    kind: WSKind.ACTION,
    msg_type: type,
    body: { session_id, trigger_time: null }
  }),

  rename: (newName: string, sessionId: string | null = null): WSPayload => ({
    kind: WSKind.ACTION, // or EVENT depending on who sends it
    msg_type: sessionId ? WSEvents.SESSION_RENAME : WSEvents.DASHBOARD_RENAME,
    body: { new_name: newName, session_id: sessionId }
  }),

  event: (type: WSEvents, body: WSBodyTypes): WSPayload => ({
    kind: WSKind.EVENT,
    msg_type: type,
    body: body
  }),

  error: (type: WSErrors): WSPayload => ({
    kind: WSKind.ERROR,
    msg_type: type,
    body: null,
  }),
};



function createMicBtn(): HTMLElement {
  const micBtn = document.createElement('div');
  micBtn.classList.add('btn-circle', 'record-icon', 'highlight-on-cursor');
  return micBtn;
}

function createTimerDisplayComp(): HTMLElement {
  const timerDisplay = document.createElement('p');
  timerDisplay.classList.add('timer');
  timerDisplay.innerText = '00:00';
  return timerDisplay;
}

enum SessionState {
  IDLE = "idle",
  RECORDING = "recording"
}

// when user clicks start/stop button on a session, it notifies the session
// about it. The session to send an acknowledgement back to UI, and only then
// the visible changes are made using start() or stop() methods.
export class Session {
  private state: SessionState = SessionState.IDLE;
  
  private intervalId: number | null = null;
  private secondsElapsed: number = 0;

  public meta: SessionMetadata;
  public card: HTMLElement;
  public timerDisplay: HTMLElement;
  public micBtn: HTMLElement;

  constructor(meta: SessionMetadata) {
    this.meta = meta;
    this.timerDisplay = createTimerDisplayComp();
    this.micBtn = createMicBtn();
    
    this.micBtn.onmouseup = () => {
      if (this.state === SessionState.IDLE) {
        this.notify(WSActions.START);
      } else if (this.state === SessionState.RECORDING) {
        this.notify(WSActions.STOP);
      }
    };

    this.card = document.createElement('div');
    this.card.classList.add("session-card");
    
    const left = document.createElement('div');
    left.classList.add('left');
    left.innerHTML = `
        <div>
            <b>${meta.name}</b>
            <div class="device-name">${meta.device}</div>
        </div>
        <div class="status-row">
            <span>🔋 ${meta.battery}%</span>
            <span>📶 ${meta.last_rtt || 0}ms</span> 

        </div>`;
    
    const right = document.createElement('div');
    right.classList.add('right');
    right.appendChild(this.timerDisplay);
    right.appendChild(this.micBtn);

    this.card.appendChild(left);
    this.card.appendChild(right);
  }

  public notify(action: WSActions): void {
    const msg = Payloads.action(action, this.meta.id);
    console.log(msg);
    ws.send(JSON.stringify(msg));
  }

  public start(): void {
    this.state = SessionState.RECORDING;
    this.micBtn.classList.remove('record-icon');
    this.micBtn.classList.add('stop-icon');
    this.card.classList.add('border-recording');
    this.startTimer();
  }

  public stop(): void {
    this.state = SessionState.IDLE;
    this.micBtn.classList.remove('stop-icon');
    this.micBtn.classList.add('record-icon');
    this.card.classList.remove('border-recording');
    this.resetTimer();
  }

  private startTimer(): void {
    if (this.intervalId) return; 
    this.intervalId = window.setInterval(() => {
      this.secondsElapsed++;
      this.updateTimerDisplay();
    }, 1000);
  }

  private resetTimer(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.secondsElapsed = 0;
    this.timerDisplay.innerText = "00:00";
  }

  private updateTimerDisplay(): void {
    const mins = Math.floor(this.secondsElapsed / 60).toString().padStart(2, '0');
    const secs = (this.secondsElapsed % 60).toString().padStart(2, '0');
    this.timerDisplay.innerText = `${mins}:${secs}`;
  }
}


export class View {
  private state: ViewStates;
  public menu: HTMLElement = document.createElement('menu');

  constructor(state: ViewStates) {
    this.state = state;
    this.menu.innerHTML = `
      <li data-key="${ViewStates.DASHBOARD}">Dashboard</li>
      <li data-key="${ViewStates.RECORDINGS}">Recordings</li>
      <li data-key="${ViewStates.SETTINGS}">Settings</li>
    `;
  }

  set(newView: ViewStates): void {
    this.state = newView;
  };

  get(): ViewStates {
    return this.state;
  }
}


interface ButtonOptions {
  label: string;
  classes?: string[];
  onClick: () => void;
}

export function buttonComp({ label, classes = [], onClick }: ButtonOptions): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.innerText = label;
  btn.classList.add('highlight-on-cursor', ...classes);
  btn.onclick = () => onClick();
  return btn;
}
