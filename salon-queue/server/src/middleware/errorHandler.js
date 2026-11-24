import { AppError } from '../utils/errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message, ...err.extra });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON in request body.' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid identifier.' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'That record already exists.' });
  }
  const dbDown = /MongoNetworkError|MongoServerSelectionError|buffering timed out|topology/i.test(`${err.name} ${err.message}`);
  console.error(err);
  res.status(dbDown ? 503 : 500).json({
    message: dbDown ? 'Database is temporarily unavailable. Please try again shortly.' : 'Something went wrong. Please try again.',
  });
}
