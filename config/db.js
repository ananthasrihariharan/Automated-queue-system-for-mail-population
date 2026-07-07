// MongoDB removed — Prisma connects lazily on first query.
// This no-op keeps the connectDB().then(...) pattern in microservices intact.
const connectDB = async () => {};

module.exports = connectDB;
