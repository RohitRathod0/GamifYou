# 🎮 Local Network Multiplayer Testing Guide

## 🌐 Your Network Setup

**Your Computer's Local IP:** `10.10.22.73`

**Backend:** Already running on `0.0.0.0:8000` ✅  
**Frontend:** Running on `localhost:5173`

---

## 📱 How to Test Multiplayer on Different Devices

### **Option 1: Two Devices on Same WiFi (Recommended)**

#### **On Your Computer (Host):**
1. ✅ Backend is already running: `http://10.10.22.73:8000`
2. ✅ Frontend is already running: `http://localhost:5173`
3. Open browser: `http://10.10.22.73:5173`
4. Create a room and get the **Room Code**

#### **On Your Friend's Device (Phone/Laptop):**
1. Connect to **same WiFi network**
2. Open browser: `http://10.10.22.73:5173`
3. Enter the **Room Code** from your computer
4. Join the game!

---

### **Option 2: Same Computer, Two Browser Windows**

For quick testing without a second device:

1. **Window 1:** `http://localhost:5173` - Create room
2. **Window 2:** `http://localhost:5173` (new incognito window) - Join room
3. Position windows side-by-side
4. Each window controls one paddle

---

## 🎯 Testing Each Game

### **1. Air Hockey**
- **Player 1 (Red):** Left paddle - controlled by left hand
- **Player 2 (Blue):** Right paddle - controlled by right hand
- Both players need webcam access
- Each device shows their own webcam feed

### **2. Tic Tac Toe**
- Turn-based game
- Player 1 makes a move → Player 2's turn
- No webcam needed

### **3. Rock Paper Scissors**
- Both players show hand gesture simultaneously
- Webcam required on both devices
- Winner determined automatically

### **4. Flappy Bird (Multiplayer)**
- Both players control their own bird
- Compete for highest score
- Hand gestures to flap

---

## 🔧 Current Configuration

Your app is configured to connect to:
- **Backend WebSocket:** `ws://localhost:8000/ws`
- **Backend API:** `http://localhost:8000`

### **For Local Network Access:**

You need to update the frontend to use your local IP instead of `localhost`.

**Two options:**

#### **A. Quick Test (Manual URL)**
Just access: `http://10.10.22.73:5173` from any device on your WiFi

#### **B. Update Config (Recommended)**
Update `frontend/src/config.ts` to use environment variables:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://10.10.22.73:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://10.10.22.73:8000/ws';
```

---

## 🚀 Quick Start

### **Right Now (No Code Changes):**

1. **On Your Computer:**
   - Open: `http://10.10.22.73:5173`
   - Click "Create Room"
   - Note the room code (e.g., "ABC123")

2. **On Friend's Phone/Laptop (same WiFi):**
   - Open: `http://10.10.22.73:5173`
   - Click "Join Room"
   - Enter room code "ABC123"
   - Select a game!

3. **Play!**
   - Air Hockey: Both use webcams
   - Tic Tac Toe: Take turns clicking
   - RPS: Both show hand gestures
   - Flappy Bird: Compete for score

---

## ⚠️ Troubleshooting

### **Can't Connect from Other Device:**

1. **Check Firewall:**
   ```powershell
   # Run as Administrator
   netsh advfirewall firewall add rule name="Vite Dev Server" dir=in action=allow protocol=TCP localport=5173
   netsh advfirewall firewall add rule name="FastAPI Backend" dir=in action=allow protocol=TCP localport=8000
   ```

2. **Verify WiFi:**
   - Both devices on **same network**
   - Not on guest WiFi

3. **Test Backend:**
   - From friend's device, open: `http://10.10.22.73:8000/docs`
   - Should see FastAPI docs

4. **Test Frontend:**
   - From friend's device, open: `http://10.10.22.73:5173`
   - Should see your app

### **WebSocket Connection Issues:**

The WebSocket might still try to connect to `localhost`. If that happens, we need to update the config files.

---

## 📝 What You Have

Your backend is **already configured correctly** with:
```python
--host 0.0.0.0 --port 8000
```

This means it accepts connections from any device on your network! ✅

Your frontend Vite server **should also work** on the network by default.

---

## 🎮 Game-Specific Notes

### **Air Hockey:**
- **Current Issue:** Both players control both paddles (local multiplayer)
- **For Network Play:** Need to assign paddle to player ID
- Each player should only control their assigned paddle

### **Tic Tac Toe:**
- ✅ Already works for network play
- Turn-based, no issues

### **Rock Paper Scissors:**
- ✅ Should work for network play
- Both players submit gesture, then results shown

### **Flappy Bird:**
- ✅ Should work for network play
- Each player controls their own bird

---

## 🔥 Next Steps

1. **Test basic connection:**
   - Access `http://10.10.22.73:5173` from another device
   - Create and join a room

2. **If WebSocket fails:**
   - I'll update the config to use your local IP

3. **Fix Air Hockey multiplayer:**
   - Assign paddles based on player ID
   - Each player controls only their paddle

**Try it now and let me know what happens!** 🚀
