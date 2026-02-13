export const VERSION = "v0.5-alpha";
export const URL = "http://localhost:6210";
export const ws = new WebSocket("ws://localhost:6210/ws/control");
ws.onopen = () => ws.send(JSON.stringify(Payloads.event(WSEvents.DASHBOARD_INIT)));
export var RESTEvents;
(function (RESTEvents) {
})(RESTEvents || (RESTEvents = {}));
export var WSKind;
(function (WSKind) {
    WSKind["ACTION"] = "action";
    WSKind["EVENT"] = "event";
    WSKind["ERROR"] = "error";
})(WSKind || (WSKind = {}));
export var WSErrors;
(function (WSErrors) {
    WSErrors["INVALID_KIND"] = "invalid_kind";
    WSErrors["INVALID_EVENT"] = "invalid_event";
    WSErrors["INVALID_BODY"] = "invalid_body";
    WSErrors["ACTION_NOT_ALLOWED"] = "action_not_allowed";
    WSErrors["SESSION_NOT_FOUND"] = "session_not_found";
})(WSErrors || (WSErrors = {}));
export var WSEvents;
(function (WSEvents) {
    WSEvents["DASHBOARD_INIT"] = "dashboard_init";
    WSEvents["DASHBOARD_RENAME"] = "dashboard_rename";
    WSEvents["SESSION_UPDATE"] = "session_update";
    WSEvents["SESSION_ACTIVATE"] = "session_activate";
    WSEvents["SESSION_ACTIVATED"] = "session_activated";
    WSEvents["SESSION_LEFT"] = "session_left";
    WSEvents["SESSION_SELF_START"] = "session_self_start";
    WSEvents["SESSION_SELF_STOP"] = "session_self_stop";
    WSEvents["SUCCESS"] = "success";
    WSEvents["FAIL"] = "failed";
})(WSEvents || (WSEvents = {}));
export var WSActions;
(function (WSActions) {
    WSActions["START"] = "start";
    WSActions["STOP"] = "stop";
    WSActions["STARTED"] = "started";
    WSActions["STOPPED"] = "stopped";
})(WSActions || (WSActions = {}));
export const Payloads = {
    action: (type, session_id = "all") => ({
        kind: WSKind.ACTION,
        msg_type: type,
        body: { session_id, trigger_time: null }
    }),
    rename: (newName) => ({
        kind: WSKind.ACTION,
        msg_type: WSEvents.DASHBOARD_RENAME,
        body: { new_name: newName }
    }),
    event: (type, body = null) => ({
        kind: WSKind.EVENT,
        msg_type: type,
        body: body
    }),
    error: (type) => ({
        kind: WSKind.ERROR,
        msg_type: type,
        body: null,
    }),
};
function createTimerDisplayComp() {
    const timerDisplay = document.createElement('p');
    timerDisplay.classList.add('timer');
    timerDisplay.innerText = '00:00';
    return timerDisplay;
}
export var SessionState;
(function (SessionState) {
    SessionState["IDLE"] = "idle";
    SessionState["RECORDING"] = "recording";
})(SessionState || (SessionState = {}));
export class Session {
    state = SessionState.IDLE;
    intervalId = null;
    secondsElapsed = 0;
    meta;
    card;
    timerDisplay;
    micBtn;
    statusRow;
    constructor(meta) {
        this.meta = meta;
        this.timerDisplay = createTimerDisplayComp();
        this.micBtn = roundBtn({ iconName: "record-icon", onClick: () => {
                if (this.state === SessionState.IDLE) {
                    this.notify(WSActions.START);
                }
                else if (this.state === SessionState.RECORDING) {
                    this.notify(WSActions.STOP);
                }
            } });
        this.card = document.createElement('div');
        this.card.classList.add("session-card");
        const left = document.createElement('div');
        left.classList.add('left');
        left.innerHTML = `
        <div>
            <b>${meta.name}</b>
            <div class="device-name">${meta.device}</div>
        </div>
        `;
        this.statusRow = document.createElement('div');
        this.statusRow.classList.add('status-row');
        this.statusRow.innerText = `🔋${meta.battery}%  📶${meta.last_rtt}ms`;
        left.appendChild(this.statusRow);
        const right = document.createElement('div');
        right.classList.add('right');
        right.appendChild(this.timerDisplay);
        right.appendChild(this.micBtn);
        this.card.appendChild(left);
        this.card.appendChild(right);
    }
    notify(action) {
        const msg = Payloads.action(action, this.meta.id);
        console.log(msg);
        ws.send(JSON.stringify(msg));
    }
    start() {
        this.state = SessionState.RECORDING;
        this.micBtn.classList.remove('record-icon');
        this.micBtn.classList.add('stop-icon');
        this.card.classList.add('border-recording');
        this.startTimer();
    }
    stop() {
        this.state = SessionState.IDLE;
        this.micBtn.classList.remove('stop-icon');
        this.micBtn.classList.add('record-icon');
        this.card.classList.remove('border-recording');
        this.resetTimer();
    }
    updateMeta(newMeta) {
        this.meta.battery = newMeta.battery;
        this.meta.last_rtt = newMeta.last_rtt;
        this.meta.theta = newMeta.theta;
        this.meta.last_sync = newMeta.last_sync;
        this.statusRow.innerText = `🔋${this.meta.battery}%  📶${this.meta.last_rtt}ms`;
    }
    startTimer() {
        if (this.intervalId)
            return;
        this.intervalId = window.setInterval(() => {
            this.secondsElapsed++;
            this.updateTimerDisplay();
        }, 1000);
    }
    resetTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.secondsElapsed = 0;
        this.timerDisplay.innerText = "00:00";
    }
    updateTimerDisplay() {
        const mins = Math.floor(this.secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (this.secondsElapsed % 60).toString().padStart(2, '0');
        this.timerDisplay.innerText = `${mins}:${secs}`;
    }
}
function roundBtn({ iconName, onClick }) {
    const micBtn = document.createElement('div');
    micBtn.classList.add('btn-circle', iconName, 'highlight-on-cursor');
    micBtn.onclick = onClick;
    return micBtn;
}
export function button({ label, classes = [], onClick }) {
    const btn = document.createElement('button');
    btn.innerText = label;
    btn.classList.add('highlight-on-cursor', ...classes);
    btn.onclick = () => onClick();
    return btn;
}
export var Views;
(function (Views) {
    Views["DASHBOARD"] = "dashboard";
    Views["RECORDINGS"] = "recordings";
    Views["SETTINGS"] = "settings";
})(Views || (Views = {}));
