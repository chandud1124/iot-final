
# ESP32 Classroom Automation Setup Instructions

## Prerequisites:
- Arduino IDE 2.0+ installed
- ESP32 board package installed
- Required libraries installed (see libraries.txt)
- Hardware assembled per wiring guide

## Step 1: Install ESP32 Board Package
1. Open Arduino IDE
2. Go to File > Preferences  
3. Add this URL to "Additional Board Manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Go to Tools > Board > Boards Manager
5. Search "ESP32" and install "ESP32 by Espressif Systems"

## Step 2: Configure Your Settings
1. Edit `config.h` file with your specific settings:
   ```cpp
   #define WIFI_SSID "YourWiFiNetwork"
   #define WIFI_PASSWORD "YourWiFiPassword" 
   #define SERVER_URL "http://192.168.1.100:3001"
   #define WEBSOCKET_HOST "192.168.1.100"
   ```

2. Update device information:
   ```cpp
   #define DEVICE_NAME "Room 101 Controller"
   #define DEVICE_LOCATION "Room 101" 
   #define CLASSROOM_NAME "Computer Science Lab"
   ```

3. Configure switch names and types:
   ```cpp
   const String SWITCH_NAMES[4] = {
     "LED Lights",
     "Ceiling Fan", 
     "Projector",
     "Smart Board"
   };
   ```

## Step 3: Upload Code
1. Connect ESP32 to computer via USB
2. Select correct board: Tools > Board > ESP32 Dev Module
3. Select correct port: Tools > Port > (your ESP32 port)
4. Set upload speed: Tools > Upload Speed > 921600
5. Click Upload button

## Step 4: Monitor Serial Output
1. Open Serial Monitor (Tools > Serial Monitor)
2. Set baud rate to 115200
3. Press ESP32 reset button
4. Verify WiFi connection and device registration

## Expected Serial Output:
```
Connecting to WiFi.........
WiFi connected!
IP address: 192.168.1.150
MAC address: AA:BB:CC:DD:EE:FF
Device registered successfully!
Device ID: 507f1f77bcf86cd799439011
WebSocket Connected
ESP32 Classroom Automation Device Ready
```

## Step 5: Verify Web Dashboard
1. Open your classroom automation web dashboard
2. Navigate to Devices page
3. Verify your ESP32 appears as "Online"
4. Test switch controls from web interface
5. Verify manual switches work locally

## Step 6: Test PIR Sensor (if enabled)
1. Wave hand in front of PIR sensor
2. Check serial output for "Motion detected!"
3. Verify linked switches turn on automatically
4. Check web dashboard for PIR events

## Troubleshooting:

### WiFi Connection Issues:
- Verify SSID and password in config.h
- Check WiFi signal strength
- Try different WiFi network
- Reset ESP32 and try again

### Device Registration Failed:
- Verify server URL is correct
- Check if backend server is running
- Ensure ESP32 and server are on same network
- Check firewall settings

### Relays Not Working:
- Verify wiring connections
- Check 5V power supply for relays  
- Test relays manually with multimeter
- Verify GPIO pin assignments

### WebSocket Connection Issues:
- Check WebSocket host/port settings
- Verify server WebSocket endpoint is running
- Check network connectivity
- Try restarting both ESP32 and server

### Manual Switches Not Responding:
- Check pull-up resistor connections
- Verify switch wiring
- Test switch continuity with multimeter
- Check GPIO pin assignments in code

## Multiple ESP32 Setup:
For classrooms requiring multiple ESP32 controllers:

1. Use unique device names in config.h:
   ```cpp
   #define DEVICE_NAME "Room 101 Controller A"
   #define DEVICE_NAME "Room 101 Controller B"  
   ```

2. Use different GPIO pins if sharing same PCB design

3. Each ESP32 will auto-register as separate device

4. Assign to same classroom in web dashboard

## Maintenance:
- Check device status weekly in web dashboard
- Monitor power consumption logs
- Update firmware when new versions available
- Clean PIR sensor lens monthly
- Test manual override switches monthly

## Security Notes:
- Change default WiFi credentials
- Use strong server authentication
- Keep firmware updated
- Monitor device access logs
- Use dedicated IoT network if possible
