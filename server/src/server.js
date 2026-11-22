import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const startServer = async () => {
  await connectDB();
  const PORT = env.PORT;
  app.listen(PORT, () => {
    logger.info(`Shonglap server running on port ${PORT} in ${env.NODE_ENV} mode`);
  });
};

if (env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
