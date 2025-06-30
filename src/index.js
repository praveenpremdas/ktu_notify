const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');

const connectDB = require('./database/mongo');
const telegramRoutes = require('./routes/routes');

const { runCronJob } = require('./jobs/cron-job');
const { runCalendarCronJob } = require('./jobs/academic_calendar');
const { runTimetableCronJob } = require('./jobs/fetchTimetable');

const LogConfig = require('./models/LogConfig');
const sendTelegramMessage = require('./utils/sendTelegramMessage');

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use('/api', telegramRoutes);

const PORT = process.env.PORT || 3001;

const safeRun = (fn, jobName) => async () => {
  const time = new Date().toLocaleTimeString();
  const logPrefix = `["SCHEDULER"] ${jobName} at ${time}`;

  try {
    const config = await LogConfig.findOne();

    if (config?.enableJobLog) {
      await sendTelegramMessage(config.botToken, config.channelID, `${logPrefix} started`);
    }

    await fn();

    if (config?.enableJobLog) {
      await sendTelegramMessage(config.botToken, config.channelID, `${logPrefix} completed`);
    }

  } catch (err) {
    console.error(`${logPrefix} failed:`, err.message);

    try {
      const config = await LogConfig.findOne();
      if (config?.enableFailureLog) {
        await sendTelegramMessage(
          config.botToken,
          config.channelID,
          `❌ ${logPrefix} failed:\n${err.message}`
        );
      }
    } catch (innerErr) {
      console.error("Failed to fetch config or send Telegram error:", innerErr.message);
    }
  }
};

const startServer = async () => {
  await connectDB();

  cron.schedule('*/3 * * * *', safeRun(runCronJob, "ktu_notification"));
  cron.schedule('*/5 * * * *', safeRun(runCalendarCronJob, "academic_calendar"));
  cron.schedule('*/5 * * * *', safeRun(runTimetableCronJob, "academic_timetable"));

  app.listen(PORT, () => {
    console.log(`🚀 .env.${process.env.NODE_ENV || 'development'} running on port ${PORT}`);
  });
};

startServer();