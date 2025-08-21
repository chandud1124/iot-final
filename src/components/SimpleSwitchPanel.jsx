// src/components/SimpleSwitchPanel.jsx
import React, { useEffect, useState } from "react";
import { onStateUpdate, sendSwitchCommand } from "../services/wsService";

const GPIO_LIST = [25, 26, 27]; // Example GPIOs

export default function SimpleSwitchPanel() {
  const [switches, setSwitches] = useState({});

  useEffect(() => {
    onStateUpdate((data) => {
      // Update state for received GPIO
      setSwitches((prev) => ({ ...prev, [data.gpio]: data.state }));
    });
  }, []);

  const toggleSwitch = (gpio) => {
    const newState = !switches[gpio];
    setSwitches((prev) => ({ ...prev, [gpio]: newState }));
    sendSwitchCommand(gpio, newState);
  };

  return (
    <div>
      {GPIO_LIST.map((gpio) => (
        <button
          key={gpio}
          onClick={() => toggleSwitch(gpio)}
          style={{
            background: switches[gpio] ? "green" : "red",
            padding: "10px",
            margin: "5px",
            color: "white",
            border: "none",
            borderRadius: "5px"
          }}
        >
          GPIO {gpio}: {switches[gpio] ? "ON" : "OFF"}
        </button>
      ))}
    </div>
  );
}
