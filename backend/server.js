import express from 'express';
import pg from 'pg';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Drop tables if they exist
async function dropTables() {
  await pool.query(`
    DROP TABLE IF EXISTS loyalty;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS services;
  `);
  console.log('✅ All tables dropped');
}

// Create tables
async function createTables() {
  await pool.query(`
    CREATE TABLE customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL
    );

    CREATE TABLE services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC NOT NULL
    );

    CREATE TABLE bookings (
      id SERIAL PRIMARY KEY,
      customer_id INT REFERENCES customers(id),
      service_id INT REFERENCES services(id),
      number_plate TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      qr_code TEXT
    );

    CREATE TABLE loyalty (
      id SERIAL PRIMARY KEY,
      customer_id INT REFERENCES customers(id),
      services_completed INT DEFAULT 0
    );
  `);
  console.log('✅ Tables created');
}

// Insert dummy data
async function seedData() {
  const services = ['Oil Change', 'Brakes', 'Inspection', 'Tyres', 'Battery', 'Aircon', 'Diagnostics'];
  for (const name of services) {
    await pool.query('INSERT INTO services(name, price) VALUES($1, $2)', [name, Math.floor(Math.random()*150)+50]);
  }

  const customers = [
    {name:'Alice', email:'alice@test.com', phone:'07123456789'},
    {name:'Bob', email:'bob@test.com', phone:'07234567890'},
    {name:'Charlie', email:'charlie@test.com', phone:'07345678901'}
  ];

  for (const c of customers) {
    const res = await pool.query('INSERT INTO customers(name,email,phone) VALUES($1,$2,$3) RETURNING id', [c.name,c.email,c.phone]);
    const customerId = res.rows[0].id;

    // Add bookings
    for(let i=0;i<2;i++){
      const serviceId = Math.floor(Math.random()*services.length)+1;
      const number_plate = `AB12 C${Math.floor(Math.random()*900+100)}`;
      const location = 'Some address, City';
      const qr_code = await QRCode.toDataURL(`${customerId}-${serviceId}-${Date.now()}`);
      await pool.query(
        'INSERT INTO bookings(customer_id,service_id,number_plate,location,qr_code) VALUES($1,$2,$3,$4,$5)',
        [customerId, serviceId, number_plate, location, qr_code]
      );
    }

    // Add loyalty
    await pool.query('INSERT INTO loyalty(customer_id,services_completed) VALUES($1,$2)', [customerId, Math.floor(Math.random()*5)]);
  }

  console.log('✅ Dummy data inserted');
}

async function init() {
  try {
    await dropTables();
    await createTables();
    await seedData();
    console.log('✅ Database initialized and seeded!');
  } catch (err) {
    console.error('❌ DB init error:', err);
  }
}

// Routes to test connection
app.get('/db-status', async (req,res)=>{
  try {
    await pool.query('SELECT 1');
    res.json({connected:true});
  } catch {
    res.json({connected:false});
  }
});

init();

app.listen(3000, ()=>console.log('🚀 Server running on port 3000'));