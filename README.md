This is the backend application for the MediCareBook Doctor Appointment Booking System. It provides a RESTful API for managing users, doctors, appointments, and notifications, and handles authentication and data storage.

## Technologies Used

*   **Node.js:** JavaScript runtime environment.
*   **Express.js:** Web application framework for building APIs.
*   **MongoDB Atlas:** Cloud-hosted NoSQL database.
*   **Mongoose:** MongoDB object modeling for Node.js, used for defining schemas and interacting with the database.
*   **JWT (jsonwebtoken):** For creating and verifying authentication tokens to secure API endpoints.
*   **Bcryptjs:** For securely hashing user passwords before storing them.
*   **Multer:** Express middleware for handling `multipart/form-data`, used for file uploads (appointment documents).
*   **CORS:** Middleware to enable Cross-Origin Resource Sharing, allowing the frontend (on a different origin) to communicate with the backend API.
*   **dotenv:** Module to load environment variables from a `.env` file.

## Project Structure
Use code with caution.
Markdown
backend/
├── config/ # Database connection setup (connectToDb.js)
├── controllers/ # Contains the core logic for processing API requests (adminC.js, doctorC.js, userC.js)
├── middlewares/ # Custom Express middleware (authMiddleware.js for JWT authentication)
├── routes/ # Defines API endpoints and links them to controllers/middleware (adminRoutes.js, doctorRoutes.js, userRoutes.js)
├── schemas/ # Mongoose schemas defining the structure of data in MongoDB (appointmentModel.js, docModel.js, userModel.js)
├── uploads/ # Directory for storing uploaded appointment documents (created manually)
├── .env # Environment variables (database URI, JWT secret, port)
├── index.js # Main entry point, server setup, middleware, and route mounting
└── package.json # Project dependencies and scripts
Generated code
## Setup

1.  **Clone the repository:** If not already done, clone the entire project.
    ```bash
    git clone <repository_url>
    cd <project_directory>/backend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or yarn install
    ```
3.  **Create `.env` file:** Create a file named `.env` in the `backend` directory.
    ```env
    MONGO_DB=YOUR_MONGODB_ATLAS_CONNECTION_STRING_HERE
    JWT_KEY=your_super_secret_jwt_key_replace_this_with_a_long_random_string
    PORT=5000 # Default backend port
    ```
    *   Replace `YOUR_MONGODB_ATLAS_CONNECTION_STRING_HERE` with the connection string from your MongoDB Atlas cluster. Ensure your database user credentials are included in the string if required.
    *   Replace `your_super_secret_jwt_key_replace_this_with_a_long_random_string` with a secure, random string. This is used for signing and verifying JWTs.
    *   You can change the `PORT` if needed.

4.  **Configure MongoDB Atlas Network Access:**
    *   Log in to your MongoDB Atlas account.
    *   Navigate to your cluster.
    *   Go to Security -> Network Access.
    *   Add the IP address(es) from which your backend server will connect (e.g., your local machine's public IP, or the IP address of your hosting server). For development/testing, you might temporarily allow access from `0.0.0.0/0` (Allow Access from Anywhere), but this is **not recommended for production**.

5.  **Create `uploads` directory:** Manually create an empty directory named `uploads` in the `backend` directory. This is configured in `routes/userRoutes.js` and `routes/doctorRoutes.js` to store uploaded documents.

## Running the Backend

*   In your terminal, navigate to the `backend` directory.
*   Run the server:
    ```bash
    node index.js
    # or if you add a start script to package.json: npm start
    ```
*   You should see confirmation messages like "Connected to MongoDB" and "Server is running on port ...".

## API Endpoints

Base URL: `http://localhost:5000/api` (or the PORT you configured)

### Public Routes (`/api/user`)

*   `POST /user/register`
    *   **Purpose:** Register a new user account.
    *   **Body:** `{ fullName, email, password, phone, type }` (where `type` is 'user' or 'admin').
    *   **Behavior:** Allows registering as 'user'. **Crucially, it allows the *very first* user ever to register to successfully select and become the 'admin' type.** Subsequent attempts to register with `type: 'admin'` will be rejected with a specific message (`409 Conflict`).
    *   **Protection:** None (public).
*   `POST /user/login`
    *   **Purpose:** Log in an existing user.
    *   **Body:** `{ email, password }`.
    *   **Response:** JWT token and user data (excluding password) on success (`200 OK`).
    *   **Protection:** None (public).

### Authenticated User Routes (`/api/user`)

*   Requires `authMiddleware` (sends JWT in `Authorization: Bearer <token>` header).
*   `POST /user/getuserdata`
    *   **Purpose:** Get the data of the authenticated user.
    *   **Protection:** `authMiddleware`.
*   `POST /user/registerdoc`
    *   **Purpose:** Apply to become a doctor.
    *   **Body:** `{ doctor: { fullName, email, phone, address, specialization, experience, fees, timings } }`. Note: `userId` is obtained from `req.user._id`, not the body.
    *   **Behavior:** Creates a pending doctor application. Notifies admin. Only allowed for standard users who are not already doctors (`403 Forbidden`).
    *   **Protection:** `authMiddleware`.
*   `GET /user/getalldoctorsu`
    *   **Purpose:** Get a list of all approved doctors for users to browse.
    *   **Protection:** `authMiddleware`.
*   `POST /user/getappointment`
    *   **Purpose:** Book an appointment with a doctor. Includes file upload.
    *   **Middleware:** `upload.single('document')` (handles file upload), then `authMiddleware`.
    *   **Body (multipart/form-data):** `date`, `doctorId`, `document` (the file). Note: `userId` is obtained from `req.user._id`. `userInfo` and `doctorInfo` are populated by the backend based on IDs, not taken from the body.
    *   **Behavior:** Creates a pending appointment. Notifies the doctor. Only allowed for standard users (`403 Forbidden`).
    *   **Protection:** `authMiddleware`.
*   `POST /user/getallnotification`
    *   **Purpose:** Mark all unread notifications for the authenticated user as read.
    *   **Protection:** `authMiddleware`.
*   `POST /user/deleteallnotification`
    *   **Purpose:** Delete all seen notifications for the authenticated user.
    *   **Protection:** `authMiddleware`.
*   `GET /user/getuserappointments`
    *   **Purpose:** Get all appointments booked by the authenticated user.
    *   **Query Params:** `userId` (Although the backend uses `req.user._id` from the token for security, the frontend might still send this as a query param based on the old structure).
    *   **Protection:** `authMiddleware`.

### Authenticated Doctor Routes (`/api/doctor`)

*   Requires `authMiddleware` and role check within the controller (`req.user.isdoctor === true`).
*   `POST /doctor/updateprofile`
    *   **Purpose:** Update the authenticated doctor's profile information.
    *   **Body:** `{ fullName, email, phone, address, specialization, experience, fees, timings }` (only allowed fields are updated).
    *   **Protection:** `authMiddleware`.
*   `POST /doctor/getdoctorappointments`
    *   **Purpose:** Get all appointments booked with the authenticated doctor.
    *   **Protection:** `authMiddleware`.
*   `POST /doctor/handlestatus`
    *   **Purpose:** Approve or reject a pending appointment booked with the authenticated doctor.
    *   **Body:** `{ appointmentId, status, userid }` (Note: `userid` is used for notification, but the backend verifies `appointmentId` belongs to the doctor via `req.user._id`).
    *   **Protection:** `authMiddleware`.
*   `GET /doctor/getdocumentdownload`
    *   **Purpose:** Download a document attached to a specific appointment.
    *   **Query Params:** `appointId`.
    *   **Behavior:** Securely retrieves and streams the file from the `uploads` directory. Verifies the appointment belongs to the doctor before allowing download.
    *   **Protection:** `authMiddleware`.

### Authenticated Admin Routes (`/api/admin`)

*   Requires `authMiddleware` and role check within the controller (`req.user.type === 'admin'`).
*   `GET /admin/getallusers`
    *   **Purpose:** Get a list of all users (standard users, doctors, admins).
    *   **Protection:** `authMiddleware`.
*   `GET /admin/getalldoctors`
    *   **Purpose:** Get a list of all doctor applications/profiles (pending, approved, rejected).
    *   **Protection:** `authMiddleware`.
*   `POST /admin/getapprove`
    *   **Purpose:** Approve a doctor application.
    *   **Body:** `{ doctorId, status, userid }` (Note: `userid` is used for notification, but the backend verifies `doctorId` exists). Sets doctor status to 'approved', updates linked user's `isdoctor` to true, sends notification.
    *   **Protection:** `authMiddleware`.
*   `POST /admin/getreject`
    *   **Purpose:** Reject a doctor application.
    *   **Body:** `{ doctorId, status, userid }` (Note: `userid` is used for notification). Sets doctor status to 'rejected', updates linked user's `isdoctor` to false, sends notification.
    *   **Protection:** `authMiddleware`.
*   `GET /admin/getallAppointmentsAdmin`
    *   **Purpose:** Get a list of all appointments across the entire system.
    *   **Protection:** `authMiddleware`.
*   `POST /admin/registeradmin`
    *   **Purpose:** Create a new admin user account (accessible only by existing admins).
    *   **Body:** `{ fullName, email, password, phone }`. Note: `type` is fixed to 'admin' by the backend for this route.
    *   **Protection:** `authMiddleware`.

## Database Schema Overview

*   **`userModel`:** Represents a user account (standard user, doctor, or admin). Stores authentication credentials, basic info, type, doctor status (`isdoctor`), and notifications.
*   **`docModel`:** Represents a doctor's professional profile. Linked to a user via `userId`. Stores details like specialization, experience, fees, timings, and application status.
*   **`appointmentModel`:** Represents a scheduled appointment between a user and a doctor. Linked to user and doctor via `userId` and `doctorId`. Stores date, uploaded document information, and status.
