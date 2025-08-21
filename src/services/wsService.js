
// Native WebSocket client for UI
const ws = new WebSocket("ws://localhost:4000");

export function onStateUpdate(callback) {
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "state_update") {
        callback(data);
      }
    } catch (e) {
      console.error("Invalid WS message", event.data);
    }
  };
}

export function sendSwitchCommand(gpio, state) {
  ws.send(JSON.stringify({ type: "switch_command", gpio, state }));
}

ws.onopen = () => {
  console.log("WebSocket connected");
  // Optionally send auth or initial message here
};

ws.onclose = () => {
  console.log("WebSocket disconnected");
};
