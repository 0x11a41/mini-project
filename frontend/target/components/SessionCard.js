import { WSActions, Payloads } from "../types.js";
import { circleButton } from "./circleButton.js";
import { sendPayload } from "../websockets.js";
import { StopWatch } from "./StopWatch.js";
var SessionState;
(function (SessionState) {
    SessionState["IDLE"] = "idle";
    SessionState["RECORDING"] = "recording";
})(SessionState || (SessionState = {}));
class SessionCard {
    state = SessionState.IDLE;
    meta;
    card;
    micBtn;
    statusRow;
    stopWatch = new StopWatch();
    constructor(meta) {
        this.meta = meta;
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
        right.appendChild(this.stopWatch.element);
        right.appendChild(this.micBtn);
        this.card.appendChild(left);
        this.card.appendChild(right);
    }
    notify(action) {
        sendPayload(Payloads.action(action, this.meta.id));
    }
    start() {
        this.state = SessionState.RECORDING;
        this.micBtn.classList.remove('record-icon');
        this.micBtn.classList.add('stop-icon');
        this.card.classList.add('border-recording');
        this.stopWatch.startTimer();
    }
    stop() {
        this.state = SessionState.IDLE;
        this.micBtn.classList.remove('stop-icon');
        this.micBtn.classList.add('record-icon');
        this.card.classList.remove('border-recording');
        this.stopWatch.resetTimer();
    }
    updateMeta(newMeta) {
        this.meta.battery = newMeta.battery;
        this.meta.last_rtt = newMeta.last_rtt;
        this.meta.theta = newMeta.theta;
        this.meta.last_sync = newMeta.last_sync;
        this.statusRow.innerText = `🔋${this.meta.battery}%  📶${this.meta.last_rtt}ms`;
    }
}
export { SessionState, SessionCard };
