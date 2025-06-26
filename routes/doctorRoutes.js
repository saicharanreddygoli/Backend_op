const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  updateDoctorProfileController,
  getAllDoctorAppointmentsController,
  handleStatusController,
  documentDownloadController,
} = require("../controllers/doctorC");

// Configure Multer storage - ensuring filename is unique and safe
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure the directory exists. Use mkdirp if necessary, but express handles static serving
    // Make sure the 'uploads' directory exists in your project root
    cb(null, "./uploads/");
  },
  filename: function (req, file, cb) {
    // Sanitize filename slightly or just rely on timestamp + originalname for uniqueness
    // More robust sanitization might be needed depending on allowed file types
    const uniqueSuffix = Date.now();
    // Basic sanitization: remove slashes to prevent path components in filename
    const safeOriginalname = file.originalname.replace(/[\\/]/g, '_');
    cb(null, uniqueSuffix + "-" + safeOriginalname);
  },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 } // Example limit: 5MB
});

const router = express.Router();

router.post("/updateprofile", authMiddleware, updateDoctorProfileController);

// Changed to POST because it's fetching data specific to the authenticated user,
// and sending userId in the body is common practice with auth middleware.
// If you switch to passing userId as a route parameter or query param, GET is fine.
// Sticking to POST for minimal changes to controller logic.
router.post(
  "/getdoctorappointments",
  authMiddleware,
  getAllDoctorAppointmentsController
);

router.post("/handlestatus", authMiddleware, handleStatusController);

// Keep as GET as it's retrieving a resource based on query parameter
router.get(
  "/getdocumentdownload",
  authMiddleware,
  documentDownloadController
);

module.exports = router;