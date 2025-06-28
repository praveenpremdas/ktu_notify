const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors'); // ✅ Import cors

const connectDB = require('./database/mongo');
const telegramRoutes = require('./routes/routes');

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
  app.listen(PORT, () => console.log(`🚀 .env.${process.env.NODE_ENV || 'development'} running on port ${PORT}`));
};

startServer();
