const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PORT = 3000;
const DB_PATH = path.join(__dirname, 'careplus.db');
const FRONTEND_DIR = __dirname;

const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500'
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '300'
};

function getCorsOrigin(req) {
  const requestOrigin = req.headers.origin || 'http://127.0.0.1:5500';
  return ALLOWED_ORIGINS.has(requestOrigin)
    ? requestOrigin
    : 'http://127.0.0.1:5500';
}

function withCorsHeaders(req, extraHeaders = {}) {
  return {
    ...CORS_HEADERS,
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    ...extraHeaders
  };
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open SQLite database:', err.message);
    process.exit(1);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS patients (
      patientId TEXT PRIMARY KEY,
      patientName TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      phone TEXT NOT NULL,
      department TEXT NOT NULL,
      appointmentDate TEXT,
      appointmentTime TEXT
    )
  `, (createErr) => {
    if (createErr) {
      console.error('Failed to initialize SQLite schema:', createErr.message);
      process.exit(1);
    }
    console.log('SQLite database ready at:', DB_PATH);
  });
});

function jsonResponse(req, res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...withCorsHeaders(req)
  });
  res.end(JSON.stringify(data));
}

function getPatientFromBody(body) {
  if (!body) {
    return {};
  }

  const parsed = typeof body === 'string' ? JSON.parse(body) : body;

  return {
    patientId: parsed.patientId || undefined,
    patientName: String(parsed.patientName || '').trim(),
    age: Number(parsed.age),
    gender: String(parsed.gender || '').trim(),
    phone: String(parsed.phone || '').trim(),
    department: String(parsed.department || '').trim(),
    appointmentDate: String(parsed.appointmentDate || '').trim(),
    appointmentTime: String(parsed.appointmentTime || '').trim()
  };
}

function validatePatient(patient) {
  if (!patient.patientName || !patient.phone || !patient.department) {
    return 'patientName, phone, and department are required.';
  }

  if (!Number.isInteger(patient.age) || patient.age < 1 || patient.age > 124) {
    return 'age must be a whole number between 1 and 124.';
  }

  return null;
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...withCorsHeaders(req)
      });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      ...withCorsHeaders(req)
    });
    res.end(content);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON payload.'));
      }
    });

    req.on('error', reject);
  });
}

async function handlePatientsApi(req, res, pathname, patientId) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, withCorsHeaders(req));
    res.end();
    return;
  }

  if (req.method === 'GET' && !patientId) {
    db.all('SELECT * FROM patients ORDER BY patientName COLLATE NOCASE ASC', (err, rows) => {
      if (err) {
        jsonResponse(req, res, 500, { error: err.message });
        return;
      }
      jsonResponse(req, res, 200, rows);
    });
    return;
  }

  if (req.method === 'GET' && patientId) {
    db.get('SELECT * FROM patients WHERE patientId = ?', [patientId], (err, row) => {
      if (err) {
        jsonResponse(req, res, 500, { error: err.message });
        return;
      }
      if (!row) {
        jsonResponse(req, res, 404, { error: 'Patient not found.' });
        return;
      }
      jsonResponse(req, res, 200, row);
    });
    return;
  }

  if (req.method === 'POST' && !patientId) {
    try {
      const patient = getPatientFromBody(await readRequestBody(req));
      const validationError = validatePatient(patient);

      if (validationError) {
        jsonResponse(req, res, 400, { error: validationError });
        return;
      }

      const newId = patient.patientId || `P-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const finalPatient = {
        ...patient,
        patientId: newId,
        age: Number(patient.age)
      };

      db.run(
        `INSERT INTO patients (patientId, patientName, age, gender, phone, department, appointmentDate, appointmentTime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalPatient.patientId,
          finalPatient.patientName,
          finalPatient.age,
          finalPatient.gender,
          finalPatient.phone,
          finalPatient.department,
          finalPatient.appointmentDate,
          finalPatient.appointmentTime
        ],
        function (err) {
          if (err) {
            jsonResponse(req, res, 500, { error: err.message });
            return;
          }

          jsonResponse(req, res, 201, finalPatient);
        }
      );
    } catch (error) {
      jsonResponse(req, res, 400, { error: error.message || 'Invalid JSON payload.' });
    }
    return;
  }

  if (req.method === 'PUT' && patientId) {
    try {
      const incoming = getPatientFromBody(await readRequestBody(req));
      const validationError = validatePatient(incoming);

      if (validationError) {
        jsonResponse(req, res, 400, { error: validationError });
        return;
      }

      db.get('SELECT * FROM patients WHERE patientId = ?', [patientId], (selectErr, existing) => {
        if (selectErr) {
          jsonResponse(req, res, 500, { error: selectErr.message });
          return;
        }

        if (!existing) {
          jsonResponse(req, res, 404, { error: 'Patient not found.' });
          return;
        }

        const updatedPatient = {
          ...existing,
          ...incoming,
          patientId,
          age: Number(incoming.age)
        };

        db.run(
          `UPDATE patients SET patientName = ?, age = ?, gender = ?, phone = ?, department = ?, appointmentDate = ?, appointmentTime = ? WHERE patientId = ?`,
          [
            updatedPatient.patientName,
            updatedPatient.age,
            updatedPatient.gender,
            updatedPatient.phone,
            updatedPatient.department,
            updatedPatient.appointmentDate,
            updatedPatient.appointmentTime,
            patientId
          ],
          function (err) {
            if (err) {
              jsonResponse(req, res, 500, { error: err.message });
              return;
            }

            jsonResponse(req, res, 200, updatedPatient);
          }
        );
      });
    } catch (error) {
      jsonResponse(req, res, 400, { error: error.message || 'Invalid JSON payload.' });
    }
    return;
  }

  if (req.method === 'DELETE' && patientId) {
    db.get('SELECT * FROM patients WHERE patientId = ?', [patientId], (selectErr, existing) => {
      if (selectErr) {
        jsonResponse(req, res, 500, { error: selectErr.message });
        return;
      }

      if (!existing) {
        jsonResponse(req, res, 404, { error: 'Patient not found.' });
        return;
      }

      db.run('DELETE FROM patients WHERE patientId = ?', [patientId], (deleteErr) => {
        if (deleteErr) {
          jsonResponse(req, res, 500, { error: deleteErr.message });
          return;
        }

        jsonResponse(req, res, 200, { message: 'Patient deleted successfully.' });
      });
    });
    return;
  }

  jsonResponse(req, res, 405, { error: 'Method not allowed.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/patients' || pathname.startsWith('/patients/')) {
      const segments = pathname.split('/').filter(Boolean);
      const patientId = segments.length > 1 ? decodeURIComponent(segments[1]) : null;
      await handlePatientsApi(req, res, pathname, patientId);
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      sendFile(req, res, path.join(FRONTEND_DIR, 'index.html'));
      return;
    }

    if (pathname === '/script.js') {
      sendFile(req, res, path.join(FRONTEND_DIR, 'script.js'));
      return;
    }

    if (pathname === '/style.css') {
      sendFile(req, res, path.join(FRONTEND_DIR, 'style.css'));
      return;
    }

    sendFile(req, res, path.join(FRONTEND_DIR, pathname));
  } catch (error) {
    jsonResponse(req, res, 500, { error: error.message || 'Internal server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`CarePlus SQLite server running at http://127.0.0.1:${PORT}`);
  console.log('Frontend should be opened at http://127.0.0.1:5500/index.html or via this server root.');
});
