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

require('dotenv').config({
  path: `.env.${process.env.NODE_ENV || 'development'}`
});

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use('/api', telegramRoutes);

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await connectDB();

  // Schedule runCronJob
  cron.schedule('*/3 * * * *', () => {
    console.log(`[CRON] Executing runCronJob at ${new Date().toLocaleTimeString()}`);
    runCronJob();
  });

  cron.schedule('*/5 * * * *', () => {
    console.log(`[CRON] Executing academic_calendar job run at ${new Date().toLocaleTimeString()}`);
    runCalendarCronJob();
  });

  cron.schedule('*/5 * * * *', () => {
    console.log(`[CRON] Executing academic_TimeTable job run at ${new Date().toLocaleTimeString()}`);
    runTimetableCronJob();
  });

  app.listen(PORT, () => {
    console.log(`🚀 .env.${process.env.NODE_ENV || 'development'} running on port ${PORT}`);
  });
};

startServer();
