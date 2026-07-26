const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_in_render';

// --- Database Setup ---
let db;
const DB_FILE = 'social_app.db';

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, username TEXT, content TEXT, time TEXT)`);
  saveDB();
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// --- Middleware & Auth ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token; // Simple cookie check (requires cookie-parser in prod, simplified here)
  // For this demo, we pass token via header or session logic in frontend
  next(); 
};

// --- Routes ---
app.get('/', (req, res) => {
  const stmt = db.prepare('SELECT * FROM posts ORDER BY id DESC');
  const posts = [];
  while (stmt.step()) posts.push(stmt.getAsObject());
  stmt.free();
  res.render('index', { posts, user: null }); // Simplified for demo
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    saveDB();
    res.send('Registered! Please login.');
  } catch (e) { res.send('User exists'); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  stmt.bind([username]);
  let user = null;
  if (stmt.step()) user = stmt.getAsObject();
  stmt.free();
  
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ username }, JWT_SECRET);
    res.json({ token, username });
  } else {
    res.status(401).send('Invalid login');
  }
});

app.post('/post', (req, res) => {
  const { content, token } = req.body;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const time = new Date().toISOString();
    db.run('INSERT INTO posts (username, content, time) VALUES (?, ?, ?)', [decoded.username, content, time]);
    saveDB();
    const newPost = { username: decoded.username, content, time };
    io.emit('new_post', newPost);
    res.redirect('/');
  } catch (e) { res.send('Login required'); }
});

// Start
initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// Add this to catch the error early
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});
          
