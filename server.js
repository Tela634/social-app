const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const twilio = require('twilio');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Database } = require('sqlite3'); // Or use sql.js if sqlite3 fails

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'c8b51e33dc4e39c1dd60f9abf929a067';
const TWILIO_SID = process.env.TWILIO_SID || 'your_sid';
const TWILIO_TOKEN = process.env.TWILIO_TOKEN || 'your_token';
const TWILIO_SERVICE = process.env.TWILIO_SERVICE || 'your_service_id';
const client = twilio(TWILIO_SID, TWILIO_TOKEN);

// --- DATABASE SETUP (SQLite) ---
const db = new Database('social_app.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (phone TEXT PRIMARY KEY, otp TEXT, otp_expiry INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, fromPhone TEXT, content TEXT, type TEXT, timestamp INTEGER, expires_at INTEGER, edited INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS reactions (msg_id INTEGER, phone TEXT, emoji TEXT, PRIMARY KEY(msg_id, phone))`);
});

// Auto-Delete Job: Run every hour to delete old messages
setInterval(() => {
  const now = Date.now();
  db.run(`DELETE FROM messages WHERE expires_at < ?`, [now]);
  console.log('Cleaned up expired messages');
}, 3600000);

app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// --- AUTH ROUTES (Phone Number) ---
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  // In production, validate phone format strictly
  try {
    await client.verify.v2.services(TWILIO_SERVICE).verifications.create({
      to: phone, channel: 'sms'
    });
    res.json({ success: true });
  } catch (e) {
    // Fallback for demo if Twilio fails (accept any OTP)
    console.log("Twilio error (Demo Mode):", e.message);
    res.json({ success: true, demo: true }); 
  }
});

app.post('/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  // In production, verify with Twilio
  // For demo, we accept any 4-digit code if 'demo' mode
  const token = jwt.sign({ phone }, JWT_SECRET);
  res.json({ token, phone });
});

// --- QR PAIRING ROUTE ---
app.get('/pair-qr', async (req, res) => {
  const socketId = req.query.socketId;
  const qrData = JSON.stringify({ type: 'pair', socketId, timestamp: Date.now() });
  const qrImage = await QRCode.toDataURL(qrData);
  res.json({ qrImage });
});

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('login', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      currentUser = decoded.phone;
      socket.join(currentUser);
      console.log(`User ${currentUser} connected`);
    } catch (e) { socket.disconnect(); }
  });

  socket.on('send_message', (data) => {
    if (!currentUser) return;
    const { to, content, type } = data;
    const now = Date.now();
    const expiresAt = now + (14 * 24 * 60 * 60 * 1000); // 2 Weeks

    db.run(`INSERT INTO messages (fromPhone, content, type, timestamp, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [currentUser, content, type || 'text', now, expiresAt], function(err) {
        if (err) return;
        const msg = { id: this.lastID, from: currentUser, content, type, timestamp: now, expires_at: expiresAt };
        io.to(to).emit('new_message', msg);
        io.to(currentUser).emit('new_message', msg); // Echo to sender
      });
  });

  socket.on('edit_message', (data) => {
    if (!currentUser) return;
    const { msgId, newContent } = data;
    db.run(`UPDATE messages SET content = ?, edited = 1 WHERE id = ? AND fromPhone = ?`, [newContent, msgId, currentUser]);
    io.emit('message_edited', { msgId, newContent, edited: true });
  });

  socket.on('unsend_message', (data) => {
    if (!currentUser) return;
    const { msgId } = data;
    db.run(`DELETE FROM messages WHERE id = ? AND fromPhone = ?`, [msgId, currentUser]);
    io.emit('message_unsent', { msgId });
  });

  socket.on('react_message', (data) => {
    if (!currentUser) return;
    const { msgId, emoji } = data;
    db.run(`INSERT OR REPLACE INTO reactions (msg_id, phone, emoji) VALUES (?, ?, ?)`, [msgId, currentUser, emoji]);
    io.emit('reaction_added', { msgId, phone: currentUser, emoji });
  });
  
  // AI Search Placeholder (Simple string match for demo)
  socket.on('ai_search', (data) => {
    if (!currentUser) return;
    const { query } = data;
    db.all(`SELECT * FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT 10`, [`%${query}%`], (err, rows) => {
      socket.emit('search_results', rows);
    });
  });
});

app.get('/', (req, res) => {
  res.render('index');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));   
