export var RESTEvents;
(function (RESTEvents) {
    RESTEvents["SESSION_STAGE"] = "session_stage";
    RESTEvents["SESSION_STAGED"] = "session_staged";
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
    WSEvents["SESSION_RENAME"] = "session_rename";
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
    WSActions["START_ALL"] = "start_all";
    WSActions["STOP_ALL"] = "stop_all";
    WSActions["START_ONE"] = "start_one";
    WSActions["STOP_ONE"] = "stop_one";
})(WSActions || (WSActions = {}));
class VLApp {
    URL = "http://localhost:6210";
    ws = null;
    server = null;
    sessions = new Array();
    async setup() {
        try {
            const res = await fetch(this.URL + "/dashboard");
            if (!res.ok)
                return false;
            this.server = await res.json();
            this.ws = new WebSocket(this.URL.replace(/^http/, "ws") + "/ws/control");
            this.ws.onmessage = (ev) => {
                const msg = JSON.parse(ev.data);
                console.log(msg);
            };
            this.ws.onopen = () => {
                const payload = {
                    kind: WSKind.EVENT,
                    msg_type: WSEvents.DASHBOARD_INIT,
                    body: null
                };
                this.ws?.send(JSON.stringify(payload));
            };
            this.ws.onerror = (e) => {
                console.error("WS error:", e);
            };
            return true;
        }
        catch (err) {
            console.error("Init failed:", err);
            return false;
        }
    }
}
function renderMainView() {
    const mv = document.getElementById("main-view");
}
function renderSidebar() {
    const sidebar = document.getElementById("side-panel");
}
function render(app) {
    renderSidebar();
    renderMainView();
    console.log('rendering');
}
const app = new VLApp();
app.setup().then((ok) => {
    if (!ok) {
        console.error("startup failed");
        return;
    }
    render(app);
});
