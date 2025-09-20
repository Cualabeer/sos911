const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const services = [
  { name: 'Oil Change', price: 45, group_id: 1 },
  { name: 'Brake Pad Replacement', price: 120, group_id: 1 },
  { name: 'Battery Check', price: 25, group_id: 1 },
  { name: 'Wheel Alignment', price: 70, group_id: 2 },
  { name: 'Air Filter Replacement', price: 30, group_id: 2 },
  { name: 'Spark Plug Replacement', price: 50, group_id: 2 },
  { name: 'Coolant Flush', price: 60, group_id: 2 },
  { name: 'Timing Belt', price: 200, group_id: 3 },
  { name: 'Transmission Fluid', price: 90, group_id: 3 },
  { name: 'Suspension Check', price: 75, group_id: 3 },
  { name: 'Exhaust Repair', price: 100, group_id: 3 },
  { name: 'Tyre Replacement', price: 80, group_id: 3 },
  { name: 'AC Service', price: 60, group_id: 3 },
  { name: 'Diagnostics', price: 40, group_id: 3 },
];

(async () => {
  try {
    for (let s of services) {
      await pool.query(
        'INSERT INTO services (name, price, group_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [s.name, s.price, s.group_id]
      );
    }
    console.log('Services seeded');
    process.exit();
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
})();