const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// Removed path and fs imports as they are not used in this controller
// const path = require("path");
// const fs = require("fs");

const userSchema = require("../schemas/userModel");
const docSchema = require("../schemas/docModel");
const appointmentSchema = require("../schemas/appointmentModel");
const mongoose = require('mongoose'); // Import mongoose for ObjectId validation

// Helper function to hash passwords
const hashPassword = async (password) => {
    // Use the same salt rounds as in your other hashing operations (e.g., 10)
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};


/// for registering the user (Allows first admin registration, then only users)
const registerController = async (req, res) => {
  try {
    // Explicitly get fields including type from request body
    const { fullName, email, password, phone, type } = req.body;

    // Basic validation for required fields on the received body
    if (!fullName || !email || !password || !phone || !type) {
         return res.status(400).send({ message: "Please fill in all required fields (Name, Email, Password, Phone, Type)", success: false }); // Ensure type is also checked here
    }
    // Validate type input against allowed values
    if (!['user', 'admin'].includes(type)) {
        return res.status(400).send({ message: "Invalid user type selected", success: false });
    }

    // Prevent setting isdoctor explicitly during registration via this route (security)
    if (req.body.isdoctor !== undefined) {
         return res.status(400).send({ message: "Cannot set doctor status during registration", success: false });
     }

    // Check if a user with the same email already exists
    // Use .lean() for better performance when just checking existence
    const existsUser = await userSchema.findOne({ email }).lean();
    if (existsUser) {
      return res
        .status(409) // Use 409 Conflict for resource already exists
        .send({ message: "User already exists with this email", success: false });
    }

    // --- LOGIC TO ALLOW ONLY THE FIRST ADMIN REGISTRATION ---
    let userTypeToCreate = 'user'; // Default type to create is 'user'

    if (type === 'admin') {
        // If the requested type is 'admin', check if ANY admin user already exists in the DB
        const existingAdmin = await userSchema.findOne({ type: 'admin' }).lean(); // Use lean() for speed
        if (existingAdmin) {
            // An admin user already exists, so we MUST reject this attempt to register as admin.
            return res.status(409).send({ // Use 409 Conflict to indicate the 'admin' resource is already taken
                message: "An administrator account already exists. You cannot register as admin via this form.",
                success: false
            });
        } else {
            // No admin user exists yet. This person is the first! Allow them to be admin.
            userTypeToCreate = 'admin';
            // You might want to log this event specifically: console.log(`First admin account being created: ${email}`);
        }
    }
    // If the requested type was 'user', userTypeToCreate remains 'user' (the default).

    // Hash the password for ANY new user (admin or regular)
    const hashedPassword = await hashPassword(password);

    // Create the new user document using the determined type
    const newUser = new userSchema({
        fullName,
        email,
        password: hashedPassword, // Use the hashed password
        phone,
        type: userTypeToCreate, // Use the type determined by the logic above
        isdoctor: false, // Always false initially for all new registrations
        notification: [], // Initialize empty arrays
        seennotification: [],
    });

    // Save the new user document to the database
    await newUser.save();

    // Respond with a success message
    return res.status(201).send({ // Use 201 Created for successful resource creation
      message: userTypeToCreate === 'admin' ? "Initial admin account created successfully. Please login." : "Registration successful. Please login.", // Tailor message
      success: true,
      // Optionally, send back some non-sensitive user data (e.g., id, type)
      // data: { _id: newUser._id, type: newUser.type }
    });

  } catch (error) {
    console.error("Error while registering user:", error); // Use console.error for errors
    // Handle Mongoose validation errors (e.g., if phone format validation was added)
     if (error.name === 'ValidationError') {
        // Extract specific error messages from Mongoose validation result
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).send({ success: false, message: messages.join(', ') });
     }
     // Handle Mongoose duplicate key errors (specifically for email if unique constraint is hit)
     if (error.code === 11000) {
         // Check error.keyPattern to see which field caused the duplicate error if multiple unique fields exist
         return res.status(409).send({ success: false, message: "Email already in use." });
     }
    // Catch any other unexpected errors during the registration process
    res.status(500).send({
      success: false,
      message: "Error during registration",
      error: error.message, // Include error message for debugging (consider removing in production)
    });
  }
};


////for the login
const loginController = async (req, res) => {
  try {
    const { email, password } = req.body; // Destructure email and password from body

    // Basic validation
     if (!email || !password) {
         return res.status(400).send({ message: "Please provide email and password", success: false });
     }

    // Find user by email, explicitly select the password field because it's 'select: false' by default
    const user = await userSchema.findOne({ email }).select('+password').lean(); // Use lean()

    if (!user) {
      // Use 401 Unauthorized or 404 Not Found for login failures (401 is common)
      return res
        .status(401)
        .send({ message: "Invalid email or password", success: false }); // Generic message for security
    }

    // Compare the provided password with the hashed password from the database
    // Safely handle potential missing passwords (shouldn't happen with required schema field, but defensive)
    if (!password || !user.password) {
         console.error("Login attempt failed: Password data missing for user:", user.email);
         return res.status(500).send({ message: "Login error: Password configuration issue", success: false });
    }
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      // Use 401 Unauthorized for failed password comparison
      return res
        .status(401)
        .send({ message: "Invalid email or password", success: false }); // Generic message
    }

    // Password matched, create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_KEY, {
      expiresIn: "1d", // Token expires in 1 day
    });

    // Remove the password hash from the user object *before* sending it to the frontend
    // Cloning using .toObject() is not needed if using .lean()
    delete user.password;

    // Send success response with token and user data
    return res.status(200).send({
      message: "Login successful", // Corrected message
      success: true,
      token,
      userData: user, // Send the user object (without password)
    });
  } catch (error) {
    console.error("Error in loginController:", error); // Use console.error
    return res // Use res
      .status(500) // Use 500 for server errors
      .send({ success: false, message: "Error during login" /*, error: error.message // Avoid sending raw error message in production */ });
  }
};


////auth controller (Used by authMiddleware to verify token and fetch user)
const authController = async (req, res) => {
  // This route is protected by authMiddleware.
  // If authMiddleware succeeded, it attached the user object (excluding password) to req.user.
  // The userId is available as req.user._id. We no longer use req.body.userId here.

  // authMiddleware already validated the token and fetched the user.
  // The user object is already attached to req.user (and password excluded due to select('-password')).
  // We just need to return the user data that authMiddleware provided.

  if (!req.user) {
       // This check should ideally not be hit if authMiddleware runs before this controller,
       // as authMiddleware sends a 401/500 itself on failure.
       // But keeping it as a safeguard.
       console.error("Auth controller reached without req.user");
       return res.status(401).send({ message: "Authentication failed middleware error", success: false });
  }
  try {
    // The user is already fetched and attached by the authMiddleware (.lean() object)
    const user = req.user;

    // Return the user data
    return res.status(200).send({
        success: true,
        data: user, // Send the user object from req.user (already lean and password-excluded)
    });
  } catch (error) {
    console.error("Unexpected error in authController:", error); // Use console.error
    // Note: authMiddleware might already handle the error response for token issues
    // This catch block is for errors *after* middleware but before response
    return res
      .status(500) // Use 500 for server errors
      .send({ message: "Auth error fetching user data", success: false /*, error: error.message // Avoid sending raw error message in production */ });
  }
};

/////for the doctor registration application by a user
const docController = async (req, res) => {
  // Role check: Ensure authenticated user is a standard user (not already a doctor or admin)
   if (!req.user || req.user.type !== 'user' || req.user.isdoctor) {
       return res.status(403).send({ message: "Unauthorized: Only standard users who are not already doctors can apply as doctor.", success: false });
   }

  try {
    // Get specific allowed doctor profile fields from req.body.doctor
    // Do NOT trust req.body.userId or req.body.status from the request body
    const doctorProfileData = req.body.doctor;
    if (!doctorProfileData) {
        return res.status(400).send({ message: "Doctor profile data is required in the request body.", success: false });
    }

    // Define allowed fields to prevent unexpected data injection
    const allowedDoctorFields = ['fullName', 'email', 'phone', 'address', 'specialization', 'experience', 'fees', 'timings'];
     const newDoctorData = {}; // Start with an empty object

     // Manually copy allowed fields from the request body
     for (const field of allowedDoctorFields) {
         if (doctorProfileData[field] !== undefined) { // Only include if the field is present in the incoming data
             newDoctorData[field] = doctorProfileData[field];
         }
     }

     // Add the authenticated user's ID and default status (NOT from req.body)
     newDoctorData.userId = req.user._id; // Use authenticated user's ID
     newDoctorData.status = "pending"; // Always set status to pending initially

     // Basic validation for required doctor fields before Mongoose validation
      // Check for existence and non-empty strings where appropriate
     if (!newDoctorData.fullName || !newDoctorData.email || !newDoctorData.phone || !newDoctorData.address ||
         !newDoctorData.specialization || !newDoctorData.experience || newDoctorData.fees === undefined || !newDoctorData.timings) {
           // Check fees specifically as it's a number; timings should be checked for non-empty/valid format if possible
           // Basic check for timings array having 2 elements if TimePicker sends array
           if (Array.isArray(newDoctorData.timings) && newDoctorData.timings.length !== 2) {
                return res.status(400).send({ message: "Please provide valid start and end timings.", success: false });
           }
           // Fallback generic message if other required fields are missing
           return res.status(400).send({ message: "Please fill in all required doctor details.", success: false });
     }

     // Optional: Add more specific validation for email format, phone number format, experience (number), fees (number)
     // Mongoose schema validation will also catch many of these if schema types/validators are set correctly.

     // Check if a doctor profile already exists for this user ID (to prevent duplicate applications)
     const existingDoctor = await docSchema.findOne({ userId: req.user._id }).lean(); // Use lean()
     if (existingDoctor) {
         // Use 409 Conflict if the resource (doctor profile for this user) already exists
         return res.status(409).send({ message: "You have already applied for a doctor account.", success: false });
     }

     // Check if a doctor profile already exists with this email (as per schema unique constraint)
      const existingDoctorEmail = await docSchema.findOne({ email: newDoctorData.email }).lean(); // Use lean()
     if (existingDoctorEmail) {
         // Use 409 Conflict
         return res.status(409).send({ message: "A doctor profile with this email already exists.", success: false });
     }


    // Create a new doctor document using the validated data
    const newDoctor = new docSchema(newDoctorData);

    // Save the new doctor application
    await newDoctor.save();

    // Find an admin user to notify (don't fetch their password)
    const adminUser = await userSchema.findOne({ type: "admin" }).select('-password').lean(); // Use lean()

    if (!adminUser) {
      // This is a warning, not necessarily a critical error for the user's application
      console.warn("Admin user not found. Doctor application notification cannot be sent.");
      // The user's application is still successful, but admin won't get notified automatically
    } else {
        // Prepare the notification object
        const notificationObj = {
          type: "apply-doctor-request", // Descriptive notification type
          message: `${newDoctor.fullName} has applied for a doctor account.`, // Include doctor's name
          data: {
            // It's better to include the new doctor's _id for admin to approve/reject
            doctorId: newDoctor._id,
            // Could include other details needed by admin view without clicking
            // fullName: newDoctor.fullName,
            // specialization: newDoctor.specialization
          },
          onClickPath: "/adminhome/doctors", // Path the admin should click to review applications
          // Optionally add a timestamp here if not relying on Mongoose schema timestamps
          // timestamp: new Date()
        };

        // Add the notification to the admin user's notifications array using $push
        // $push is safer for concurrency than fetching, modifying array, and saving document
        await userSchema.findByIdAndUpdate(adminUser._id, {
           $push: { notification: notificationObj }
        });
    }

    // Send success response
    return res.status(201).send({ // 201 Created
      success: true,
      message: "Doctor registration application submitted successfully. Waiting for admin approval.", // Informative message for user
    });

  } catch (error) {
    console.error("Error while applying for doctor:", error); // Use console.error
    // Handle specific errors during the process
     // Handle Mongoose validation errors
     if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).send({ success: false, message: messages.join(', ') });
     }
      // Handle Mongoose duplicate key error (specifically for email unique constraint)
     if (error.code === 11000) {
         return res.status(409).send({ success: false, message: "A doctor profile with this email or user ID already exists." });
     }
    // Catch any other unexpected errors
    res.status(500).send({
      success: false,
      message: "Error while submitting doctor application",
      error: error.message, // Include error message for debugging (consider removing in production)
    });
  }
};


////for marking notifications as read
const getallnotificationController = async (req, res) => {
  // This route is protected by authMiddleware.
  // The authenticated user object (excluding password) is available at req.user.
  // We should use req.user._id, NOT req.body.userId.

  if (!req.user) {
      // Should not happen if authMiddleware is used correctly, but defensive check
      return res.status(401).send({ message: "Authentication required", success: false });
  }

  try {
    const userId = req.user._id; // Get the user ID from the authenticated user

    // Find the user document to modify it (findById is appropriate here)
    const userDoc = await userSchema.findById(userId);

    if (!userDoc) {
        // User not found (shouldn't happen if authMiddleware works), potentially deleted
        return res.status(404).send({ message: "User not found", success: false });
    }

    // Move all current notifications to seennotification
    if (userDoc.notification && userDoc.notification.length > 0) {
       userDoc.seennotification = [...userDoc.seennotification, ...userDoc.notification];
       userDoc.notification = []; // Clear the unread notifications array
    } else {
        // No unread notifications to mark, still a success but inform the user
         return res.status(200).send({ success: true, message: "No unread notifications to mark as read." });
    }


    // Save the updated user document
    const updatedUser = await userDoc.save();

    // Return the updated user data (without password)
    // Use .toObject() on the saved Mongoose document, then delete password
    const userDataResponse = updatedUser.toObject();
    // password is already excluded by schema.select: false, so no need to delete if fetching correctly

    return res.status(200).send({
      success: true,
      message: "All unread notifications marked as read successfully", // More specific message
      data: userDataResponse, // Send updated user data including notifications
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error); // Use console.error
    // Handle Mongoose CastError if userId format was wrong (unlikely with req.user._id)
     if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid User ID format", success: false });
     }
    return res // Use res
      .status(500) // Use 500 for server errors
      .send({ message: "Error marking notifications as read", success: false /*, error: error.message // Avoid sending raw error message in production */ });
  }
};


////for deleting all seen notifications
const deleteallnotificationController = async (req, res) => {
  // This route is protected by authMiddleware.
  // The authenticated user object (excluding password) is available at req.user.
  // We should use req.user._id, NOT req.body.userId.

  if (!req.user) {
       // Should not happen if authMiddleware is used correctly
       return res.status(401).send({ message: "Authentication required", success: false });
   }

  try {
    const userId = req.user._id; // Get the user ID from the authenticated user

    // Find the user document to modify it
     const userDoc = await userSchema.findById(userId);

    if (!userDoc) {
        // User not found (shouldn't happen), potentially deleted
        return res.status(404).send({ message: "User not found", success: false });
    }

    // Clear both notification arrays for the user
    userDoc.notification = [];
    userDoc.seennotification = [];

    // Save the updated user document
    const updatedUser = await userDoc.save();

    // Return the updated user data (without password)
    const userDataResponse = updatedUser.toObject();
    // password is already excluded by schema.select: false

    return res.status(200).send({
      success: true,
      message: "All notifications deleted successfully", // More specific message
      data: userDataResponse, // Send updated user data
    });
  } catch (error) {
    console.error("Error deleting notifications:", error); // Use console.error
     // Handle Mongoose CastError if userId format was wrong (unlikely with req.user._id)
     if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid User ID format", success: false });
     }
    res // Use res
      .status(500) // Use 500 for server errors
      .send({ message: "Error deleting notifications", success: false /*, error: error.message // Avoid sending raw error message in production */ });
  }
};

////displaying all approved doctors in user profile (for standard users)
const getAllDoctorsControllers = async (req, res) => {
   // Role check: Ensure authenticated user is a standard user
   // Adjust this check if doctors/admins should also browse this list
   if (!req.user || req.user.type !== 'user') {
       return res.status(403).send({ message: "Unauthorized access: Only standard users can view this list.", success: false });
   }
  try {
    // Fetch only approved doctors and exclude sensitive/unnecessary fields
    const docUsers = await docSchema.find({ status: "approved" }, { userId: 0, __v: 0 }).lean(); // Use lean()
    return res.status(200).send({
      message: "Approved doctor list fetched successfully",
      success: true,
      data: docUsers,
    });
  } catch (error) {
    console.error('Error in getAllDoctorsControllers (User Side):', error); // Use console.error
    return res // Use res
      .status(500) // Use 500
      .send({ message: "Error fetching approved doctors", success: false /*, error: error.message // Avoid raw error */ });
  }
};

////getting appointments done by a user
const appointmentController = async (req, res) => {
   // This route is protected by authMiddleware.
   // The authenticated user object is available at req.user.
   // Multer middleware runs *before* this controller, so req.file exists if a file was uploaded.

   if (!req.user) {
       // Should not happen if authMiddleware is used
       return res.status(401).send({ message: "Authentication required", success: false });
   }
   // Optional: Prevent booking if already a doctor or admin, adjust if they can book
   if (req.user.type !== 'user') {
        return res.status(403).send({ message: "Unauthorized: Only standard users can book appointments.", success: false });
   }


  try {
    // Get required fields from the request body
    // Do NOT trust userInfo, doctorInfo, userId, or status from req.body/formData
    const { doctorId, date } = req.body; // Get doctorId and date from body

    // Use the authenticated user's ID
    const userId = req.user._id;

    // Basic validation for required fields
    if (!doctorId || !date) {
         // Check if date is non-empty string/valid format if possible
         return res.status(400).send({ message: "Doctor and appointment date/time are required.", success: false });
    }
    // Validate doctorId format
     if (!mongoose.Types.ObjectId.isValid(doctorId)) {
         return res.status(400).send({ message: "Invalid Doctor ID format.", success: false });
     }
     // Basic date format validation (optional, can be more robust)
     if (isNaN(new Date(date).getTime())) {
          return res.status(400).send({ message: "Invalid date format.", success: false });
     }


    // Fetch the CURRENT doctor info from DB based on doctorId
    const doctor = await docSchema.findById(doctorId).lean(); // Use lean()
    if (!doctor) {
         return res.status(404).send({ message: "Doctor not found.", success: false });
    }
     // Ensure the doctor is approved before booking
     if (doctor.status !== 'approved') {
         return res.status(400).send({ message: "Cannot book appointment with a non-approved doctor.", success: false });
     }


    // Handle document data from req.file (added by Multer middleware)
    let documentData = null;
    if (req.file) {
      // Store filename and relative path safely
      documentData = {
        filename: req.file.filename, // Multer filename should be safe (timestamp + original name)
        path: `/uploads/${req.file.filename}`, // Store relative path accessible via static serve
      };
    } else {
       // Optional: Make document upload mandatory for booking
       // return res.status(400).send({ message: "Medical document upload is required.", success: false });
    }


    // Create new appointment document
    const newAppointment = new appointmentSchema({
      userId: userId, // Use authenticated user's ID from authMiddleware
      doctorId: doctor._id, // Use found doctor's ID from DB
      // REMOVED userInfo and doctorInfo embedded objects - use populate when needed
      date: date, // Use the date from the body
      document: documentData, // Include document data if uploaded
      status: "pending", // Always start as pending
    });

    // Save the new appointment
    await newAppointment.save();

    // Notify the doctor who received the appointment request
    // Find the user account linked to the doctor profile (DO NOT TRUST doctorInfo.userId from body)
    const doctorUser = await userSchema.findById(doctor.userId).select('-password').lean(); // Use lean()

    if (!doctorUser) {
      // This is a warning: the doctor profile exists, but its linked user account doesn't
      console.warn(`User not found for doctor ID: ${doctor._id}. Cannot send appointment notification.`);
      // The appointment booking is still successful from the patient's perspective
    } else {
      // Prepare the notification object for the doctor
      const notificationObj = {
        type: "new-appointment-request", // Descriptive notification type
        message: `You have a new appointment request from ${req.user.fullName}.`, // Use the booking user's name (from req.user)
        onClickPath: "/userhome/appointments", // Path the doctor should click to view appointments
        // Optionally add timestamp
        // timestamp: new Date()
      };

      // Add the notification to the doctor user's notifications array using $push
       await userSchema.findByIdAndUpdate(doctorUser._id, {
           $push: { notification: notificationObj }
       });
    }

    // Send success response
    return res.status(200).send({
      message: "Appointment booked successfully. Waiting for doctor confirmation.", // Informative message for user
      success: true,
    });
  } catch (error) {
    console.error("Error booking appointment:", error); // Use console.error
     // Handle specific errors during the process
     // Handle Multer errors specifically (e.g., file size limit)
     if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send({ message: 'File size limit exceeded (max 5MB).', success: false }); // Added max size info
     }
     // Handle Mongoose validation errors (if schema has more validations)
     if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).send({ success: false, message: messages.join(', ') });
     }
      // Handle Mongoose CastError for invalid ObjectId formats (e.g., doctorId)
     if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid ID format provided.", success: false });
     }
    // Catch any other unexpected errors
    res // Use res
      .status(500) // Use 500 for server errors
      .send({ message: "Error booking appointment", success: false /*, error: error.message // Avoid sending raw error message in production */ });
  }
};

// Route handler to get all appointments for the authenticated user
const getAllUserAppointments = async (req, res) => {
  // This route is protected by authMiddleware.
  // The authenticated user object is available at req.user.
  // We should use req.user._id, NOT req.body.userId.

  if (!req.user) {
       // Should not happen if authMiddleware is used
       return res.status(401).send({ message: "Authentication required", success: false });
   }
   // Optional: Only allow standard users to view their appointments this way
   if (req.user.type !== 'user') {
       // Doctors view their appointments via the doctor route, Admin via admin route
       return res.status(403).send({ message: "Unauthorized access: Only standard users can view their appointments here.", success: false });
   }


  try {
    const userId = req.user._id; // Get the user ID from the authenticated user

    // Find appointments specifically for this user ID
    // Populate the doctorId to get doctor details needed by the frontend (e.g., fullName)
    const allAppointments = await appointmentSchema
      .find({ userId: userId })
      // Populate doctorId and select only fullName (as used by the frontend)
      .populate('doctorId', 'fullName')
      .lean(); // Use lean() for performance

    // Map the appointments to include the doctor's name directly in the response object
    // This is needed because the frontend expects 'docName'
    const appointmentsWithDoctor = allAppointments.map((appointment) => ({
      ...appointment, // Spread the lean appointment object
      // Get doctor's name from the populated doctorId object
      docName: appointment.doctorId ? appointment.doctorId.fullName : 'Unknown Doctor',
      // Optional: Remove the populated doctorId object if frontend doesn't need other details
      // doctorId: undefined,
    }));


    return res.status(200).send({
      message: "Your appointments fetched successfully.",
      success: true,
      data: appointmentsWithDoctor,
    });
  } catch (error) {
    console.error("Error fetching user appointments:", error); // Use console.error
     // Handle Mongoose CastError if userId format was wrong (unlikely with req.user._id)
     if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid User ID format", success: false }); // Still a good check
     }
    res // Use res
      .status(500) // Use 500
      .send({ message: "Error fetching your appointments", success: false /*, error: error.message // Avoid raw error */ });
  }
};

// REMOVED getDocsController - This function was unused in the frontend and the 'documents' field was removed from user schema.

// Export all relevant controller functions
module.exports = {
  registerController, // <-- This is the updated controller
  loginController,
  authController,
  docController,
  getallnotificationController,
  deleteallnotificationController,
  getAllDoctorsControllers, // User-side get approved doctors
  appointmentController,
  getAllUserAppointments,
  // getDocsController is removed
};