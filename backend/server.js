const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // optional to serve frontend via backend

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function initDB() {
  await client.connect();
  console.log('Connected to PostgreSQL');

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

  console.log('Tables ready');
}

initDB();

app.listen(process.env.PORT || 3000, () => console.log('Server running'));