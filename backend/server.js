const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // serve frontend if needed

// PostgreSQL client with SSL for Render
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize DB and create tables
async function initDB() {
  await client.connect();
  console.log('Connected to PostgreSQL with SSL');

  await client.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      phone VARCHAR(20) UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS mechanics (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      phone VARCHAR(20) UNIQUE,
      email VARCHAR(100) UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50),
      description TEXT,
      base_price NUMERIC(10,2)
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      customer_id INT REFERENCES customers(id),
      mechanic_id INT REFERENCES mechanics(id),
      vehicle_plate VARCHAR(10),
      service_id INT REFERENCES services(id),
      booking_datetime TIMESTAMP,
      status VARCHAR(20) DEFAULT 'pending',
      address TEXT,
      lat NUMERIC(10,6),
      lng NUMERIC(10,6),
      total_cost NUMERIC(10,2),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS job_parts (
      id SERIAL PRIMARY KEY,
      booking_id INT REFERENCES bookings(id),
      part_name VARCHAR(100),
      part_cost NUMERIC(10,2) DEFAULT 0,
      quantity INT DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS loyalty (
      id SERIAL PRIMARY KEY,
      customer_id INT REFERENCES customers(id),
      service_count INT DEFAULT 0,
      next_free_service BOOLEAN DEFAULT FALSE
    );
  `);

  // Insert dummy data if empty
  const res = await client.query('SELECT COUNT(*) FROM customers');
  if (parseInt(res.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO customers (name,email,phone) VALUES 
      ('Alice Smith','alice@example.com','+447400000001'),
      ('Bob Johnson','bob@example.com','+447400000002'),
      ('Charlie Lee','charlie@example.com','+447400000003');

      INSERT INTO mechanics (name,phone,email) VALUES 
      ('Dave Mechanic','+447401111111','dave@sosmechanics.co.uk'),
      ('Eva Fixit','+447401111112','eva@sosmechanics.co.uk');

      INSERT INTO services (name,description,base_price) VALUES
      ('Oil Service','Full engine oil change',75.00),
      ('Brake Service','Brake pads and discs check/change',120.00),
      ('Tyre Service','Tyre rotation and balancing',50.00),
      ('Diagnostic','Full vehicle diagnostic check',65.00),
      ('Battery Replacement','Replace old battery',85.00),
      ('AC Service','Air conditioning inspection & refill',70.00),
      ('Full Service','Complete vehicle service including fluids',180.00);
    `);
    console.log('Inserted dummy data');
  }
}

initDB().catch(console.error);

// ----------------- API ENDPOINTS -----------------

// Root
app.get('/', (req,res)=>res.send('Mobile Mechanic Backend Ready'));

// Customer booking
app.post('/book', async (req,res)=>{
  try {
    const {name,email,phone,vehicle_plate,lat,lng,address,service_id} = req.body;

    // Add customer if not exists
    let cust = await client.query('SELECT * FROM customers WHERE email=$1', [email]);
    let customer_id;
    if(cust.rows.length===0){
      const result = await client.query(
        'INSERT INTO customers (name,email,phone) VALUES ($1,$2,$3) RETURNING id',
        [name,email,phone]
      );
      customer_id = result.rows[0].id;
    } else {
      customer_id = cust.rows[0].id;
    }

    const result = await client.query(
      'INSERT INTO bookings (customer_id,vehicle_plate,lat,lng,address,service_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [customer_id,vehicle_plate.toUpperCase().replace(/\s+/,' '),lat,lng,address,service_id]
    );

    res.json({booking_id: result.rows[0].id});
  } catch(e){
    console.error(e);
    res.status(500).json({error:e.message});
  }
});

// Mechanic start job
app.post('/mechanic/start-job', async (req,res)=>{
  try {
    const {booking_id, mechanic_id} = req.body;
    await client.query('UPDATE bookings SET mechanic_id=$1, status=$2 WHERE id=$3',
      [mechanic_id,'in-progress',booking_id]);
    res.json({success:true});
  } catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// Mechanic complete job
app.post('/mechanic/complete-job', async (req,res)=>{
  try {
    const {booking_id, parts=[], labor=0} = req.body;
    let totalParts = parts.reduce((sum,p)=>sum + p.part_cost*p.quantity,0) + labor;

    await client.query('UPDATE bookings SET status=$1, total_cost=$2 WHERE id=$3',
      ['completed',totalParts,booking_id]);

    for(const p of parts){
      await client.query('INSERT INTO job_parts (booking_id, part_name, part_cost, quantity) VALUES ($1,$2,$3,$4)',
        [booking_id,p.part_name,p.part_cost,p.quantity]);
    }

    res.json({success:true});
  } catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// Loyalty check
app.get('/loyalty/:customer_id', async (req,res)=>{
  try {
    const {customer_id} = req.params;
    const r = await client.query('SELECT * FROM loyalty WHERE customer_id=$1', [customer_id]);
    res.json(r.rows[0]||{service_count:0,next_free_service:false});
  } catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// Get all bookings
app.get('/bookings', async (req,res)=>{
  try {
    const r = await client.query(`
      SELECT b.*, c.name as customer_name, s.name as service_name
      FROM bookings b
      JOIN customers c ON c.id=b.customer_id
      JOIN services s ON s.id=b.service_id
    `);
    res.json(r.rows);
  } catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server running on port', PORT));