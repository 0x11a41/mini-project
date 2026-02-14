import { WSActions, Payloads } from "../types";
import { circleButton } from "./circleButton";
import { ws } from "../websockets";
var SessionState;
(function (SessionState) {
    SessionState["IDLE"] = "idle";
    SessionState["RECORDING"] = "recording";
})(SessionState || (SessionState = {}));
class SessionCard {
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
        this.timerDisplay = document.createElement('p');
        this.timerDisplay.classList.add('timer');
        this.timerDisplay.innerText = '00:00';
        this.micBtn = circleButton({ iconName: "record-icon", onClick: () => {
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
export { SessionState, SessionCard };
