# 🔒 HTTPS Setup Script for Windows

## Quick Setup (No Chocolatey Needed!)

### Step 1: Download mkcert

1. Go to: https://github.com/FiloSottile/mkcert/releases/latest
2. Download: `mkcert-v1.4.4-windows-amd64.exe`
3. Rename to: `mkcert.exe`
4. Move to: `C:\Windows\System32\` (or any folder in PATH)

**OR use PowerShell to download:**

```powershell
# Run in PowerShell
cd $env:USERPROFILE\Downloads
Invoke-WebRequest -Uri "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe" -OutFile "mkcert.exe"
```

### Step 2: Install Local CA (One-time)

```powershell
# Run as Administrator
.\mkcert.exe -install
```

This installs a local certificate authority on your computer.

### Step 3: Generate Certificates

```powershell
# Navigate to frontend folder
cd c:\Users\rohit\OneDrive\Desktop\AI_Projects\vaw3\frontend

# Create certs directory
mkdir certs

# Generate certificates for your IPs
.\mkcert.exe -key-file certs\key.pem -cert-file certs\cert.pem localhost 10.10.22.73 10.10.126.107 127.0.0.1
```

### Step 4: Enable HTTPS in Vite

Edit `vite.config.ts` and uncomment the HTTPS section (lines 15-18):

```typescript
https: {
    key: fs.readFileSync('./certs/key.pem'),
    cert: fs.readFileSync('./certs/cert.pem'),
},
```

### Step 5: Restart Frontend

```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 6: Access with HTTPS

- **Your computer:** `https://localhost:5173` or `https://10.10.22.73:5173`
- **Friend's device:** `https://10.10.22.73:5173`

**Note:** Browser will show "Not Secure" warning on friend's device. Click "Advanced" → "Proceed to site"

---

## ✅ After Setup

1. Both players access: `https://10.10.22.73:5173`
2. Both allow camera access
3. Create/join room
4. Select Air Hockey
5. Show hands to control paddles!

---

## 🚨 Troubleshooting

**"mkcert: command not found"**
- Make sure mkcert.exe is in your PATH or use full path: `C:\path\to\mkcert.exe`

**"Certificate not trusted" on friend's device**
- This is normal! Click "Advanced" → "Proceed anyway"
- Or install the CA on their device too (optional)

**Camera still not working**
- Make sure you're using HTTPS (https://, not http://)
- Check browser console for errors
- Try Chrome (best compatibility)

---

## 📝 Quick Commands Summary

```powershell
# 1. Download mkcert (if not done)
cd $env:USERPROFILE\Downloads
Invoke-WebRequest -Uri "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe" -OutFile "mkcert.exe"

# 2. Install CA (run as Admin)
.\mkcert.exe -install

# 3. Generate certs
cd c:\Users\rohit\OneDrive\Desktop\AI_Projects\vaw3\frontend
mkdir certs
..\..\..\..\..\Downloads\mkcert.exe -key-file certs\key.pem -cert-file certs\cert.pem localhost 10.10.22.73 10.10.126.107 127.0.0.1

# 4. Uncomment HTTPS in vite.config.ts

# 5. Restart
npm run dev
```
