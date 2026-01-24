let ws = new WebSocket("ws://localhost:6210/ws/control");

function setState(msg) {
  document.getElementById("state").innerText = msg;
}

ws.onopen = () => setState("connected to server");

ws.onmessage = (event) => {
  let msg = JSON.parse(event.data);

  if (msg.action === "START_RECORDING") {
    setState("Recording...")
  } else if (msg.action === "STOP_RECORDING") {
    setState("Recording stopped")
  }
}


