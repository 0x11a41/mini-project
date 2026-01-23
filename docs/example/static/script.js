let ws = new WebSocket("ws://localhost:8000/ws/control");

function startRecording() {
  const msg = { action: "START_RECORDING" };
  ws.send(JSON.stringify(msg));
  console.log("hello");
}

function stopRecording() {
  const msg = { action: "STOP_RECORDING" };
  ws.send(JSON.stringify(msg))
}

function log(text){
	document.getElementById("log").innerHTML += "<br>" + text;
}

ws.onopen = () => {
	log("Connected to backend server");
};

ws.onmessage = (event) => {
	log("Server: " + event.data);
};
	
