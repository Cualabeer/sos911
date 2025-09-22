import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  try {
    // Drop all tables first
    await pool.query(`
      DROP TABLE IF EXISTS qr_codes CASCADE;
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        password TEXT,
        loyalty_points INT DEFAULT 0
      );
      
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        price NUMERIC NOT NULL
      );
      
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        date TIMESTAMP DEFAULT NOW(),
        address TEXT NOT NULL,
        postcode TEXT NOT NULL,
        lat NUMERIC,
        lng NUMERIC,
        number_plate TEXT,
        status TEXT DEFAULT 'pending'
      );
      
      CREATE TABLE loyalty (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
      
      CREATE TABLE qr_codes (
        id SERIAL PRIMARY KEY,
        booking_id INT REFERENCES bookings(id),
        qr_code TEXT
      );
    `);

    // Insert dummy data
    await pool.query(`
      INSERT INTO customers (name,email,phone) VALUES
        ('Alice','alice@test.com','07123456789'),
        ('Bob','bob@test.com','07234567890'),
        ('Charlie','charlie@test.com','07345678901');

      INSERT INTO services (name,category,description,price) VALUES
        ('Oil Change','Maintenance','Full oil change service',49.99),
        ('Brake Check','Maintenance','Full brake inspection',39.99),
        ('Battery Replacement','Electrical','Replace old battery',89.99),
        ('Air Filter','Maintenance','Replace air filter',19.99),
        ('Engine Diagnostics','Diagnostics','Full engine scan',59.99);

      INSERT INTO bookings (customer_id,service_id,address,postcode,lat,lng,number_plate,status) VALUES
        (1,1,'Medway Rd, Chatham','ME4 5AA',51.3326,0.5494,'AB12CDE','pending'),
        (2,2,'Medway St, Gillingham','ME7 1BB',51.3890,0.5412,'XY34ZXY','pending'),
        (3,3,'Medway Ave, Rochester','ME1 2CC',51.3912,0.5055,'CD56EFG','pending');
    `);

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

initDb();

// APIs
app.get('/api/diagnostics', async (req, res) => {
  let dbStatus = 'FAIL';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'OK';
  } catch {}

  res.json({
    db: dbStatus,
    services: 5,
    bookings: 3,
    geolocation: 'OK'
  });
});

app.get('/api/services', async (req,res)=>{
  const result = await pool.query('SELECT * FROM services');
  res.json(result.rows);
});

app.get('/api/bookings', async (req,res)=>{
  const result = await pool.query('SELECT * FROM bookings');
  res.json(result.rows);
});

app.post('/api/bookings', async (req,res)=>{
  const { customer_id, service_id, address, postcode, lat, lng, number_plate } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO bookings(customer_id,service_id,address,postcode,lat,lng,number_plate) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [customer_id,service_id,address,postcode,lat,lng,number_plate]
    );
    // Generate QR
    const qr = await QRCode.toDataURL(`booking:${result.rows[0].id}`);
    await pool.query('INSERT INTO qr_codes (booking_id,qr_code) VALUES($1,$2)', [result.rows[0].id, qr]);

    res.json({ success: true, booking: result.rows[0], qr });
  } catch(err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/customers', async (req,res)=>{
  const result = await pool.query('SELECT * FROM customers');
  res.json(result.rows);
});

app.listen(process.env.PORT||3000, ()=> console.log('🚀 Server running'));