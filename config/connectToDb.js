const mongoose = require('mongoose');

const connectToDB = () => {
  mongoose
    .connect(process.env.MONGO_DB, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    })
    .then(() => {
      console.log('Connected to MongoDB');
    })
    .catch((err) => {
      // Log the error and exit the process for critical connection failure
      console.error('Could not connect to MongoDB:', err);
      process.exit(1); // Exit process with failure code
    });
};

module.exports = connectToDB;