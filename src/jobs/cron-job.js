require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer');
const telegramConfigSchema = require('../models/TelegramConfig');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// MongoDB connection
// mongoose.connect('mongodb+srv://ktuNotifyUser:C26dj2n3TAiSonZL@cluster0.fucapfp.mongodb.net/ktunotify_DEV?retryWrites=true&w=majority&appName=Cluster0', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// });

// Schema for sent notifications
const notificationSchema = new mongoose.Schema({
  telegramConfigId: mongoose.Schema.Types.ObjectId,
  title: String,
  date: String,
  filename: String,
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

// Helper to wait for download with timeout
function waitForDownload(downloadPath, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const before = new Set(fs.readdirSync(downloadPath));
    const start = Date.now();

    const interval = setInterval(() => {
      const after = new Set(fs.readdirSync(downloadPath));
      const difference = [...after].filter(x => !before.has(x));

      const downloading = [...after].some(file => file.endsWith('.crdownload'));
      const finishedFiles = difference.filter(x => !x.endsWith('.crdownload'));

      if (finishedFiles.length > 0) {
        clearInterval(interval);
        clearTimeout(timeout);
        return resolve(path.join(downloadPath, finishedFiles[0]));
      }

      // If timeout reached and no active download
      if ((Date.now() - start) > timeoutMs && !downloading) {
        clearInterval(interval);
        return reject(new Error("Download timed out and no .crdownload in progress."));
      }
    }, 500);

    const timeout = setTimeout(() => {
      // Double-check if still downloading before rejecting
      const currentFiles = fs.readdirSync(downloadPath);
      const downloadingStill = currentFiles.some(file => file.endsWith('.crdownload'));

      if (!downloadingStill) {
        clearInterval(interval);
        reject(new Error("Download timed out."));
      }
      // If downloading is in progress, allow to continue — next interval will catch it
    }, timeoutMs + 1000); // Give an extra second to allow for final check
  });
}

// Download file for a specific announcement
async function downloadFileForAnnouncement(index, url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    const downloadPath = path.resolve(__dirname, 'downloads');
    fs.mkdirSync(downloadPath, { recursive: true });

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath
    });

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('a[href="/Menu/announcements"]');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('a[href="/Menu/announcements"]')
    ]);
    await page.waitForSelector('.p-t-15.p-b-15.shadow.row');

    const buttons = await page.$$('.p-t-15.p-b-15.shadow.row button.btn.btn-md.bg-light');

    if (!buttons[index]) {
      await browser.close();
      return null;
    }

    try {
      const [file] = await Promise.all([
        waitForDownload(downloadPath, 60000), // 60 sec timeout
        buttons[index].click(),
      ]);
      await browser.close();
      return file;
    } catch (err) {
      await browser.close();
      console.log('Error in downloadFileForAnnouncement: ', err);
    }
  } catch (err) {
    console.log('Error In downloadFileForAnnouncement: ', err);
  } finally {
    if (browser && browser.process() !== null) {
      await browser.close();
    }
  }
}

// Scrape announcement list (no file downloads here)
async function scrapeKTUAnnouncements(url) {
  let browser;
  let announcements;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('a[href="/Menu/announcements"]');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('a[href="/Menu/announcements"]')
    ]);
    await page.waitForSelector('.p-t-15.p-b-15.shadow.row');

    announcements = await page.$$eval('.p-t-15.p-b-15.shadow.row', (nodes) => {
      return nodes.map((row, index) => {
        const title = row.querySelector('h6')?.innerText.trim() || '';
        const date = row.querySelector('.fa-calendar')?.parentElement?.innerText.trim() || '';
        const desc = row.querySelector('p')?.innerText.trim() || '';
        const hasDownloadButton = row.querySelector('button.btn.btn-md.bg-light');
        return { title, date, desc, index, hasDownload: !!hasDownloadButton };
      });
    });

  } catch (err) {
    console.log('Error In : ', err)
  } finally {
      await browser.close();
  }  
  return announcements;
}

// Send message or document to Telegram
async function sendToTelegram(botToken, chatId, message, filePath = null) {
  const sendMessageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const sendDocumentUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;

  if (filePath && fs.existsSync(filePath)) {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", message);
    formData.append("parse_mode", "HTML");
    formData.append("document", fs.createReadStream(filePath));

    await axios.post(sendDocumentUrl, formData, {
      headers: formData.getHeaders()
    });
  } else {
    await axios.post(sendMessageUrl, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML"
    });
  }
}

// Main cron job
async function runCronJob() {
  try {
    const configs = await telegramConfigSchema.findOne();

    for (const [key, config] of configs.configs.entries()) {
      if (config.notificationEnabled) {
        const announcements = await scrapeKTUAnnouncements(config.notificationURL);

        for (const ann of announcements.slice(0, 5)) {
          const exists = await Notification.findOne({
            telegramConfigId: config._id,
            title: ann.title,
            date: ann.date
          });
          if (exists) continue;

          let filename = null;

          if (ann.hasDownload) {
            try {
              const file = await downloadFileForAnnouncement(ann.index, config.notificationURL);
              filename = file ? path.basename(file) : null;
            } catch (err) {
              console.warn(`Download failed for "${ann.title}":`, err.message);
            }
          }

          const message = `<b>${ann.title}</b>\n📅 ${ann.date}\n\n${ann.desc}`;
          const filePath = filename ? path.join(__dirname, 'downloads', filename) : null;

          await sendToTelegram(config.botToken, config.channelID, message, filePath);
          await Notification.create({
            telegramConfigId: config._id,
            title: ann.title,
            date: ann.date,
            filename
          });
        }
      }
    }
  } catch (err) {
    console.log("Error:", err);
  }

  console.log("Cron job completed");
  // mongoose.connection.close();
}

module.exports = { runCronJob };