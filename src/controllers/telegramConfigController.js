const TelegramConfig = require('../models/TelegramConfig');

exports.updateConfig = async (req, res) => {
  const incomingConfigs = req.body;
  console.log(incomingConfigs)

  if (!incomingConfigs || typeof incomingConfigs !== 'object') {
    return res.status(400).json({ error: 'Invalid config format' });
  }

  let configDoc = await TelegramConfig.findOne();

  if (!configDoc) {
    // Create new
    configDoc = new TelegramConfig({ configs: incomingConfigs });
  } else {
    // Update existing configs
    for (const key in incomingConfigs) {
      configDoc.configs.set(key, incomingConfigs[key]);
    }
  }

  await configDoc.save();

  return res.status(200).json({ message: 'Configurations updated successfully', configs: configDoc.configs });
};


exports.getAllConfigs = async (req, res) => {
  try {
    const configs = await require('../models/TelegramConfig').find();

    if (!configs.length) {
      return res.status(404).json({ message: 'No configurations found' });
    }

    return res.status(200).json({ configs });
  } catch (err) {
    console.error('Error fetching configs:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.deleteTelegramConfig = async (req, res) => {
  try {
    const { configKey } = req.params;

     const updated = await TelegramConfig.findOneAndUpdate(
      {},
      { $unset: { [`configs.${configKey}`]: "" } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Config not found" });

    res.status(200).json({ message: "Deleted successfully", updated });
  } catch (err) {
    console.error('Error fetching configs:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};