
// Native WebSocket client for UI
const WS_URL = typeof window !== 'undefined' && window.WS_URL
  ? window.WS_URL
  : 'wss://smart-classroom-1wus.onrender.com/esp32-ws'; // Use your Render backend WebSocket endpoint for production
const ws = new WebSocket(WS_URL);

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
