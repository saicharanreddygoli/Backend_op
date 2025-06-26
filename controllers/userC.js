const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// Removed path and fs as getDocsController is removed
// const path = require("path");
// const fs = require("fs");

const userSchema = require("../schemas/userModel");
const docSchema = require("../schemas/docModel");
const appointmentSchema = require("../schemas/appointmentModel");
const mongoose = require('mongoose'); // Import mongoose for ObjectId validation

/// for registering the user
const registerController = async (req, res) => {
  try {
    const { fullName, email, password, phone, type } = req.body; // Explicitly get fields

    // Basic validation
    if (!fullName || !email || !password || !phone || !type) {
         return res.status(400).send({ message: "Please fill in all required fields", success: false });
    }

    // Prevent registration as admin or setting isdoctor via this route
    if (type === 'admin' /* || type === 'doctor' -- type doctor is not in schema enum */) {
         return res.status(400).send({ message: "Invalid user type specified during registration", success: false });
    }
     // Prevent setting isdoctor explicitly during registration
     if (req.body.isdoctor !== undefined) {
         return res.status(400).send({ message: "Cannot set doctor status during registration", success: false });
     }


    const existsUser = await userSchema.findOne({ email }); // Use destructured email
    if (existsUser) {
      return res
        .status(409) // Use 409 Conflict for resource already exists
        .send({ message: "User already exists with this email", success: false });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new userSchema({
        fullName,
        email,
        password: hashedPassword,
        phone,
        type: 'user', // Force type to 'user' for this registration route
        // notification, seennotification, isdoctor will use defaults
    });
    await newUser.save();

    return res.status(201).send({ message: "Registration Success", success: true });
  } catch (error) {
    console.error(error);
    // Handle Mongoose validation errors
     if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).send({ success: false, message: messages.join(', ') });
     }
     if (error.code === 11000) { // Duplicate key error (e.g. duplicate email)
         return res.status(409).send({ success: false, message: "Email already in use." });
     }
    return res // Use res
      .status(500)
      .send({ success: false, message: `Registration error: ${error.message}` }); // More specific error
  }
};


////for the login
const loginController = async (req, res) => {
  try {
    const { email, password } = req.body; // Explicitly get fields

    // Basic validation
    if (!email || !password) {
         return res.status(400).send({ message: "Please provide email and password", success: false });
    }

    // Find user, explicitly select the password field
    const user = await userSchema.findOne({ email }).select('+password'); // Use destructured email, select password

    if (!user) {
      return res
        .status(404) // Use 404 Not Found for user not found
        .send({ message: "User not found", success: false });
    }

    // Add safeguard for undefined password from request or user.password from DB
    if (!password || !user.password) {
         console.error("Password missing during login attempt"); // Log suspicious activity
         return res.status(401).send({ message: "Invalid email or password", success: false });
    }

    const isMatch = await bcrypt.compare(password, user.password); // Use destructured password
    if (!isMatch) {
      return res
        .status(401) // Use 401 Unauthorized for bad credentials
        .send({ message: "Invalid email or password", success: false });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_KEY, {
      expiresIn: "1d",
    });
    // Clone user object before removing password to avoid modifying original mongoose document unexpectedly
    const userDataResponse = user.toObject();
    delete userDataResponse.password; // Remove password from the object sent to frontend

    return res.status(200).send({
      message: "Login successful", // Corrected message
      success: true,
      token,
      userData: userDataResponse, // Send cloned object
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .send({ success: false, message: `Login error: ${error.message}` }); // More specific error
  }
};


////auth controller
const authController = async (req, res) => {
  // This route is protected by authMiddleware, req.user should be available
  // req.user is already the lean user object from middleware, password excluded
  if (!req.user) {
       // This indicates an issue with the middleware or token
       return res.status(401).send({ message: "Authentication failed", success: false });
  }
  try {
    // The user is already fetched and attached by the authMiddleware (and password excluded)
    const user = req.user;
    // No need to clone and delete password again if middleware uses select('-password') and lean()

    return res.status(200).send({
        success: true,
        data: user, // Send the user object directly from req.user
    });
  } catch (error) {
    console.error(error);
    // Note: authMiddleware might already handle the error response for token issues
    // This catch block is for errors during the user fetching process itself (if not handled by middleware)
    return res
      .status(500)
      .send({ message: "Auth error fetching user data", success: false, error: error.message }); // More specific error
  }
};

/////for the doctor registration of user
const docController = async (req, res) => {
  // Role check: Ensure authenticated user is a standard user (not already a doctor or admin)
   if (!req.user || req.user.type !== 'user' || req.user.isdoctor) {
       return res.status(403).send({ message: "Unauthorized: Only standard users can apply as doctor.", success: false });
   }

  try {
    // Get specific allowed doctor profile fields from req.body.doctor
    const doctorProfileData = req.body.doctor;
    if (!doctorProfileData) {
        return res.status(400).send({ message: "Doctor profile data is required", success: false });
    }

    const allowedDoctorFields = ['fullName', 'email', 'phone', 'address', 'specialization', 'experience', 'fees', 'timings'];
     const newDoctorData = { userId: req.user._id, status: "pending" }; // Use authenticated user's ID

     // Manually copy allowed fields, validate presence of required ones
     for (const field of allowedDoctorFields) {
         if (doctorProfileData[field] !== undefined) {
             newDoctorData[field] = doctorProfileData[field];
         }
     }

     // Basic validation for required doctor fields
     if (!newDoctorData.fullName || !newDoctorData.email || !newDoctorData.phone || !newDoctorData.address ||
         !newDoctorData.specialization || !newDoctorData.experience || newDoctorData.fees === undefined || !newDoctorData.timings) { // Check fees specifically as it's a number
           return res.status(400).send({ message: "Please fill in all required doctor details", success: false });
     }

     // Check if a doctor profile already exists for this user
     const existingDoctor = await docSchema.findOne({ userId: req.user._id });
     if (existingDoctor) {
         return res.status(409).send({ message: "You have already applied for a doctor account.", success: false });
     }


    const newDoctor = new docSchema(newDoctorData);
    await newDoctor.save();

    const adminUser = await userSchema.findOne({ type: "admin" }); // Don't select password

    if (!adminUser) {
      console.warn("Admin user not found. Doctor application notification cannot be sent.");
      // Decide if this is a critical error or just a missed notification
      // For now, we allow the doctor application but log the issue
    } else {
        // Ensure adminUser.notification is initialized
        adminUser.notification = adminUser.notification || [];
        adminUser.notification.push({
          type: "apply-doctor-request",
          message: `${newDoctor.fullName} has applied for doctor registration`,
          data: {
            // It's better to send the doctor's _id here, not the user's
            doctorId: newDoctor._id, // Send doctor ID
            fullName: newDoctor.fullName,
            onClickPath: "/admin/doctors",
          },
          // Mark as unread
          read: false // You might add a read status field to notification objects
        });
        // Use findByIdAndUpdate to avoid potential race conditions if multiple updates happen
        await userSchema.findByIdAndUpdate(adminUser._id, { $push: { notification: adminUser.notification[adminUser.notification.length - 1] } }); // Push only the new notification

    }

    return res.status(201).send({
      success: true,
      message: "Doctor Registration request sent successfully. Waiting for admin approval.", // More informative message
    });
  } catch (error) {
    console.error("Error while applying for doctor:", error);
    // Check for specific Mongoose validation errors
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).send({ success: false, message: messages.join(', ') });
    }
     if (error.code === 11000) { // Duplicate key error
         return res.status(409).send({ success: false, message: "A doctor profile already exists for this user or email." });
     }
    res.status(500).send({
      success: false,
      message: "Error while applying for doctor",
      error: error.message,
    });
  }
};


////for the notification
const getallnotificationController = async (req, res) => {
   // Route is protected by authMiddleware
   if (!req.user) {
       return res.status(401).send({ message: "Authentication required", success: false });
   }
  try {
    // User is already fetched by authMiddleware (as a lean object)
    const user = req.user;

    // To modify and save, we might need to fetch the full Mongoose document
    const userDoc = await userSchema.findById(user._id);
    if (!userDoc) {
        return res.status(404).send({ message: "User not found", success: false });
    }

    // Move all unread notifications to seen
    userDoc.seennotification.push(...userDoc.notification);
    userDoc.notification = []; // Clear unread notifications

    const updatedUser = await userDoc.save();
    // Clone user object before removing password (already excluded by middleware lean())
    const userDataResponse = updatedUser.toObject();
    // delete userDataResponse.password; // Password already excluded

    return res.status(200).send({
      success: true,
      message: "All unread notifications marked as read", // More specific message
      data: userDataResponse,
    });
  } catch (error) {
    console.error(error);
    return res // Use res
      .status(500)
      .send({ message: "Error marking notifications as read", success: false, error: error.message }); // More specific error
  }
};


////for deleting the notification
const deleteallnotificationController = async (req, res) => {
   // Route is protected by authMiddleware
   if (!req.user) {
       return res.status(401).send({ message: "Authentication required", success: false });
   }
  try {
    // User is already fetched by authMiddleware (as a lean object)
    const user = req.user;

     // To modify and save, we might need to fetch the full Mongoose document
    const userDoc = await userSchema.findById(user._id);
    if (!userDoc) {
        return res.status(404).send({ message: "User not found", success: false });
    }

    // Clear both notification arrays
    userDoc.notification = [];
    userDoc.seennotification = [];

    const updatedUser = await userDoc.save();
    // Clone user object before removing password (already excluded by middleware lean())
    const userDataResponse = updatedUser.toObject();
    // delete userDataResponse.password; // Password already excluded

    return res.status(200).send({
      success: true,
      message: "All seen notifications deleted", // More specific message
      data: userDataResponse,
    });
  } catch (error) {
    console.error(error);
    res // Use res
      .status(500)
      .send({ message: "Error deleting notifications", success: false, error: error.message }); // More specific error
  }
};

////displaying all approved doctors in user profile
const getAllDoctorsControllers = async (req, res) => {
   // Role check: Ensure authenticated user is a standard user
   if (!req.user || req.user.type !== 'user') { // Assuming only standard users browse doctors
       // If admin/doctor can also browse, adjust this check
       // If any authenticated user can browse, remove this check but keep authMiddleware
       // For now, let's assume only standard users browse approved doctors
       return res.status(403).send({ message: "Unauthorized access", success: false });
   }
  try {
    // Fetch only approved doctors and exclude sensitive/unnecessary fields
    // Consider excluding email/phone unless needed by the frontend list view
    const docUsers = await docSchema.find({ status: "approved" }, { userId: 0, __v: 0 }); // Exclude userId and version key
    return res.status(200).send({
      message: "Approved doctor list",
      success: true,
      data: docUsers,
    });
  } catch (error) {
    console.error(error); // Corrected console.log chain
    return res // Use res
      .status(500)
      .send({ message: "Error fetching approved doctors", success: false, error: error.message }); // More specific error
  }
};

////getting appointments done in user
const appointmentController = async (req, res) => {
   // Route is protected by authMiddleware
   if (!req.user) {
       return res.status(401).send({ message: "Authentication required", success: false });
   }
   // Optional: Prevent booking if already a doctor or admin, adjust if doctors/admins can book
   if (req.user.type !== 'user') {
        return res.status(403).send({ message: "Unauthorized: Only standard users can book appointments.", success: false });
   }

  try {
    // Use req.user._id from authMiddleware, NOT req.body.userId
    const userId = req.user._id;
    const { doctorId, date } = req.body; // Get doctorId and date from body
    // Do NOT trust userInfo or doctorInfo from req.body/formData

    // Basic validation
    if (!doctorId || !date) {
         return res.status(400).send({ message: "Doctor and date/time are required", success: false });
    }
    // Validate doctorId format
     if (!mongoose.Types.ObjectId.isValid(doctorId)) {
         return res.status(400).send({ message: "Invalid Doctor ID format", success: false });
     }
     // Basic date format validation (optional, can be more robust)
     if (isNaN(new Date(date).getTime())) {
          return res.status(400).send({ message: "Invalid date format", success: false });
     }


    // Fetch CURRENT user info from DB based on authenticated ID (req.user is lean, maybe fetch full document if needed)
    // const currentUser = await userSchema.findById(userId); // Already have req.user which is sufficient for ID

    // Fetch CURRENT doctor info from DB based on doctorId
    const doctor = await docSchema.findById(doctorId);
    if (!doctor) {
         return res.status(404).send({ message: "Doctor not found", success: false });
    }
     // Ensure the doctor is approved before booking
     if (doctor.status !== 'approved') {
         return res.status(400).send({ message: "Cannot book appointment with a non-approved doctor", success: false });
     }


    // Handle document data from req.file if it exists
    let documentData = null;
    if (req.file) {
      // Ensure path is stored relative to uploads dir and filename is safe
      documentData = {
        filename: req.file.filename, // Multer filename should be safe now
        path: `/uploads/${req.file.filename}`, // Store relative path
      };
    }

    // Create new appointment document
    const newAppointment = new appointmentSchema({
      userId: userId, // Use authenticated user's ID
      doctorId: doctor._id, // Use found doctor's ID
      // REMOVED userInfo and doctorInfo objects
      date: date, // Use the date from the body
      document: documentData,
      status: "pending", // Always start as pending
    });

    await newAppointment.save();

    // Notify the doctor (find doctor's linked user)
    const doctorUser = await userSchema.findOne({ _id: doctor.userId }); // Don't select password

    if (!doctorUser) {
      console.warn(`User not found for doctor ID: ${doctor._id}. Cannot send appointment notification.`);
    } else {
      // Ensure doctorUser.notification is initialized
      doctorUser.notification = doctorUser.notification || [];
      doctorUser.notification.push({
        type: "new-appointment-request", // More descriptive type
        message: `New Appointment request from ${req.user.fullName}`, // Use authenticated user's name
        onClickPath: "/doctor/appointments", // Path for the doctor
         // Mark as unread
        read: false // You might add a read status field to notification objects
      });
      // Use findByIdAndUpdate to avoid potential race conditions
      await userSchema.findByIdAndUpdate(doctorUser._id, { $push: { notification: doctorUser.notification[doctorUser.notification.length - 1] } }); // Push only the new notification
    }

    return res.status(200).send({
      message: "Appointment booked successfully. Waiting for doctor confirmation.", // More informative message
      success: true,
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
     // Handle Multer errors specifically
     if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send({ message: 'File size limit exceeded (max 5MB).', success: false }); // Added max size info
     }
     // Handle Mongoose validation errors
     if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).send({ success: false, message: messages.join(', ') });
     }
      // Handle Mongoose CastError for invalid ObjectId in query parameters etc.
     if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid ID format provided", success: false });
     }
    res
      .status(500)
      .send({ message: "Error booking appointment", success: false, error: error.message }); // More specific error
  }
};

const getAllUserAppointments = async (req, res) => {
   // Route is protected by authMiddleware
   if (!req.user) {
       return res.status(401).send({ message: "Authentication required", success: false });
   }
   // Optional: Only allow standard users to view their appointments this way
   if (req.user.type !== 'user') {
       // Doctors can view their appointments via the doctor route
       return res.status(403).send({ message: "Unauthorized access", success: false });
   }

  try {
    const userId = req.user._id; // Use authenticated user's ID

    // Find appointments for this user and populate doctor info
    const allAppointments = await appointmentSchema
      .find({ userId: userId })
      // Populate doctorId and select only fullName, email, phone, etc. if needed by user appointment list
      // For now, just fullName is sufficient based on frontend usage
      .populate('doctorId', 'fullName'); // Populate doctorId and select only fullName

    // Map to add doctorName for easier frontend consumption
    const appointmentsWithDoctor = allAppointments.map((appointment) => ({
      ...appointment.toObject(), // Convert mongoose document to plain object
      doctorName: appointment.doctorId ? appointment.doctorId.fullName : 'Unknown Doctor',
      // Add other doctor details if populated: doctorEmail: appointment.doctorId?.email etc.
    }));


    return res.status(200).send({
      message: "All your appointments are listed below.",
      success: true,
      data: appointmentsWithDoctor,
    });
  } catch (error) {
    console.error(error);
     // Handle Mongoose CastError for invalid ObjectId
     if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid User ID format", success: false }); // Should not happen with req.user._id but good practice
     }
    res
      .status(500)
      .send({ message: "Error fetching user appointments", success: false, error: error.message }); // More specific error
  }
};

// REMOVED getDocsController - It's unused and the schema field 'documents' is removed.


module.exports = {
  registerController,
  loginController,
  authController,
  docController,
  getallnotificationController,
  deleteallnotificationController,
  getAllDoctorsControllers,
  appointmentController,
  getAllUserAppointments,
};