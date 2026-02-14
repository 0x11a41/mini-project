import { SessionMetadata, WSActions, Payloads } from "../types.js";
import { circleButton } from "./circleButton.js";
import { sendPayload } from "../websockets.js";
import { StopWatch } from "./StopWatch.js";

enum SessionState {
  IDLE = "idle",
  RECORDING = "recording"
}
// when user clicks start/stop button on a session, it notifies the session
// about it. The session to send an acknowledgement back to UI, and only then
// the visible changes are made using start() or stop() methods.
class SessionCard {
  public state: SessionState = SessionState.IDLE;
  public meta: SessionMetadata;

  public card: HTMLElement;
  public micBtn: HTMLElement;
  private statusRow: HTMLElement;
  private stopWatch = new StopWatch();

  constructor(meta: SessionMetadata) {
    this.meta = meta;
    this.micBtn = circleButton({iconName:"record-icon",onClick:() => {
      if (this.state === SessionState.IDLE) {
        this.notify(WSActions.START);
      } else if (this.state === SessionState.RECORDING) {
        this.notify(WSActions.STOP);
      }
    }});
    
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

  public notify(action: WSActions): void {
    sendPayload(Payloads.action(action, this.meta.id));
  }

  public start(): void {
    this.state = SessionState.RECORDING;
    this.micBtn.classList.remove('record-icon');
    this.micBtn.classList.add('stop-icon');
    this.card.classList.add('border-recording');
    this.stopWatch.startTimer();
  }

  public stop(): void {
    this.state = SessionState.IDLE;
    this.micBtn.classList.remove('stop-icon');
    this.micBtn.classList.add('record-icon');
    this.card.classList.remove('border-recording');
    this.stopWatch.resetTimer();
  }

  public updateMeta(newMeta: SessionMetadata): void {
    this.meta.battery = newMeta.battery;
    this.meta.last_rtt = newMeta.last_rtt;
    this.meta.theta = newMeta.theta;
    this.meta.last_sync = newMeta.last_sync;

    this.statusRow.innerText = `🔋${this.meta.battery}%  📶${this.meta.last_rtt}ms`;
  }
}

export { SessionState, SessionCard };
