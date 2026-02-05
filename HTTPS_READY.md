# ✅ HTTPS Setup Complete!

## 🎉 What's Done

✅ Downloaded mkcert  
✅ Installed local certificate authority  
✅ Generated SSL certificates for:
   - localhost
   - 10.10.22.73
   - 10.10.126.107
   - 127.0.0.1

✅ Enabled HTTPS in `vite.config.ts`

---

## 🚀 Next Steps

### 1. Restart Frontend Server

**IMPORTANT:** You need to restart the frontend for HTTPS to work!

```bash
# In the terminal running npm run dev:
# Press Ctrl+C to stop

# Then restart:
npm run dev
```

You should see:
```
➜  Local:   https://localhost:5173/
➜  Network: https://10.10.22.73:5173/
```

**Note the HTTPS!** ✅

---

### 2. Test on Your Computer

1. Open browser: `https://localhost:5173`
2. Browser may show "Not Secure" warning
3. Click **"Advanced"** → **"Proceed to localhost (unsafe)"**
4. Enter username and create room
5. **Allow camera access** when prompted ✅
6. Select "Air Hockey"
7. Show your hands - paddles should move!

---

### 3. Test with Friend's Device

**On Friend's Phone/Laptop (same WiFi):**

1. Open browser: `https://10.10.22.73:5173`
2. Browser will show "Not Secure" warning (this is normal!)
3. Click **"Advanced"** → **"Proceed anyway"**
4. Enter username and join your room code
5. **Allow camera access** when prompted ✅
6. Show hands - their paddle should move!

---

## 🎮 How Air Hockey Works Now

**Player 1 (Your Computer):**
- Access: `https://localhost:5173` or `https://10.10.22.73:5173`
- Camera tracks your hands
- You control one paddle

**Player 2 (Friend's Device):**
- Access: `https://10.10.22.73:5173`
- Camera tracks their hands
- They control the other paddle

**Both players:**
- Show hands to camera
- Move hands to control paddles
- Hit the puck!

---

## ⚠️ Important Notes

**"Not Secure" Warning:**
- This is **normal** for self-signed certificates
- It's safe - you created the certificate yourself
- Click "Advanced" → "Proceed anyway"

**Camera Permission:**
- Browser will ask for camera access
- Click "Allow"
- If denied, check browser settings → Site settings → Camera

**Performance:**
- Works best on Chrome
- Needs good WiFi connection
- Each player's camera runs on their own device

---

## 🔧 Troubleshooting

**Frontend won't start:**
- Make sure certificates exist: `frontend/certs/key.pem` and `frontend/certs/cert.pem`
- Check for typos in `vite.config.ts`

**Camera not working:**
- Make sure you're using HTTPS (https://, not http://)
- Check browser console for errors
- Allow camera permission

**Friend can't connect:**
- Make sure both on same WiFi
- Use correct IP: `https://10.10.22.73:5173`
- Check firewall settings

---

## 🎯 Ready to Play!

1. **Restart frontend** (Ctrl+C, then `npm run dev`)
2. **Open** `https://localhost:5173`
3. **Create room** and get code
4. **Friend joins** from `https://10.10.22.73:5173`
5. **Select Air Hockey**
6. **Show hands** and play! 🏒

---

**RESTART THE FRONTEND NOW!** 🚀
