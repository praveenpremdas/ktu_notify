const axios = require('axios');

const sendTelegramMessage = async (botToken, channelID, message) => {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: channelID,
      text: message,
    });
  } catch (error) {
    console.error("Failed to send message to Telegram:", error.message);
  }
};

module.exports = sendTelegramMessage;