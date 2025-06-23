require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const KTU_URL = 'https://ktu.edu.in/Menu/announcements';

async function scrapeKTUAnnouncements() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  const page = await browser.newPage();
  await page.goto(KTU_URL, { waitUntil: 'networkidle2' });

  // Navigate to Announcements
  await page.waitForSelector('a[href="/Menu/announcements"]');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('a[href="/Menu/announcements"]')
  ]);

  // Wait for announcement blocks
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

async function sendToTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML"
  });
}

(async () => {
  try {
    const data = await scrapeKTUAnnouncements();
    if (!data.length) return console.log("No announcements found.");

    // Optionally filter only today's or new ones
    for (const item of data.slice(0, 5)) { // limit to latest 5
      const message = `<b>${item.title}</b>\n📅 ${item.date}\n\n${item.desc}`;
      await sendToTelegram(message);
    }

    console.log("Posted to Telegram successfully.");
  } catch (err) {
    console.error("Error:", err);
  }
})();
