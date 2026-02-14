import { URL } from "./env.js";
import { Payloads, WSEvents, WSPayload } from "./types.js";


export const ws = new WebSocket(`${URL.replace(/^http/, 'ws')}/ws/control`);
ws.onopen = ():void => ws.send(JSON.stringify(Payloads.event(WSEvents.DASHBOARD_INIT)));


export const sendPayload = (payload: WSPayload) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
};
