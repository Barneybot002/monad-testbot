/**
 * Wallet utility functions for Monad Testnet Trading Bot
 */

const { ethers } = require('ethers');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider(process.env.MONAD_TESTNET_RPC);

// ERC20 ABI for token interactions
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to, uint amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

/**
 * Create a new wallet
 * @returns {Object} Wallet data including address and private key
 */
function createWallet() {
  const wallet = ethers.Wallet.createRandom().connect(provider);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase
  };
}

/**
 * Import wallet from private key
 * @param {string} privateKey - The private key to import
 * @returns {Object} Wallet data including address and private key
 */
function importWalletFromPrivateKey(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  } catch (error) {
    throw new Error(`Invalid private key: ${error.message}`);
  }
}

/**
 * Import wallet from mnemonic phrase
 * @param {string} mnemonic - The mnemonic phrase to import
 * @returns {Object} Wallet data including address, private key and mnemonic
 */
function importWalletFromMnemonic(mnemonic) {
  try {
    const wallet = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase
    };
  } catch (error) {
    throw new Error(`Invalid mnemonic phrase: ${error.message}`);
  }
}

/**
 * Get MON balance for an address
 * @param {string} address - The address to check
 * @returns {Promise<string>} The balance in MON
 */
async function getBalance(address) {
  try {
    const balance = await provider.getBalance(address);
    return ethers.utils.formatEther(balance);
  } catch (error) {
    throw new Error(`Failed to get balance: ${error.message}`);
  }
}

/**
 * Get token balance for an address
 * @param {string} address - The wallet address
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object>} Token balance information
 */
async function getTokenBalance(address, tokenAddress) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Get token details
    const [balance, decimals, symbol, name] = await Promise.all([
      tokenContract.balanceOf(address),
      tokenContract.decimals(),
      tokenContract.symbol(),
      tokenContract.name()
    ]);
    
    // Format balance based on token decimals
    const formattedBalance = ethers.utils.formatUnits(balance, decimals);
    
    return {
      address: tokenAddress,
      balance: formattedBalance,
      decimals,
      symbol,
      name
    };
  } catch (error) {
    throw new Error(`Failed to get token balance: ${error.message}`);
  }
}

/**
 * Transfer MON to another address
 * @param {string} privateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {string} amount - Amount to send in MON
 * @returns {Promise<string>} Transaction hash
 */
async function transferMON(privateKey, toAddress, amount) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.utils.parseEther(amount)
    });
    
    return tx.hash;
  } catch (error) {
    throw new Error(`Failed to transfer MON: ${error.message}`);
  }
}

/**
 * Transfer tokens to another address
 * @param {string} privateKey - Sender's private key
 * @param {string} tokenAddress - Token contract address
 * @param {string} toAddress - Recipient address
 * @param {string} amount - Amount to send
 * @returns {Promise<string>} Transaction hash
 */
async function transferToken(privateKey, tokenAddress, toAddress, amount) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token decimals
    const decimals = await tokenContract.decimals();
    
    // Parse amount with correct decimals
    const parsedAmount = ethers.utils.parseUnits(amount, decimals);
    
    // Send transaction
    const tx = await tokenContract.transfer(toAddress, parsedAmount);
    await tx.wait();
    
    return tx.hash;
  } catch (error) {
    throw new Error(`Failed to transfer token: ${error.message}`);
  }
}

module.exports = {
  createWallet,
  importWalletFromPrivateKey,
  importWalletFromMnemonic,
  getBalance,
  getTokenBalance,
  transferMON,
  transferToken
};