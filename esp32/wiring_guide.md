
# ESP32 Classroom Automation - Wiring Guide

## Components Needed:
- ESP32 Development Board
- 4-Channel Relay Module (5V)
- PIR Motion Sensor (HC-SR501)
- 4x Push Button Switches (for manual override)
- 4x 10kΩ Pull-up Resistors
- Jumper Wires
- Breadboard or PCB
- 5V Power Supply for Relays
- Screw Terminals for AC connections

## Pin Connections:

### ESP32 to 4-Channel Relay Module:
```
ESP32 Pin    ->    Relay Module
GPIO 2       ->    IN1 (Relay 1 - Main Lights)
GPIO 4       ->    IN2 (Relay 2 - Ceiling Fan)  
GPIO 5       ->    IN3 (Relay 3 - Projector)
GPIO 18      ->    IN4 (Relay 4 - Smart Board)
5V           ->    VCC
GND          ->    GND
```

### ESP32 to PIR Motion Sensor:
```
ESP32 Pin    ->    PIR Sensor
GPIO 16      ->    OUT
5V           ->    VCC  
GND          ->    GND
```

### ESP32 to Manual Override Switches:
```
ESP32 Pin    ->    Switch Connection
GPIO 14      ->    Switch 1 (one terminal) -> 10kΩ to 3.3V
GPIO 12      ->    Switch 2 (one terminal) -> 10kΩ to 3.3V
GPIO 13      ->    Switch 3 (one terminal) -> 10kΩ to 3.3V
GPIO 15      ->    Switch 4 (one terminal) -> 10kΩ to 3.3V
GND          ->    Other terminal of all switches
```

### AC Load Connections (⚠️ HIGH VOLTAGE - ELECTRICIAN REQUIRED):
```
Relay 1 NO (Normally Open) -> Main Lights Hot Wire
Relay 2 NO                  -> Ceiling Fan Hot Wire
Relay 3 NO                  -> Projector Hot Wire
Relay 4 NO                  -> Smart Board Hot Wire

Common (COM) of all relays  -> Main AC Hot Wire (220V/110V)
AC Neutral                  -> Direct to all loads
AC Ground                   -> Direct to all loads and ESP32 GND
```

## Power Supply:
- ESP32: USB power (5V) or external 5V supply
- Relays: External 5V/2A supply recommended
- Connect ESP32 GND to Relay module GND

## Safety Warnings:
⚠️ **DANGER - HIGH VOLTAGE**
- AC wiring MUST be done by qualified electrician
- Turn OFF main circuit breaker before wiring
- Use proper electrical boxes and conduits  
- Test all connections before powering on
- Follow local electrical codes

## PCB Layout Recommendations:
- Keep AC and DC sections separated
- Use optoisolated relays for safety
- Add fuses for each AC circuit
- Use appropriate wire gauges (14 AWG for 15A circuits)
- Label all connections clearly

## Enclosure:
- Use NEMA rated enclosure for classroom installation
- Ensure proper ventilation for heat dissipation
- Mount securely away from water sources
- Provide access for maintenance

## Testing Procedure:
1. Test DC circuits first (ESP32, sensors, switches)
2. Verify relay clicking without AC load
3. Test each AC circuit individually with multimeter
4. Gradually connect loads one by one
5. Test WiFi connectivity and server communication
6. Verify all manual overrides work
7. Test PIR sensor functionality
8. Document all pin assignments and connections
