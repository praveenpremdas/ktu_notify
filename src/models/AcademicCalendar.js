const mongoose = require('mongoose');

const academicCalendarSchema = new mongoose.Schema({
  telegramConfigId: String,
  title: String,
  date: String,
  filename: String,
}, { timestamps: true });

module.exports = mongoose.model('AcademicCalendar', academicCalendarSchema);