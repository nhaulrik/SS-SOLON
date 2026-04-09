const http = require('http');

const testData = JSON.stringify({
  jsonString: '{"title": "F1: Speed, Strategy, and Glory"}',
  tags: [{ key: 'title', slideIndex: 1 }],
  recordSlideIndex: null
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/validate-json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': testData.length
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(testData);
req.end();