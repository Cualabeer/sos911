const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize database
async function initDb() {
  try {
    // Services table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        base_price NUMERIC(10,2) NOT NULL
      );
    `);

    // Add 5 services if table is empty
    const servicesCount = await pool.query('SELECT COUNT(*) FROM services');
    if (parseInt(servicesCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO services (name, base_price) VALUES
        ('Oil Change', 45.00),
        ('Brake Check', 60.00),
        ('Battery Replacement', 80.00),
        ('Tyre Replacement', 100.00),
        ('Full Service', 150.00);
      `);
    }

    // Bookings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        vehicle_plate VARCHAR(20) NOT NULL,
        service_id INT REFERENCES services(id),
        address TEXT NOT NULL,
        lat NUMERIC(10,6),
        lng NUMERIC(10,6),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Dummy bookings per service
    const bookingsCount = await pool.query('SELECT COUNT(*) FROM bookings');
    if (parseInt(bookingsCount.rows[0].count) === 0) {
      const dummyBookings = [
        ['John Doe','john@example.com','07123456789','AB12 CDE',1,'10 Downing St, London',51.503,-0.127],
        ['Jane Smith','jane@example.com','07234567890','CD34 EFG',2,'221B Baker St, London',51.523,-0.158],
        ['Mike Johnson','mike@example.com','07345678901','EF56 HIJ',3,'1 Oxford St, London',51.515,-0.141],
        ['Sara Lee','sara@example.com','07456789012','GH78 KLM',4,'Tower Bridge, London',51.505,-0.075],
        ['Tom Brown','tom@example.com','07567890123','IJ90 NOP',5,'London Eye, London',51.503,-0.119]
      ];
      for (const b of dummyBookings) {
        await pool.query(
          `INSERT INTO bookings (name,email,phone,vehicle_plate,service_id,address,lat,lng)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          b
        );
      }
    }

    console.log('Database initialized');
  } catch(err) {
    console.error('DB Init Error:', err);
  }
}

// Routes

// Get all services
app.get('/services', async (req,res)=>{
  try {
    const result = await pool.query('SELECT id, name, base_price FROM services ORDER BY id ASC');
    res.json(result.rows);
  } catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to load services'});
  }
});

// Book a service
app.post('/book', async (req,res)=>{
  const { name,email,phone,vehicle_plate,service_id,address,lat,lng } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO bookings (name,email,phone,vehicle_plate,service_id,address,lat,lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [name,email,phone,vehicle_plate,service_id,address,lat,lng]
    );
    res.json({booking_id: result.rows[0].id});
  } catch(err){
    console.error(err);
    res.status(500).json({error:'Booking failed'});
  }
});

// Serve frontend
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'frontend','index.html'));
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, async ()=>{
  await initDb();
  console.log(`Server running on port ${PORT}`);
});