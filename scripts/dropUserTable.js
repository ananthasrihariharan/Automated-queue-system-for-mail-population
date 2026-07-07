const { Client } = require('pg');
require('dotenv').config({ path: '../.env' }); // load DATABASE_URL from root .env

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:ash@localhost:5432/despatch";

async function main() {
  console.log(`Connecting to Postgres: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('Dropping User table and _prisma_migrations table to clear dev schema...');
    await client.query('DROP TABLE IF EXISTS "User" CASCADE;');
    await client.query('DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;');
    console.log('User and migration tables dropped successfully.');
  } catch (err) {
    console.error('Error dropping tables:', err);
  } finally {
    await client.end();
  }
}

main();
