const jwt = require("jsonwebtoken");
const userSchema = require("../schemas/userModel"); // Import user schema

module.exports = async (req, res, next) => {
  try {
    const authorizationHeader = req.headers["authorization"];
    if (!authorizationHeader) {
      // Use 401 Unauthorized for missing authentication header
      return res.status(401).send({ message: "Authorization header missing", success: false });
    }

    // Extract token correctly
    const token = authorizationHeader.split(" ")[1];
     if (!token) {
         return res.status(401).send({ message: "Token missing from Authorization header", success: false });
     }


    jwt.verify(token, process.env.JWT_KEY, async (err, decode) => {
      if (err) {
        // Use 401 Unauthorized for invalid token
        return res
          .status(401)
          .send({ message: "Authentication Failed: Invalid Token", success: false }); // More specific message
      } else {
        try {
          // Fetch the user from the database based on the ID in the token payload
          // Use .lean() for better performance if you don't need Mongoose document methods/virtuals immediately
          const user = await userSchema.findById(decode.id).select('-password').lean(); // Exclude password, use lean()

          if (!user) {
              // User not found in DB (maybe deleted?)
               return res.status(401).send({ message: "Authentication Failed: User not found", success: false });
          }

          // Attach the full user object (excluding password) to the request
          req.user = user;
          // REMOVED: req.body.userId = user._id; // This caused TypeError on GET requests

          next(); // Proceed to the next middleware or route handler
        } catch (dbError) {
          console.error("Error fetching user in auth middleware:", dbError);
          res.status(500).send({ message: "Internal server error during authentication", success: false });
        }
      }
    });
  } catch (error) {
    console.error("Unexpected error in auth middleware:", error); // Handle unexpected errors
    res.status(500).send({ message: "Internal server error during authentication", success: false });
  }
};