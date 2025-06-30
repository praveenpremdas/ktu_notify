const mongoose = require("mongoose");

const createPasswordSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    password: { type: String, required: true },
  },
  { timestamps: true } // adds createdAt and updatedAt
);

module.exports = mongoose.model("CreatePassword", createPasswordSchema);
