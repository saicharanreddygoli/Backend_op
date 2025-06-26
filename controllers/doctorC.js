const docSchema = require("../schemas/docModel");
const appointmentSchema = require("../schemas/appointmentModel");
const userSchema = require("../schemas/userModel");
const fs = require("fs");
const path = require('path');

const updateDoctorProfileController = async (req, res) => {
  // Role check: Ensure authenticated user is a doctor
  if (!req.user || req.user.isdoctor !== true) {
      return res.status(403).send({ message: "Unauthorized access", success: false });
  }
  // Ensure the update is for *their* doctor profile
  const doctor = await docSchema.findOne({ userId: req.user._id });
  if (!doctor) {
       return res.status(404).send({ message: "Doctor profile not found for this user", success: false });
  }

  try {
    // IMPORTANT: ONLY ALLOW UPDATING SPECIFIC FIELDS
    const allowedUpdates = ['fullName', 'email', 'phone', 'address', 'specialization', 'experience', 'fees', 'timings'];
    const updates = {};
    for (const field of allowedUpdates) {
        if (req.body[field] !== undefined) { // Only apply if the field is present in the request
            updates[field] = req.body[field];
        }
    }

    // Prevent status change via this endpoint
    if (req.body.status !== undefined) {
         return res.status(400).send({ message: "Cannot update status via this endpoint", success: false });
    }
     // Prevent userId change
    if (req.body.userId !== undefined && req.body.userId !== req.user._id.toString()) {
         return res.status(400).send({ message: "Cannot change user ID", success: false });
    }


    const updatedDoctor = await docSchema.findOneAndUpdate(
      { userId: req.user._id }, // Use req.user._id from authenticated user
      updates, // Apply only allowed updates
      { new: true } // Return the updated document
    );

     if (!updatedDoctor) {
         // This case should be rare if the initial findOne succeeded, but good practice
          return res.status(500).send({ message: "Failed to update doctor profile", success: false });
     }

    // Optionally update the user's full name if doctor name changed (depends on requirements)
    // If user.fullName should reflect doctor.fullName
     if (updates.fullName && req.user.fullName !== updates.fullName) {
         req.user.fullName = updates.fullName;
         await req.user.save();
         // Update user data in localStorage on frontend after success
         // message or data response should contain updated user info
     }


    return res.status(200).send({
      success: true,
      data: updatedDoctor,
      message: "Successfully updated profile",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error updating doctor profile", success: false }); // More specific error
  }
};

const getAllDoctorAppointmentsController = async (req, res) => {
  // Role check: Ensure authenticated user is a doctor
   if (!req.user || req.user.isdoctor !== true) {
       return res.status(403).send({ message: "Unauthorized access", success: false });
   }
  try {
    // Find the doctor profile linked to the authenticated user
    const doctor = await docSchema.findOne({ userId: req.user._id });

    if (!doctor) {
        return res.status(404).send({ message: "Doctor profile not found for this user", success: false });
    }

    // Find appointments for this doctor and populate user info
    const allAppointments = await appointmentSchema
      .find({ doctorId: doctor._id })
      .populate('userId', 'fullName phone'); // Populate userId and select name/phone

     // Map to add userName and userPhone for easier frontend consumption
    const appointmentsWithUserInfo = allAppointments.map(appointment => ({
        ...appointment.toObject(), // Convert mongoose document to plain object
        userName: appointment.userId ? appointment.userId.fullName : 'Unknown User',
        userPhone: appointment.userId ? appointment.userId.phone : 'N/A',
    }));


    return res.status(200).send({
      message: "All the appointments are listed below.",
      success: true,
      data: appointmentsWithUserInfo,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error fetching doctor appointments", success: false }); // More specific error
  }
};

const handleStatusController = async (req, res) => {
  // Role check: Ensure authenticated user is a doctor
   if (!req.user || req.user.isdoctor !== true) {
       return res.status(403).send({ message: "Unauthorized access", success: false });
   }
  try {
    const { appointmentId, status } = req.body; // No longer expect userid here

    // Validate status input
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).send({ message: "Invalid status provided", success: false });
    }

    // Find the appointment
    const appointment = await appointmentSchema.findOne({ _id: appointmentId });

    if (!appointment) {
        return res.status(404).send({ message: "Appointment not found", success: false });
    }

    // Verify this appointment belongs to the authenticated doctor
    const doctor = await docSchema.findOne({ userId: req.user._id });
     if (!doctor || !appointment.doctorId.equals(doctor._id)) {
         return res.status(403).send({ message: "Unauthorized: This appointment does not belong to you.", success: false });
     }


    // Update the status
    appointment.status = status;
    await appointment.save();

    // Fetch the user who booked the appointment (DO NOT TRUST req.body.userid)
    const user = await userSchema.findOne({ _id: appointment.userId });

    if (user) {
        // Get user info for notification message (optional, depends on detail level)
        // const bookingUser = await userSchema.findOne({_id: appointment.userId}, 'fullName');
        // const userName = bookingUser ? bookingUser.fullName : 'A user';

        user.notification.push({
          type: "appointment-status-updated", // More descriptive type
          message: `Your appointment with Dr. ${doctor.fullName} has been ${status}`, // Include doctor name
          onClickPath: "/userhome/appointments", // Path for the user
        });

        await user.save();
    }


    return res.status(200).send({ // Changed to 200 OK
      success: true,
      message: `Appointment status updated to ${status}`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error updating appointment status", success: false }); // More specific error
  }
};

const documentDownloadController = async (req, res) => {
  // Role check: Ensure authenticated user is a doctor
   if (!req.user || req.user.isdoctor !== true) {
       return res.status(403).send({ message: "Unauthorized access", success: false });
   }

  const appointId = req.query.appointId;

  if (!appointId) {
      return res.status(400).send({ message: "Appointment ID is required", success: false });
  }

  try {
    const appointment = await appointmentSchema.findById(appointId);

    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found", success: false });
    }

    // Verify this appointment belongs to the authenticated doctor
    const doctor = await docSchema.findOne({ userId: req.user._id });
     if (!doctor || !appointment.doctorId.equals(doctor._id)) {
         return res.status(403).send({ message: "Unauthorized: You do not have access to this document.", success: false });
     }


    // Assuming that the document URL is stored in the "document" field with a 'path' property
    const documentPath = appointment.document?.path;

    if (!documentPath || typeof documentPath !== "string") {
      return res.status(404).send({ message: "Document not found for this appointment", success: false });
    }

    // *** SECURE PATH CONSTRUCTION ***
    // Ensure the stored path is relative and starts with '/uploads/'
    if (!documentPath.startsWith('/uploads/')) {
         console.error(`Invalid document path format: ${documentPath}`);
         return res.status(500).send({ message: "Invalid document path configured.", success: false });
    }
     // Extract the filename safely
     const filename = path.basename(documentPath);

     // Construct the absolute file path using a known, safe uploads directory
     const absoluteFilePath = path.join(__dirname, "..", "uploads", filename);


    // Check if the file exists before initiating the download
    fs.access(absoluteFilePath, fs.constants.F_OK, (err) => {
      if (err) {
         console.error(`File not found on disk: ${absoluteFilePath}`, err);
        return res.status(404).send({ message: "File not found on server", success: false });
      }

      // Set appropriate headers for the download response
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`); // Use extracted filename
      res.setHeader("Content-Type", "application/octet-stream"); // Generic type for download

      // Stream the file data to the response
      const fileStream = fs.createReadStream(absoluteFilePath);
      fileStream.on('error', (error) => {
        console.error('Error reading document stream:', error);
        return res.status(500).send({ message: "Error reading the document file", success: false });
      });

      // Pipe the fileStream to the response
      fileStream.pipe(res);

      // res.end() will be called automatically when the fileStream ends

    });
  } catch (error) {
    console.error(error);
    // Check if the error is a Mongoose CastError for invalid appointId
    if (error.name === 'CastError') {
         return res.status(400).send({ message: "Invalid Appointment ID format", success: false });
    }
    return res.status(500).send({ message: "Something went wrong during document download", success: false }); // More specific error
  }
};

module.exports = {
  updateDoctorProfileController,
  getAllDoctorAppointmentsController,
  handleStatusController,
  documentDownloadController,
};