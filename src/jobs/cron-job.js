// cron-job.js
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer');

// MongoDB connection
mongoose.connect('mongodb+srv://ktuNotifyUser:C26dj2n3TAiSonZL@cluster0.fucapfp.mongodb.net/ktunotify_DEV?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Define schema for storing sent notifications
const notificationSchema = new mongoose.Schema({
  telegramConfigId: mongoose.Schema.Types.ObjectId,
  title: String,
  date: String,
}, { timestamps: true });   

const telegramConfigSchema = new mongoose.Schema({
  label: String,
  botToken: String,
  chatId: String,
  ktuNotificationUrl: String,
  notificationEnabled: Boolean,
});

const TelegramConfig = mongoose.model('TelegramConfig', telegramConfigSchema);
const Notification = mongoose.model('Notification', notificationSchema);

async function scrapeKTUAnnouncements(url) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.p-t-15.p-b-15.shadow.row');

  const announcements = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.p-t-15.p-b-15.shadow.row');
    return Array.from(nodes).map(row => {
      const title = row.querySelector('h6')?.innerText.trim() || '';
      const date = row.querySelector('.fa-calendar')?.parentElement?.innerText.trim() || '';
      const desc = row.querySelector('p')?.innerText.trim() || '';
      return { title, date, desc };
    });
  });
  await browser.close();
  return announcements;
}

async function sendToTelegram(botToken, chatId, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML"
  });
}

async function runCronJob() {
  let configs = await TelegramConfig.find();
  configs = configs[0];
        console.log(configs['configs'])

//   const plainConfigs = Object.fromEntries(configDoc.configs);
  for (const config of configs) {

    try {
      const announcements = await scrapeKTUAnnouncements(config.ktuNotificationUrl);
      for (const ann of announcements.slice(0, 5)) {
        const exists = await Notification.findOne({
          telegramConfigId: config._id,
          title: ann.title,
          date: ann.date
        });
        if (!exists) {
          const message = `<b>${ann.title}</b>\n📅 ${ann.date}\n\n${ann.desc}`;
          await sendToTelegram(config.botToken, config.chatId, message);
          await Notification.create({ telegramConfigId: config._id, title: ann.title, date: ann.date });
        }
      }
    } catch (err) {
      console.error(`Error for config ${config.label}:`, err.message);
    }
  }
  console.log("Cron job completed");
  mongoose.connection.close();
}

runCronJob();
