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
export var RESTEvents;
(function (RESTEvents) {
})(RESTEvents || (RESTEvents = {}));
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
