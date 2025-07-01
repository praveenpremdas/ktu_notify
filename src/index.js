const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const pLimit = require('p-limit').default;

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

// Shared limiter (only 1 job runs at a time)
const limit = pLimit(1);

// Track last execution to avoid "catch-up"
const lastExecutionMap = new Map();

const safeRun = (fn, jobName, intervalMs) => () => {
  // Avoid blocking the main thread
  setImmediate(async () => {
    const now = Date.now();
    const lastRun = lastExecutionMap.get(jobName) || 0;

    // Prevent catch-up if last run was recent
    if (now - lastRun < intervalMs - 1000) {
      console.log(`[SKIPPED] ${jobName}: last run was too recent`);
      return;
    }

    lastExecutionMap.set(jobName, now);

    const time = new Date().toLocaleTimeString();
    const logPrefix = `["SCHEDULER"] ${jobName} at ${time}`;

    await limit(async () => {
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
        console.log(`${logPrefix} failed:`, err.message);

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
          console.log("Failed to fetch config or send Telegram error:", innerErr.message);
        }
      }
    });
  });
};

const startServer = async () => {
  await connectDB();

  // Schedule with interval (in ms) for each job
  cron.schedule('*/3 * * * *', safeRun(runCronJob, 'ktu_notification', 3 * 60 * 1000));
  cron.schedule('*/5 * * * *', safeRun(runCalendarCronJob, 'academic_calendar', 5 * 60 * 1000));
  cron.schedule('*/7 * * * *', safeRun(runTimetableCronJob, 'academic_timetable', 7 * 60 * 1000));

  app.listen(PORT, () => {
    console.log(`🚀 .env.${process.env.NODE_ENV || 'development'} running on port ${PORT}`);
  });
};

startServer();