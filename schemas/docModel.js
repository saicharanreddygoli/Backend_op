const mongoose = require("mongoose");

const docModel = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user', // Corrected ref to 'user'
      required: true, // userId should probably be required
      unique: true // Ensure one doctor profile per user
    },
    fullName: {
      type: String,
      required: [true, "full Name is required"],
      set: function (value) {
        return value ? value.charAt(0).toUpperCase() + value.slice(1) : value; // Handle null/undefined input
      },
    },
    email: {
      type: String,
      required: [true, "email is required"],
       unique: true, // Email should be unique across doctors
       lowercase: true, // Store email in lowercase for consistency
       trim: true // Trim whitespace
    },
    phone: {
      type: String,
      required: [true, "phone is required"],
      trim: true // Trim whitespace
    },
    address: {
      type: String,
      required: [true, "address required"], // Corrected 'require'
      trim: true
    },
    specialization: {
      type: String,
      required: [true, "specialization is required"],
      trim: true
    },
    experience: {
      type: String, // Consider Number type if you store years
      required: [true, "experience is required"],
      trim: true
    },
    fees: {
      type: Number, // Changed to Number as fees are usually numeric
      required: [true, "fees is required"],
       min: [0, "Fees cannot be negative"]
    },
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'approved', 'rejected'], // Added enum for status
      required: true // Status should always be present
    },
    timings: {
      type: Object, // Storing as Object is flexible, but consider a more structured array of objects if needed
      required: [true, "work time required"],
    },
    // Consider adding createdAt/updatedAt timestamps implicitly via schema options
  },
  {
    timestamps: true, // Already present, good
  }
);

const docSchema = mongoose.model("doctor", docModel);

module.exports = docSchema;