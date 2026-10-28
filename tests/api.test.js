const test = require('node:test');
const assert = require('node:assert/strict');

const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'server.js');

const fs = require('node:fs');

test('server entry exists for the local SQLite API', () => {
  assert.ok(fs.existsSync(serverPath), 'server.js should exist');
});
