import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL, // your variable connection
  ssl: { rejectUnauthorized: false }, // required for Render
});

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve customer page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Serve mechanic/admin page
app.get('/mechanic', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/mechanic.html'));
});

// API route to check DB connection
app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: '✅ Backend is running and DB connected!' });
  } catch (err) {
    res.json({ status: '❌ Database not connected', error: err.message });
  }
});

// Initialize tables and dummy data
async function initDb() {
  try {
    await pool.query(`DROP TABLE IF EXISTS bookings, customers, services, loyalty, qr_codes;`);

    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price NUMERIC(10,2) NOT NULL
      );

      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        date_time TIMESTAMP NOT NULL,
        location VARCHAR(255),
        number_plate VARCHAR(10),
        qr_code TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        completed_services INT DEFAULT 0
      );

      CREATE TABLE qr_codes (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        qr_data TEXT
      );
    `);

    // Insert dummy services
    const serviceNames = ['Oil Change','Brake Check','Battery Replacement','Tyre Rotation','Filter Change','AC Service','Wheel Alignment'];
    for (const s of serviceNames) {
      await pool.query('INSERT INTO services(name, price) VALUES($1, $2)', [s, Math.floor(Math.random() * 100) + 50]);
    }

    // Insert dummy customers
    const customerNames = ['John Doe','Jane Smith','Ali Khan','Sara Ahmed','Mike Brown'];
    for (const c of customerNames) {
      await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3)', [c, c.replace(' ','').toLowerCase()+'@mail.com', '+447400000000']);
    }

    // Insert dummy bookings
    for (let i = 1; i <= 10; i++) {
      await pool.query(
        `INSERT INTO bookings(customer_id, service_id, date_time, location, number_plate) 
         VALUES($1,$2,$3,$4,$5)`,
        [
          Math.ceil(Math.random() * 5),
          Math.ceil(Math.random() * 7),
          new Date(Date.now() + i*3600000),
          `Address ${i}`,
          `AB12 CDE`
        ]
      );
    }

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

initDb();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});