import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let esp32Socket = null;

wss.on("connection", (ws, req) => {
  console.log("New WS client connected");

  // Identify ESP32 vs UI
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // ESP32 state update
      if (data.type === "state_update") {
        console.log("State from ESP32:", data);
        // broadcast to all UI clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify(data));
          }
        });
      }

      // UI sends command
      if (data.type === "switch_command") {
        console.log("Command from UI:", data);
        if (esp32Socket && esp32Socket.readyState === 1) {
          esp32Socket.send(JSON.stringify(data));
        }
      }

      // First time: register ESP32
      if (data.type === "auth_success") {
        esp32Socket = ws;
        console.log("ESP32 registered");
      }
    } catch (e) {
      console.log("Invalid JSON:", msg.toString());
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (ws === esp32Socket) esp32Socket = null;
  });
});

server.listen(4000, () => {
  console.log("Server running on :4000");
});
