const mongoose = require("mongoose");

const TimetableUpdateSchema = new mongoose.Schema({
  telegramConfigId: String,
  title: String,
  description: String,
  filename: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TimetableUpdate", TimetableUpdateSchema);
