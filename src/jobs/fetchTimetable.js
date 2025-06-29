require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const telegramConfigSchema = require("../models/TelegramConfig");
const TimetableUpdate = require("../models/TimetableUpdate");

function waitForDownload(downloadPath, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const before = new Set(fs.readdirSync(downloadPath));
    const start = Date.now();

    const interval = setInterval(() => {
      const after = new Set(fs.readdirSync(downloadPath));
      const difference = [...after].filter(x => !before.has(x));
      const downloading = [...after].some(file => file.endsWith(".crdownload"));
      const finishedFiles = difference.filter(x => !x.endsWith(".crdownload"));

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
      if (!currentFiles.some(file => file.endsWith(".crdownload"))) {
        clearInterval(interval);
        reject(new Error("Download timed out."));
      }
    }, timeoutMs + 1000);
  });
}

async function scrapeTimetable(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  // Navigate to timetable page
  await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll("a")).find(a =>
      a.href.includes("/exam/timetable")
    );
    if (link) link.click();
  });

  await page.waitForSelector("div.container > div.shadow.row", { timeout: 10000 });

  const updates = await page.$$eval("div.container > div.shadow.row", nodes =>
    nodes.map(node => {
      const title = node.querySelector("h6.f-w-bold")?.innerText?.trim() || "";
      const description = node.querySelector("p")?.innerText?.trim() || "";
      const encodedValue = node.querySelector("button.btn")?.value || null;
      return { title, description, encodedValue };
    })
  );

  await browser.close();
  return updates.filter(entry => entry.title || entry.description);
}

async function downloadTimetableFile(url, encodedValue) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const downloadPath = path.resolve(__dirname, "downloads");
  fs.mkdirSync(downloadPath, { recursive: true });

  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath,
  });

  await page.goto(url, { waitUntil: "networkidle2" });

  await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll("a")).find(a =>
      a.href.includes("/exam/timetable")
    );
    if (link) link.click();
  });

  await page.waitForSelector("div.container > div.shadow.row", { timeout: 10000 });

  await page.evaluate(val => {
    const buttons = Array.from(document.querySelectorAll("button.btn"));
    const btn = buttons.find(b => b.value === val);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
      btn.click();
    }
  }, encodedValue);

  try {
    const filePath = await waitForDownload(downloadPath, 60000);
    await browser.close();
    return filePath;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

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
      headers: formData.getHeaders(),
    });
  } else {
    await axios.post(sendMessageUrl, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
  }
}

async function runTimetableCronJob() {
  try {
    const configs = await telegramConfigSchema.findOne();

    for (const [key, config] of configs.configs.entries()) {
      if (!config.timetabbleupdateEnabled) continue;

      const entries = await scrapeTimetable(config.timtableURL);

      for (const entry of entries.slice(0, 5)) {
        const exists = await TimetableUpdate.findOne({
          telegramConfigId: config._id,
          title: entry.title,
        });
        if (exists) continue;

        let filename = null;

        if (entry.encodedValue) {
          try {
            const file = await downloadTimetableFile(config.timtableURL, entry.encodedValue);
            filename = file ? path.basename(file) : null;
          } catch (err) {
            console.warn(`Download failed for "${entry.title}":`, err.message);
          }
        }

        const msg = `<b>${entry.title}</b>\n${entry.description}`;
        const filePath = filename ? path.join(__dirname, "downloads", filename) : null;

        await sendToTelegram(config.botToken, config.channelID, msg, filePath);

        await TimetableUpdate.create({
          telegramConfigId: config._id,
          title: entry.title,
          description: entry.description,
          filename,
        });
      }
    }
  } catch (err) {
    console.error("Timetable Cron Error:", err);
  }

  console.log("Timetable Cron Completed");
}

module.exports = { runTimetableCronJob };