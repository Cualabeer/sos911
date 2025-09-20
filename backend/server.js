const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const JWT_SECRET = process.env.JWT_SECRET;

// --- Serve frontend ---
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- Utility: Role-based middleware ---
function auth(role) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (role && decoded.role !== role) return res.status(403).json({ message: 'Forbidden' });
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

// --- ROUTES ---

// 1. Register
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, role',
      [name, email, password, role || 'customer']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT id, password, role FROM customers WHERE email=$1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = result.rows[0];
    if (user.password !== password) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Services
app.get('/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY group_id, name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Book Service
app.post('/book', auth(), async (req, res) => {
  const { customer_id, service_id, vehicle_plate, date_time } = req.body;
  const formattedPlate = vehicle_plate.toUpperCase().replace(/ /g, '');
  const checkValue = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const result = await pool.query(
      'INSERT INTO jobs (customer_id, service_id, vehicle_plate, date_time, check_value, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [customer_id, service_id, formattedPlate, date_time, checkValue, 'pending']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Mechanic Job List
app.get('/mechanic/jobs', auth('mechanic'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs ORDER BY date_time DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Start Job
app.post('/mechanic/job/start', auth('mechanic'), async (req, res) => {
  const { job_id } = req.body;
  try {
    const result = await pool.query('UPDATE jobs SET status=$1, start_time=NOW() WHERE id=$2 RETURNING *', ['in_progress', job_id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Complete Job
app.post('/mechanic/job/complete', auth('mechanic'), async (req, res) => {
  const { job_id, parts_used } = req.body;
  try {
    const job = await pool.query('UPDATE jobs SET status=$1, parts_used=$2, end_time=NOW() WHERE id=$3 RETURNING *', ['completed', parts_used, job_id]);

    // Update loyalty points
    const jobRow = job.rows[0];
    await pool.query(`
      INSERT INTO customer_loyalty (customer_id, visits)
      VALUES ($1,1)
      ON CONFLICT (customer_id) DO UPDATE SET visits = customer_loyalty.visits + 1
    `, [jobRow.customer_id]);

    res.json(job.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. QR Ticket info
app.get('/job/:id/ticket', auth(), async (req, res) => {
  const job_id = req.params.id;
  const userRole = req.user.role;

  try {
    const result = await pool.query('SELECT * FROM jobs WHERE id=$1', [job_id]);
    if(result.rows.length === 0) return res.status(404).json({ message: 'Job not found' });

    const job = result.rows[0];
    let ticket = {
      jobRef: job.id,
      service_id: job.service_id,
      date: job.date_time,
      checkValue: job.check_value
    };

    if(userRole === 'mechanic'){
      ticket.partsUsed = job.parts_used;
      ticket.startTime = job.start_time;
      ticket.endTime = job.end_time;
    }

    res.json(ticket);
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

// --- Catch-all route to serve frontend pages ---
app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));