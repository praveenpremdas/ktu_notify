const mongoose = require('mongoose');

const logConfigSchema = new mongoose.Schema({
  botToken: { type: String, required: true },
  channelID: { type: String, required: true },
  enableJobLog: { type: Boolean, default: false },
  enableFailureLog: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('LogConfig', logConfigSchema);