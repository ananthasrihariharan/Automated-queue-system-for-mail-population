const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        console.log("Attempting to connect to MongoDB at:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        })
        console.log("Mongoose connect call returned");
        console.log("MongoDB connected successfully")
    } catch (error) {
        console.error("MONGO DB connection error:", error.message);
        // Do not exit process immediately so we can see the error in some environments,
        // but typically we should exit. For debugging, let's log loudly.
        process.exit(1);
    }
}

module.exports = connectDB;
