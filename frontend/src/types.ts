// ============================================
// ================ NETWORKING ================
// ============================================
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
  SESSION_UPDATE = "session_update",
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
  // TODO
}

export interface Rename {
  new_name: string;
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

// WSPayload factory
export const Payloads = {
  action: (type: WSActions, session_id: string = "all"): WSPayload => ({
    kind: WSKind.ACTION,
    msg_type: type,
    body: { session_id, trigger_time: null }
  }),

  rename: (newName: string): WSPayload => ({
    kind: WSKind.ACTION,
    msg_type: WSEvents.DASHBOARD_RENAME,
    body: { new_name: newName }
  }),

  event: (type: WSEvents, body: WSBodyTypes | null = null): WSPayload => ({
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


// =============================================
// ================= INTERFACE =================
// =============================================
