let ws = new WebSocket("ws://localhost:6210/ws/control");

function startRecording() {
  const msg = { action: "START_RECORDING_ALL" };
  ws.send(JSON.stringify(msg));
	console.log(msg);
}

function stopRecording() {
  const msg = { action: "STOP_RECORDING_ALL" };
  ws.send(JSON.stringify(msg))
	console.log(msg);
}

ws.onopen = () => {
	console.log("Connected to backend server");
};

ws.onmessage = (event) => {
	console.log("Server: " + event.data);
};
