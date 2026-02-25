# 🚀 How to Start the Backend Server

## Quick Start (Windows)

### Method 1: Double-click the batch file
1. Navigate to the `backend` folder
2. Double-click `start-server.bat`
3. Wait for the server to start
4. You should see: `🔥 Server started on port 8000`

### Method 2: Using Command Prompt/Terminal

1. **Open Command Prompt or PowerShell**
2. **Navigate to backend folder:**
   ```bash
   cd "C:\Users\himan\Downloads\Learnify Main - Copy\Learnify 2\backend"
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```
   
   OR
   
   ```bash
   node index.js
   ```

4. **You should see:**
   ```
   🔥 Server started on port 8000
   🌍 Environment: development
   ✅ Database connection verified - Ready to serve requests
   ```

5. **Keep this terminal window open** - Don't close it!

---

## ✅ Verify Server is Running

1. **Open your browser**
2. **Go to:** `http://localhost:8000/`
3. **You should see:** "Server Running Successfully ✔"

If you see this, the server is running correctly!

---

## 🔧 Troubleshooting

### Issue: "Cannot find module"
**Solution:**
```bash
cd backend
npm install
```

### Issue: "Port 8000 already in use"
**Solution 1:** Find and close the process using port 8000
```bash
# Find process
netstat -ano | findstr :8000

# Kill process (replace PID with the number you see)
taskkill /PID <PID> /F
```

**Solution 2:** Change the port
1. Create/Edit `.env` file in `backend/` folder
2. Add: `PORT=8001`
3. Restart server

### Issue: "MONGODB_URL is not configured"
**Solution:**
1. Create `.env` file in `backend/` folder
2. Add your MongoDB connection string:
   ```
   MONGODB_URL=your_mongodb_connection_string
   JWT_SECRET=your_secret_key_here
   ```

### Issue: Server starts but frontend still shows errors
**Check:**
1. Server is running on port 8000
2. Frontend is trying to connect to `http://localhost:8000`
3. No firewall blocking the connection
4. Try refreshing the frontend page

---

## 📝 Important Notes

1. **The server must be running** for the frontend to work
2. **Keep the terminal open** while using the application
3. **To stop the server:** Press `Ctrl+C` in the terminal
4. **To restart:** Run the start command again

---

## 🎯 Quick Checklist

Before starting:
- [ ] You're in the `backend` folder
- [ ] Node.js is installed (`node --version`)
- [ ] Dependencies are installed (`npm install`)
- [ ] `.env` file exists (optional, but recommended)

After starting:
- [ ] Server shows "Server started on port 8000"
- [ ] Browser shows "Server Running Successfully ✔" at `http://localhost:8000/`
- [ ] No error messages in terminal

---

## 🆘 Still Having Issues?

1. **Check the terminal output** for error messages
2. **Verify Node.js is installed:** `node --version`
3. **Verify npm is installed:** `npm --version`
4. **Check if port 8000 is free:** Try changing PORT in `.env`
5. **Check firewall settings** - Allow Node.js through firewall

---

**Once the server is running, refresh your frontend and the errors should be resolved!**

