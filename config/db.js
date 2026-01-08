const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        })
        console.log("MongoDB connected successfully")
    } catch (error) {
        console.error("MONGO DB connection error:", error.message);
        // Do not exit process immediately so we can see the error in some environments,
        // but typically we should exit. For debugging, let's log loudly.
        process.exit(1);
    }
}

module.exports = connectDB;
