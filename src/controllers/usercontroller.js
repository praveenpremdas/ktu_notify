const UserSchema = require("../models/userschema");

const formatDate = (date) => {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

exports.savePasswordDetails = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.json({ message: "Email and password are required." });
    }

    // Check if email already exists (optional - remove if not needed)
    const existing = await UserSchema.findOne({ email });
    if (existing) {
      return res.json({ message: "Email already exists." });
    }

    const newEntry = new UserSchema({ email, password });

    const savedData = await newEntry.save();

    res.status(201).json({
      message: "User password saved successfully.",
      data: {
        id: savedData._id,
        email: savedData.email,
        createdAt: formatDate(savedData.createdAt),
        updatedAt: formatDate(savedData.updatedAt),
      },
    });
  } catch (error) {
    console.error("Error saving password details:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
