const mongoose = require('mongoose');

const configItemSchema = new mongoose.Schema({
  botToken: String,
  channelID: String,
  notificationURL: String,
  calenderURL: String,
  timtableURL: String,
  notificationEnabled: Boolean,
  calenderUpdateEnabled: Boolean,
  timetabbleupdateEnabled: Boolean
}, { _id: false });

const telegramConfigSchema = new mongoose.Schema({
  configs: {
    type: Map,
    of: configItemSchema,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('TelegramConfig', telegramConfigSchema);