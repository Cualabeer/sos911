import express from 'express';
import { Pool } from 'pg';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Initialize DB ---
async function initDb() {
  try {
    // Drop tables if they exist
    await pool.query(`DROP TABLE IF EXISTS qr_codes, bookings, loyalty, services, customers, mechanics`);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20)
      );
    `);

    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        price NUMERIC
      );
    `);

    await pool.query(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        date_time TIMESTAMP,
        number_plate VARCHAR(10),
        location TEXT,
        qr_code TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        services_completed INT DEFAULT 0
      );
    `);

    await pool.query(`
      CREATE TABLE mechanics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        password VARCHAR(100)
      );
    `);

    await pool.query(`
      CREATE TABLE qr_codes (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        code TEXT
      );
    `);

    // Insert dummy services
    const services = [
      ['Oil Change', 50],
      ['Brake Inspection', 70],
      ['Tyre Replacement', 120],
      ['Battery Check', 40],
      ['Full Service', 250],
      ['AC Repair', 90],
      ['Transmission Check', 150]
    ];

    for (const [name, price] of services) {
      await pool.query(`INSERT INTO services(name, price) VALUES($1,$2)`, [name, price]);
    }

    // Insert dummy customers
    const customers = [
      ['John Doe','john@example.com','+447700900111'],
      ['Jane Smith','jane@example.com','+447700900222'],
      ['Mike Johnson','mike@example.com','+447700900333'],
      ['Alice Brown','alice@example.com','+447700900444'],
      ['Bob White','bob@example.com','+447700900555']
    ];
    for (const [name,email,phone] of customers) {
      await pool.query(`INSERT INTO customers(name,email,phone) VALUES($1,$2,$3)`, [name,email,phone]);
    }

    // Insert 10 dummy bookings with QR codes
    for (let i = 1; i <= 10; i++) {
      const customer_id = Math.ceil(Math.random() * 5);
      const service_id = Math.ceil(Math.random() * 7);
      const date_time = new Date(Date.now() + i*86400000); // spread next 10 days
      const number_plate = `AB${i}CDE`.toUpperCase();
      const location = `Address ${i}`;
      const res = await pool.query(
        `INSERT INTO bookings(customer_id, service_id, date_time, number_plate, location) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [customer_id, service_id, date_time, number_plate, location]
      );
      const booking_id = res.rows[0].id;
      const qr_code = await QRCode.toDataURL(`booking:${booking_id}`);
      await pool.query(`UPDATE bookings SET qr_code=$1 WHERE id=$2`, [qr_code, booking_id]);
    }

    console.log("✅ Database initialized with dummy data!");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }
}

// --- API Routes ---

// Services list
app.get('/api/services', async (req,res)=>{
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY id');
    res.json(result.rows);
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

// DB status
app.get('/api/db-check', async (req,res)=>{
  try {
    await pool.query('SELECT 1');
    res.json({ connected: true });
  } catch(err){
    res.json({ connected: false, error: err.message });
  }
});

// Book a service
app.post('/api/book', async (req,res)=>{
  try {
    const { name,email,phone,number_plate,service_id,date_time,location } = req.body;
    if(!name||!email||!phone||!number_plate||!service_id||!date_time||!location){
      return res.status(400).json({ error:'Missing fields' });
    }

    const customerRes = await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id',[name,email,phone]);
    const customer_id = customerRes.rows[0].id;

    // format number plate
    const formattedPlate = number_plate.toUpperCase().replace(/\s+/g,'');

    const bookingRes = await pool.query(
      `INSERT INTO bookings(customer_id,service_id,date_time,number_plate,location) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [customer_id,service_id,date_time,formattedPlate,location]
    );

    const booking_id = bookingRes.rows[0].id;
    const qr_code = await QRCode.toDataURL(`booking:${booking_id}`);
    await pool.query(`UPDATE bookings SET qr_code=$1 WHERE id=$2`, [qr_code, booking_id]);

    res.json({ success:true, booking_id, qr_code });
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async ()=>{
  await initDb();
  console.log(`🚀 Server running on port ${PORT}`);
});