const LogConfig = require('../models/LogConfig');

exports.updateLogConfig = async (req, res) => {
  const { botToken, channelID, enableJobLog, enableFailureLog } = req.body;

  if (!botToken || !channelID) {
    return res.status(400).json({ error: 'botToken and channelID are required' });
  }

  try {
    let logConfig = await LogConfig.findOne();

    if (!logConfig) {
      logConfig = new LogConfig({ botToken, channelID, enableJobLog, enableFailureLog });
    } else {
      logConfig.botToken = botToken;
      logConfig.channelID = channelID;
      logConfig.enableJobLog = enableJobLog;
      logConfig.enableFailureLog = enableFailureLog;
    }

    await logConfig.save();

    res.status(200).json({ message: 'Log configuration updated', config: logConfig });
  } catch (err) {
    console.log('Update log config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getLogConfig = async (req, res) => {
  try {
    const logConfig = await require('../models/LogConfig').findOne();

    if (!logConfig) {
      return res.status(404).json({ message: 'Log configuration not found' });
    }

    res.status(200).json({ config: logConfig });
  } catch (err) {
    console.log('Fetch log config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
