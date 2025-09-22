import express from 'express';
import cors from 'cors';
import pg from 'pg';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  const client = await pool.connect();
  try {
    // Drop all tables first
    await client.query(`
      DROP TABLE IF EXISTS loyalty CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);

    // Create tables
    await client.query(`
      CREATE TABLE customers(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL
      );
      CREATE TABLE services(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT
      );
      CREATE TABLE bookings(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        service_id INT REFERENCES services(id),
        numberPlate TEXT NOT NULL,
        address TEXT NOT NULL,
        lat FLOAT,
        lng FLOAT,
        status TEXT DEFAULT 'pending'
      );
      CREATE TABLE loyalty(
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        points INT DEFAULT 0
      );
    `);

    // Insert dummy data
    await client.query(`
      INSERT INTO customers(name,email,phone) VALUES
        ('Alice Smith','alice@example.com','07123456789'),
        ('Bob Jones','bob@example.com','07234567890'),
        ('Charlie Brown','charlie@example.com','07345678901');

      INSERT INTO services(name,description) VALUES
        ('Oil Change','Full synthetic oil change'),
        ('Brake Check','Complete brake inspection'),
        ('Engine Tune','Engine performance tuning');

      INSERT INTO bookings(customer_id,service_id,numberPlate,address,lat,lng,status) VALUES
        (1,1,'AB12 CDE','1 Main Street, Medway',51.3327,0.5495,'pending'),
        (2,2,'XY34 ZFG','2 High Road, Medway',51.3300,0.5500,'pending'),
        (3,3,'LM56 NOP','3 Station Road, Medway',51.3310,0.5480,'pending');

      INSERT INTO loyalty(customer_id,points) VALUES
        (1,5),
        (2,10),
        (3,0);
    `);

    console.log('✅ Database initialized with dummy data');
  } catch (err) {
    console.error('❌ Database init error:', err);
  } finally {
    client.release();
  }
}

// Routes

app.get('/api/services', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM services');
  res.json(rows);
});

app.get('/api/bookings', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.id, c.name, c.email, c.phone, b.numberPlate, b.address, b.lat, b.lng, s.name as service_name, b.status
    FROM bookings b
    JOIN customers c ON b.customer_id=c.id
    JOIN services s ON b.service_id=s.id
    ORDER BY b.id DESC
  `);
  res.json(rows);
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { name, email, phone, numberPlate, address, lat, lng, serviceId } = req.body;
    if(!name || !email || !phone || !numberPlate || !address || !serviceId) {
      return res.json({ success:false, error:'Missing fields' });
    }

    // Check if customer exists
    let customer = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    let customerId;
    if(customer.rows.length===0){
      const insertCustomer = await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id',[name,email,phone]);
      customerId = insertCustomer.rows[0].id;
    } else {
      customerId = customer.rows[0].id;
    }

    const insertBooking = await pool.query(
      'INSERT INTO bookings(customer_id,service_id,numberPlate,address,lat,lng) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [customerId, serviceId, numberPlate, address, lat, lng]
    );

    res.json({ success:true, id: insertBooking.rows[0].id });
  } catch(err){
    console.error(err);
    res.json({ success:false, error: err.message });
  }
});

app.get('/api/db-status', async (req, res)=>{
  try {
    await pool.query('SELECT 1');
    res.json({ connected:true });
  } catch(err){
    res.json({ connected:false, error:err.message });
  }
});

app.get('/api/qr', async (req, res)=>{
  const { bookingId } = req.query;
  if(!bookingId) return res.status(400).send('Missing bookingId');
  try {
    const url = `Booking:${bookingId}`;
    const qr = await QRCode.toDataURL(url);
    const img = Buffer.from(qr.split(',')[1], 'base64');
    res.writeHead(200, {'Content-Type':'image/png'});
    res.end(img);
  } catch(err){
    res.status(500).send(err.message);
  }
});

// Start server
app.listen(3000, async ()=>{
  console.log('🚀 Server running on port 3000');
  await initDb();
});