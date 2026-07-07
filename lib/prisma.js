const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:ash@localhost:5432/despatch";

const pool = new Pool({
  connectionString,
  max: parseInt(process.env.PG_POOL_MAX || '20'),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Kills any query that runs longer than 15s — prevents runaway full-table scans
  statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT || '15000'),
});

pool.on('error', (err) => {
  console.error('[PG Pool] Unexpected client error:', err.message);
});

const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

const prisma = basePrisma.$extends({
  model: {
    job: {
      async findActive(args = {}) {
        args.where = { ...args.where, isDeleted: false };
        return basePrisma.job.findMany(args);
      },
      async findFirstActive(args = {}) {
        args.where = { ...args.where, isDeleted: false };
        return basePrisma.job.findFirst(args);
      }
    },
    parcel: {
      async findActive(args = {}) {
        args.where = { ...args.where, isDeleted: false };
        return basePrisma.parcel.findMany(args);
      }
    }
  }
});

module.exports = prisma;


