const multer = require("multer");
const express = require("express");

const {
  registerController,
  loginController,
  authController,
  docController,
  deleteallnotificationController,
  getallnotificationController,
  getAllDoctorsControllers,
  appointmentController,
  getAllUserAppointments,
  // REMOVED getDocsController from import
  // REMOVED downloadDocController from import
} = require("../controllers/userC");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// Configure Multer storage for appointment documents
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure the directory exists
     cb(null, "./uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now();
     const safeOriginalname = file.originalname.replace(/[\\/]/g, '_'); // Basic sanitization
    cb(null, uniqueSuffix + "-" + safeOriginalname);
  },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 } // Example limit: 5MB
});


// Public routes (no authMiddleware)
router.post("/register", registerController);
router.post("/login", loginController);

// Authenticated routes (use authMiddleware)
// authController doesn't require a specific role, just authentication
router.post("/getuserdata", authMiddleware, authController);

// docController requires auth but also checks if the user is already a doctor/admin
router.post("/registerdoc", authMiddleware, docController);

// getAllDoctorsControllers requires auth but also checks if the user is a standard user
router.get("/getalldoctorsu", authMiddleware, getAllDoctorsControllers);

// appointmentController uses multer for file upload, then authMiddleware
// Multer middleware should come *before* authMiddleware if it needs access to req.body *before* userId is added
// However, since authMiddleware adds userId to req.body, and appointmentController USES req.userId,
// the order upload -> authMiddleware -> controller is correct if userId is needed in the controller *after* upload.
// If userId is needed for Multer options (like dynamic destination), the order might need adjustment or a different Multer setup.
// Sticking to upload.single("image") -> authMiddleware -> appointmentController
// Note: The field name is 'image' in router, but 'document' in controller and schema.
// Let's fix this inconsistency - router should use the same field name.
router.post("/getappointment", upload.single("document"), authMiddleware, appointmentController); // FIX: Changed 'image' to 'document'


router.post(
  "/getallnotification",
  authMiddleware,
  getallnotificationController
);

router.post(
  "/deleteallnotification",
  authMiddleware,
  deleteallnotificationController
);

router.get("/getuserappointments", authMiddleware, getAllUserAppointments);

// REMOVED the route for getDocsController as the controller is removed
// router.get("/getDocsforuser", authMiddleware, getDocsController)


module.exports = router;