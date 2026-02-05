# 🎮 Quick Multiplayer Setup

## ✅ What I Just Fixed

Updated `vite.config.ts` to listen on all network interfaces:
```typescript
host: '0.0.0.0'
```

This allows devices on your WiFi to access the app!

---

## 🚀 **RESTART YOUR FRONTEND SERVER**

**You need to restart the frontend for changes to take effect:**

1. **Stop the current server:**
   - Go to the terminal running `npm run dev`
   - Press `Ctrl+C`

2. **Start it again:**
   ```bash
   npm run dev
   ```

3. **You should see:**
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://10.10.22.73:5173/
   ```

---

## 🎯 **How to Test Multiplayer**

### **Your Computer:**
- Open: `http://10.10.22.73:5173` (or `http://localhost:5173`)
- Click "Create Room"
- Note the room code (e.g., "ABC123")

### **Friend's Device (Phone/Laptop on same WiFi):**
- Open: `http://10.10.22.73:5173`
- Click "Join Room"
- Enter room code "ABC123"
- Select a game!

---

## 🎮 **Games Ready for Network Play**

### ✅ **Tic Tac Toe**
- **Status:** Should work perfectly
- **How:** Turn-based, no webcam needed
- Player 1 clicks → Player 2's turn

### ✅ **Rock Paper Scissors**
- **Status:** Should work
- **How:** Both players show gesture, results shown

### ⚠️ **Air Hockey**
- **Status:** Needs fixing for network play
- **Current Issue:** Both players control both paddles
- **Fix Needed:** Assign one paddle per player

### ✅ **Flappy Bird**
- **Status:** Should work
- **How:** Each player controls their own bird

---

## 🔧 **If It Doesn't Work**

### **1. Check Firewall (Run as Administrator):**
```powershell
netsh advfirewall firewall add rule name="Vite Dev Server" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="FastAPI Backend" dir=in action=allow protocol=TCP localport=8000
```

### **2. Verify Backend is Accessible:**
From friend's device, open: `http://10.10.22.73:8000/docs`
- Should see FastAPI documentation

### **3. Verify Frontend is Accessible:**
From friend's device, open: `http://10.10.22.73:5173`
- Should see your app

---

## 📱 **Testing Without Second Device**

Use two browser windows on same computer:

1. **Window 1:** `http://localhost:5173` - Create room
2. **Window 2:** `http://localhost:5173` (incognito) - Join room
3. Position side-by-side and play!

---

## 🎯 **Next: Fix Air Hockey for Network Play**

After you test the connection, I can fix Air Hockey so each player only controls their assigned paddle.

**RESTART YOUR FRONTEND NOW!** 🚀
