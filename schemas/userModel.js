const mongoose = require("mongoose");

const userModel = mongoose.Schema({
  fullName: {
    type: String,
    required: [true, "Name is required"],
    set: function (value) {
      return value ? value.charAt(0).toUpperCase() + value.slice(1) : value; // Handle null/undefined input
    },
    trim: true
  },
  email: {
    type: String,
    required: [true, "email is required"],
    unique: true, // Email must be unique
    lowercase: true, // Store in lowercase
    trim: true
  },
  password: {
    type: String,
    required: [true, "password is required"],
    select: false // Don't return password by default in queries
  },
  phone: {
    type: String,
    required: [true, "phone is required"],
    trim: true
  },
  type: {
    type: String,
    required: [true, "type is required"],
    enum: ['user', 'admin'], // Restrict types to 'user' or 'admin'
    default: 'user' // Default type is user
  },
  notification: {
    type: Array, // Keep as Array for now, consider separate collection if too large
    default: [],
  },
  seennotification: {
    type: Array, // Keep as Array for now
    default: [],
  },
  isdoctor: {
    type: Boolean,
    default: false,
  },
  // REMOVED documents field - it was unused
  // documents: {
  //   type: Array,
  //   default: []
  // }
},
{
  timestamps: true // Add createdAt and updatedAt timestamps
});

const userSchema = mongoose.model("user", userModel);

module.exports = userSchema;