<!DOCTYPE html>
<html>
<head>
  <title>Social App</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{font-family:sans-serif;max-width:600px;margin:0 auto;padding:10px;} .post{background:#f0f0f0;padding:10px;margin:10px 0;border-radius:5px;} input,button{width:100%;padding:10px;margin:5px 0;}</style>
</head>
<body>
  <h2>My Social Network</h2>
  
  <div id="auth">
    <input id="username" placeholder="Username">
    <input id="password" type="password" placeholder="Password">
    <button onclick="register()">Register</button>
    <button onclick="login()">Login</button>
  </div>

  <div id="postArea" style="display:none;">
    <p>Logged in as: <span id="displayUser"></span></p>
    <textarea id="content" placeholder="What's on your mind?"></textarea>
    <button onclick="submitPost()">Post</button>
  </div>

  <div id="feed"></div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    let myToken = '';

    // Load posts
    fetch('/') // In real app, fetch API endpoint
      .then(r => r.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Simple extraction for demo (better to use JSON API)
        // For this demo, we rely on socket for new posts, initial load is static
      });

    socket.on('new_post', (post) => {
      const feed = document.getElementById('feed');
      feed.innerHTML = `<div class="post"><strong>${post.username}</strong><br>${post.content}</div>` + feed.innerHTML;
    });

    async function register() {
      const u = document.getElementById('username').value;
      const p = document.getElementById('password').value;
      await fetch('/api/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p})});
      alert('Registered! Now login.');
    }

    async function login() {
      const u = document.getElementById('username').value;
      const p = document.getElementById('password').value;
      const res = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p})});
      if(res.ok) {
        const data = await res.json();
        myToken = data.token;
        document.getElementById('auth').style.display = 'none';
        document.getElementById('postArea').style.display = 'block';
        document.getElementById('displayUser').innerText = data.username;
      } else { alert('Login failed'); }
    }

    async function submitPost() {
      const content = document.getElementById('content').value;
      await fetch('/post', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({content, token: myToken})});
      document.getElementById('content').value = '';
    }
  </script>
</body>
</html>   
