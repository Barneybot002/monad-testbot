/**
 * Error handling utilities for Monad Testnet Trading Bot
 */

const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Common error messages
const ERROR_MESSAGES = {
  WALLET_NOT_FOUND: '❌ No wallet found. Please create or import a wallet first using /wallet.',
  INVALID_ADDRESS: '❌ Invalid address format. Please provide a valid Ethereum address.',
  INVALID_PRIVATE_KEY: '❌ Invalid private key format. Please check and try again.',
  INVALID_MNEMONIC: '❌ Invalid mnemonic phrase. Please check and try again.',
  INSUFFICIENT_BALANCE: '❌ Insufficient balance for this transaction.',
  NETWORK_ERROR: '❌ Network error. Please try again later.',
  TRANSACTION_FAILED: '❌ Transaction failed. Please try again later.',
  INVALID_AMOUNT: '❌ Invalid amount. Please enter a valid number.',
  GENERAL_ERROR: '❌ An error occurred. Please try again or contact support.'
};

/**
 * Handle errors in async functions
 * @param {Function} fn - The async function to wrap
 * @returns {Function} Wrapped function with error handling
 */
function asyncErrorHandler(fn) {
  return async function(msg, ...args) {
    try {
      return await fn(msg, ...args);
    } catch (error) {
      // Log the error
      logger.error(`Error in ${fn.name}: ${error.message}`);
      logger.error(error.stack);
      
      // Send error message to user
      const errorMessage = `❌ *Error*\n\n${error.message}\n\nPlease try again or use /help for assistance.`;
      
      if (msg && msg.chat && msg.chat.id) {
        global.bot.sendMessage(msg.chat.id, errorMessage, { parse_mode: 'Markdown' });
      }
      
      return null;
    }
  };
}

/**
 * Log an error and return an error message
 * @param {Error} error - The error object
 * @param {string} context - Context where the error occurred
 * @returns {string} Error message to display to user
 */
function handleError(error, context) {
  // Log the error
  logger.error(`Error in ${context}: ${error.message}`);
  logger.error(error.stack);
  
  // Return appropriate error message
  return ERROR_MESSAGES.GENERAL_ERROR;
}

module.exports = {
  logger,
  ERROR_MESSAGES,
  asyncErrorHandler,
  handleError
};