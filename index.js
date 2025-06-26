const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectToDB = require("./config/connectToDB");
// Removed unused logger and morgan imports if they existed

const app = express();

//////dotenv config/////////////////////
dotenv.config();
connectToDB(); // Connect to DB on startup
const PORT = process.env.PORT || 5000; // Use a default port


/////////////////middlewares////////////////
app.use(express.json());
app.use(cors());

// Serve static files from the 'uploads' directory
// This is needed for the frontend to access uploaded documents via their path
app.use('/uploads', express.static('uploads'));


// Global error handler (keep it last, before starting server)
app.use((err, req, res, next) => {
  console.error("Global error handler:", err); // Log the full error

  // Check for specific types of errors if needed
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ message: 'Invalid JSON payload', success: false });
  }

  // Default error response
  res.status(err.status || 500).json({
      message: err.message || "Something went wrong",
      success: false
      // In development, you might include error details: error: err.stack
  });
});


/////////routes//////////////////////
// Routes should be mounted BEFORE the global error handler
app.use('/api/user', require('./routes/userRoutes'))
app.use('/api/admin', require('./routes/adminRoutes'))
app.use('/api/doctor',require('./routes/doctorRoutes'))



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});