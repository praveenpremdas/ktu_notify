require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const telegramConfigSchema = require('../models/TelegramConfig');
const AcademicCalendar = require('../models/AcademicCalendar');

// Helper to wait for file download
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

      if ((Date.now() - start) > timeoutMs && !downloading) {
        clearInterval(interval);
        return reject(new Error("Download timed out."));
      }
    }, 500);

    const timeout = setTimeout(() => {
      const currentFiles = fs.readdirSync(downloadPath);
      if (!currentFiles.some(file => file.endsWith('.crdownload'))) {
        clearInterval(interval);
        reject(new Error("Download timed out."));
      }
    }, timeoutMs + 1000);
  });
}

// Scrape calendar entries
async function scrapeAcademicCalendar(url) {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });

    // Trigger AJAX load
    await page.click('#noanim-tab-example-tab-profile');
    await page.click('#noanim-tab-example-tab-home');
    await page.waitForSelector('.tab-pane.active.show .row');

    const items = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.tab-pane.active.show .row'));
      return rows.map(row => {
        const title = row.querySelector('.m-l-10')?.childNodes[0]?.textContent?.trim() || null;
        const date = row.querySelector('label + span')?.textContent?.trim() || null;
        const encoded = row.querySelector('button')?.value?.trim();
        const downloadLink = encoded ? `https://ktu.edu.in/eu/att/attachments.htm?download=${encoded}` : null;
        return { title, date, downloadLink, value: encoded };
      }).filter(entry => entry.title && entry.date && entry.downloadLink);
    });
    await browser.close();
    return items;
  } catch (err) {
    console.log('Error In : scrapeAcademicCalendar', err);
  } finally {
    if (browser && browser.process() !== null) {
      await browser.close();
    }
  }
}

// 🛠 Fixed: Download using value (via actual button click)
async function downloadCalendarFile(url, encodedValue) {
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

    // Click to load the relevant section (if needed again)
    try {
      await page.click('#noanim-tab-example-tab-profile');
      await page.click('#noanim-tab-example-tab-home');
      await page.waitForSelector('.tab-pane.active.show .row', { timeout: 5000 });
    } catch (e) {
      console.warn("Tab switch during download setup failed (may already be loaded).");
    }

    // Wait and click the exact button by its value
    await page.evaluate((val) => {
      const buttons = Array.from(document.querySelectorAll('button.btn'));
      const btn = buttons.find(b => b.value === val);
      if (btn) {
        btn.scrollIntoView();
        btn.click();
      }
    }, encodedValue);

    try {
      const filePath = await waitForDownload(downloadPath, 60000);
      await browser.close();
      return filePath;
    } catch (err) {
      await browser.close();
      console.log('Error In downloadCalendarFile: ', err)
    }
    } catch (err) {
      console.log('Error In : scrapeAcademicCalendar', err);
    } finally {
      if (browser && browser.process() !== null) {
        await browser.close();
      }
    }
}

// Send Telegram message or document
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
async function runCalendarCronJob() {
  try {
    const configs = await telegramConfigSchema.findOne();

    for (const [key, config] of configs.configs.entries()) {
      if (!config.calenderUpdateEnabled) continue;
      const entries = await scrapeAcademicCalendar(config.calenderURL);
      for (const entry of entries.slice(0, 5)) {
        const exists = await AcademicCalendar.findOne({
          telegramConfigId: config._id,
          title: entry.title,
          date: entry.date
        });
        if (exists) continue;
        let filename = null;
        try {
          const file = await downloadCalendarFile(config.calenderURL, entry.value);
          filename = file ? path.basename(file) : null;
        } catch (err) {
          console.warn(`Download failed for "${entry.title}":`, err.message);
        }

        const msg = `<b>${entry.title}</b>\n📅 ${entry.date}`;
        const filePath = filename ? path.join(__dirname, 'downloads', filename) : null;

        await sendToTelegram(config.botToken, config.channelID, msg, filePath);
        await AcademicCalendar.create({
          telegramConfigId: config._id,
          title: entry.title,
          date: entry.date,
          filename
        });
      }
    }
  } catch (err) {
    console.error("Academic Calendar Cron Error:", err);
  }

  console.log("Academic Calendar Cron Completed");
}

module.exports = { runCalendarCronJob };