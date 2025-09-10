/**
 * MonadScan API utility functions for Monad Testnet Trading Bot
 */

const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MonadScan API URL
const MONADSCAN_API_URL = 'https://api-testnet.monadscan.com/api';

/**
 * Get ERC20 tokens for a wallet address
 * @param {string} address - The wallet address
 * @returns {Promise<Array>} List of tokens held by the wallet
 */
async function getWalletTokens(address) {
  try {
    const response = await axios.get(`${MONADSCAN_API_URL}/address/${address}/tokens`);
    return response.data.result || [];
  } catch (error) {
    console.error('Error fetching wallet tokens:', error);
    return [];
  }
}

/**
 * Get token information including market cap and price
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object>} Token information including market data
 */
async function getTokenDetails(tokenAddress) {
  try {
    const response = await axios.get(`${MONADSCAN_API_URL}/token/${tokenAddress}`);
    return response.data.result || {};
  } catch (error) {
    console.error('Error fetching token details:', error);
    return {};
  }
}

/**
 * Get token balance for a specific address
 * @param {string} walletAddress - The wallet address
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object>} Token balance information
 */
async function getTokenBalanceFromScan(walletAddress, tokenAddress) {
  try {
    const response = await axios.get(`${MONADSCAN_API_URL}/address/${walletAddress}/token/${tokenAddress}`);
    return response.data.result || {};
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return {};
  }
}

module.exports = {
  getWalletTokens,
  getTokenDetails,
  getTokenBalanceFromScan
};