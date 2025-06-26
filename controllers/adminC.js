const docSchema = require("../schemas/docModel");
const userSchema = require("../schemas/userModel");
const appointmentSchema = require("../schemas/appointmentModel");

const getAllUsersControllers = async (req, res) => {
  // Basic role check
  if (!req.user || req.user.type !== 'admin') {
    return res.status(403).send({ message: "Unauthorized access", success: false });
  }
  try {
    // Exclude sensitive fields like password
    const users = await userSchema.find({}, { password: 0, notification: 0, seennotification: 0 });
    return res.status(200).send({
      message: "Users data list",
      success: true,
      data: users,
    });
  } catch (error) {
    console.error(error); // Use console.error
    return res.status(500).send({ message: "Error fetching users", success: false }); // More specific error message
  }
};

const getAllDoctorsControllers = async (req, res) => {
   // Basic role check
   if (!req.user || req.user.type !== 'admin') {
     return res.status(403).send({ message: "Unauthorized access", success: false });
   }
  try {
    // Exclude sensitive fields
    const docUsers = await docSchema.find({}, { userId: 0, __v: 0 }); // Exclude userId and version key

    return res.status(200).send({
      message: "Doctor users data list", // Corrected message
      success: true,
      data: docUsers,
    });
  } catch (error) {
    // Fix: Corrected console.log chain
    console.error(error);
    return res.status(500).send({ message: "Error fetching doctors", success: false }); // More specific error message
  }
};

const getStatusApproveController = async (req, res) => {
   // Basic role check
   if (!req.user || req.user.type !== 'admin') {
     return res.status(403).send({ message: "Unauthorized access", success: false });
   }
  try {
    const { doctorId, status } = req.body;
    // Validate status input
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).send({ message: "Invalid status provided", success: false });
    }

    // Find and update the doctor status
    const doctor = await docSchema.findOneAndUpdate(
      { _id: doctorId },
      { status },
      { new: true } // Return the updated document
    );

    if (!doctor) {
        return res.status(404).send({ message: "Doctor not found", success: false });
    }

    // Fetch the user linked to the doctor account (DO NOT TRUST req.body.userid)
    const user = await userSchema.findOne({ _id: doctor.userId });

    if (!user) {
         // This is an anomaly, doctor exists but linked user doesn't
         console.error(`Linked user not found for doctor ID: ${doctorId}`);
         // Continue, but maybe alert admin
    } else {
        // Prepare notification message based on status
        const notificationMessage = status === "approved"
          ? `Your Doctor account has been approved`
          : `Your Doctor account has been rejected`;

        user.notification.push({
          type: "doctor-account-status", // More descriptive type
          message: notificationMessage,
          onClickPath: "/notification", // Or '/doctor/profile'
        });

        // Update user's isdoctor status only if approved
        if (status === "approved") {
            user.isdoctor = true;
        } else if (status === "rejected") {
             user.isdoctor = false; // Set to false if rejected
        }

        await user.save();
    }

    // Doctor save is implicitly handled by findOneAndUpdate with { new: true } if you need to save later changes.
    // However, we updated the status already, so no explicit doctor.save() is needed *after* findOneAndUpdate.

    return res.status(200).send({ // Changed to 200 OK for successful update
      message: `Successfully updated doctor status to ${status}`,
      success: true,
      data: doctor, // Send updated doctor data
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error updating doctor status", success: false });
  }
};

const getStatusRejectController = async (req, res) => {
  // This controller is redundant as getStatusApproveController can handle both approve and reject.
  // However, keeping it for minimal code change, but it should call the same logic.
  // For now, let's just call the approve controller with status='rejected'.
   // Basic role check
   if (!req.user || req.user.type !== 'admin') {
     return res.status(403).send({ message: "Unauthorized access", success: false });
   }
    // Delegate to the combined status update logic
   req.body.status = 'rejected'; // Ensure status is set to rejected
   return getStatusApproveController(req, res); // Reuse the logic

  /*
  // Original logic (leaving commented as combined logic is better)
  try {
    const { doctorId, status, userid } = req.body; // Still trusting userid from body here

    // Find and update the doctor status
    const doctor = await docSchema.findOneAndUpdate(
      { _id: doctorId },
      { status },
      { new: true }
    );

    if (!doctor) {
        return res.status(404).send({ message: "Doctor not found", success: false });
    }

    // Fetch the user linked to the doctor account (DO NOT TRUST req.body.userid)
    const user = await userSchema.findOne({ _id: doctor.userId });

    if (user) {
        const notificationMessage = `Your Doctor account has been rejected`;
        user.notification.push({
          type: "doctor-account-status",
          message: notificationMessage,
          onClickPath: "/notification",
        });
        user.isdoctor = false; // Ensure isdoctor is false if rejected
        await user.save();
    }

    return res.status(200).send({ // Changed to 200 OK
      message: "Successfully updated Rejected status of the doctor!",
      success: true,
      data: doctor,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error updating doctor status", success: false });
  }
  */
};


const displayAllAppointmentController = async (req, res) => {
  // Basic role check
   if (!req.user || req.user.type !== 'admin') {
     return res.status(403).send({ message: "Unauthorized access", success: false });
   }
  try {
    // Populate user and doctor info to get names etc.
    const allAppointments = await appointmentSchema
      .find({})
      .populate('userId', 'fullName') // Populate userId and select only fullName
      .populate('doctorId', 'fullName'); // Populate doctorId and select only fullName

    // Map to add doctorName and userName directly for easier frontend consumption
    const appointmentsWithNames = allAppointments.map(appointment => ({
        ...appointment.toObject(), // Convert mongoose document to plain object
        userName: appointment.userId ? appointment.userId.fullName : 'Unknown User',
        doctorName: appointment.doctorId ? appointment.doctorId.fullName : 'Unknown Doctor',
    }));

    return res.status(200).send({
      success: true,
      message: "Successfully fetched All Appointments",
      data: appointmentsWithNames,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Error fetching appointments", success: false });
  }
};

module.exports = {
  getAllDoctorsControllers,
  getAllUsersControllers,
  getStatusApproveController,
  getStatusRejectController, // Keeping this for now but it's redundant
  displayAllAppointmentController,
};