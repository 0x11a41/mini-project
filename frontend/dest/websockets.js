import { URL } from "./env";
import { Payloads, WSEvents } from "./types";
export const ws = new WebSocket(`${URL.replace(/^http/, 'ws')}/ws/control`);
ws.onopen = () => ws.send(JSON.stringify(Payloads.event(WSEvents.DASHBOARD_INIT)));
export const sendPayload = (payload) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
};
