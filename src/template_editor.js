const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const THEME_FILE = path.join(ROOT, 'data', 'theme.json');
const TEMPLATE_FILE = path.join(ROOT, 'data', 'slide_templates.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

function sendJSON(res, data, status = 200) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function safePath(requestPath) {
  const safePath = path.normalize(path.join(ROOT, requestPath));
  if (!safePath.startsWith(ROOT)) return null;
  return safePath;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === '/api/theme') {
    if (req.method === 'GET') {
      fs.readFile(THEME_FILE, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Failed to read theme.json' }));
          return;
        }
        try {
          const theme = JSON.parse(data);
          sendJSON(res, theme);
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Invalid JSON in theme.json' }));
        }
      });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const theme = JSON.parse(body);
          fs.writeFile(THEME_FILE, JSON.stringify(theme, null, 2), 'utf8', err => {
            if (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: 'Failed to save theme.json' }));
              return;
            }
            sendJSON(res, { ok: true });
          });
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (pathname === '/api/templates') {
    if (req.method === 'GET') {
      fs.readFile(TEMPLATE_FILE, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Failed to read slide_templates.json' }));
          return;
        }
        try {
          const template = JSON.parse(data);
          sendJSON(res, template);
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Invalid JSON in slide_templates.json' }));
        }
      });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const template = JSON.parse(body);
          fs.writeFile(TEMPLATE_FILE, JSON.stringify(template, null, 2), 'utf8', err => {
            if (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: 'Failed to save slide_templates.json' }));
              return;
            }
            sendJSON(res, { ok: true });
          });
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Serve static files from public directory
  let filePath = pathname === '/' ? '/public/editor.html' : '/public' + pathname;
  const ext = path.extname(filePath).toLowerCase();
  const safe = safePath(filePath);
  if (!safe) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };

  if (ext && contentTypes[ext]) {
    sendFile(res, safe, contentTypes[ext]);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Template editor is running at http://localhost:${PORT}`);
  console.log('Open that URL in your browser to edit theme.json and slide_templates.json.');
});
