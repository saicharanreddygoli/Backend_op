const mongoose = require("mongoose");

const appointmentModel = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user", // Corrected ref to 'user' to match userModel
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "doctor",
      required: true,
    },
    // REMOVED userInfo and doctorInfo objects - fetch/populate these when needed
    /*
    userInfo: {
      type: Object,
      default: {},
      required: true, // This was marked required but default was empty, inconsistent
    },
    doctorInfo: {
      type: Object,
      default: {},
      required: true, // Inconsistent
    },
    */
    date: {
      type: String, // Store as string as before, although Date type might be better
      required: true,
    },
    document: {
      type: Object, // Still storing filename and path as an object
      filename: String, // Add specific fields for clarity
      path: String, // Add specific fields for clarity
    },
    status: {
      type: String,
      required: true, // Changed from require to required
      default: "pending",
      enum: ['pending', 'approved', 'rejected'] // Added enum for status
    },
  },
  {
    timestamps: true,
  }
);

const appointmentSchema = mongoose.model("appointment", appointmentModel);

module.exports = appointmentSchema;