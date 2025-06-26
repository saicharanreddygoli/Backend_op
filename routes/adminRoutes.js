const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  getAllUsersControllers,
  getAllDoctorsControllers,
  getStatusApproveController,
  getStatusRejectController, // Keeping for now as controller is still there
  displayAllAppointmentController,
} = require("../controllers/adminC");

const router = express.Router();

// All admin routes must use authMiddleware and will have role checks within the controller
router.get("/getallusers", authMiddleware, getAllUsersControllers);

router.get("/getalldoctors", authMiddleware, getAllDoctorsControllers);

router.post("/getapprove", authMiddleware, getStatusApproveController);

// Using the same controller as getapprove now, just passes status='rejected'
router.post("/getreject", authMiddleware, getStatusRejectController);

router.get('/getallAppointmentsAdmin', authMiddleware, displayAllAppointmentController)

module.exports = router;