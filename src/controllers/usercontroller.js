const bcrypt = require('bcryptjs');
const UserSchema = require("../models/userschema");

exports.savePasswordDetails = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ message: "Email and password are required." });
    }

    const existing = await UserSchema.findOne({ email });
    if (existing) {
      return res.json({ message: "Email already exists." });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new UserSchema({
      email,
      password: hashedPassword,
      state: 1
    });

    const savedUser = await newUser.save();

    res.status(201).json({
      message: "User password saved successfully.",
      data: {
        id: savedUser._id,
        email: savedUser.email,
        createdAt: savedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("Error saving password details:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await UserSchema.findOne({ email });

    if (!user) {
      return res.json({ message: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ message: "Invalid credentials." });
    }

    // You can generate a token or session here if needed

    res.status(200).json({ message: "Login successful", userId: user._id });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.passwordStatus = async (req, res) => {
  try {
    const userExists = await UserSchema.exists({});

    if (userExists) {
      return res.json({ userExist: true });
    } else {
      return res.json({ userExist: false });
    }
  } catch (error) {
    console.log("user check error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

