/**
 * Uniswap V2 utility functions for Monad Testnet Trading Bot
 */

const { ethers } = require('ethers');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider(process.env.MONAD_TESTNET_RPC);

// Contract addresses
const UNISWAP_V2_ROUTER_ADDRESS = process.env.UNISWAP_V2_ROUTER;
const WRAPPED_MON_ADDRESS = process.env.WRAPPED_MON;

// ABIs
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

const UNISWAP_V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const UNISWAP_V2_PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

/**
 * Get token information
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object>} Token information
 */
async function getTokenInfo(tokenAddress) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Get token details
    const [decimals, symbol, name] = await Promise.all([
      tokenContract.decimals(),
      tokenContract.symbol(),
      tokenContract.name()
    ]);
    
    return {
      address: tokenAddress,
      decimals,
      symbol,
      name
    };
  } catch (error) {
    throw new Error(`Failed to get token info: ${error.message}`);
  }
}

/**
 * Get token price in MON
 * @param {string} tokenAddress - The token contract address
 * @returns {Promise<Object>} Price information
 */
async function getTokenPrice(tokenAddress) {
  try {
    // Initialize router contract
    const routerContract = new ethers.Contract(
      UNISWAP_V2_ROUTER_ADDRESS,
      UNISWAP_V2_ROUTER_ABI,
      provider
    );
    
    // Get token info
    const tokenInfo = await getTokenInfo(tokenAddress);
    
    // Calculate price for 1 token
    const amountIn = ethers.utils.parseUnits('1', tokenInfo.decimals);
    const path = [tokenAddress, WRAPPED_MON_ADDRESS];
    
    const amounts = await routerContract.getAmountsOut(amountIn, path);
    const monAmount = ethers.utils.formatEther(amounts[1]);
    
    return {
      tokenSymbol: tokenInfo.symbol,
      tokenName: tokenInfo.name,
      priceInMON: monAmount
    };
  } catch (error) {
    throw new Error(`Failed to get token price: ${error.message}`);
  }
}

/**
 * Buy token with MON
 * @param {string} privateKey - Buyer's private key
 * @param {string} tokenAddress - Token contract address
 * @param {string} monAmount - Amount of MON to spend
 * @returns {Promise<string>} Transaction hash
 */
async function buyToken(privateKey, tokenAddress, monAmount) {
  try {
    // Initialize wallet and contracts
    const wallet = new ethers.Wallet(privateKey, provider);
    const routerContract = new ethers.Contract(
      UNISWAP_V2_ROUTER_ADDRESS,
      UNISWAP_V2_ROUTER_ABI,
      wallet
    );
    
    // Convert MON amount to wei
    const monAmountWei = ethers.utils.parseEther(monAmount);
    
    // Set up swap parameters
    const path = [WRAPPED_MON_ADDRESS, tokenAddress];
    const to = wallet.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
    
    // Calculate minimum amount out (with 5% slippage)
    const amounts = await routerContract.getAmountsOut(monAmountWei, path);
    const amountOutMin = amounts[1].mul(95).div(100); // 5% slippage
    
    // Execute swap
    const tx = await routerContract.swapExactETHForTokens(
      amountOutMin,
      path,
      to,
      deadline,
      { value: monAmountWei, gasLimit: 500000 }
    );
    
    await tx.wait();
    return tx.hash;
  } catch (error) {
    throw new Error(`Failed to buy token: ${error.message}`);
  }
}

/**
 * Sell token for MON
 * @param {string} privateKey - Seller's private key
 * @param {string} tokenAddress - Token contract address
 * @param {string} tokenAmount - Amount of token to sell
 * @returns {Promise<string>} Transaction hash
 */
async function sellToken(privateKey, tokenAddress, tokenAmount) {
  try {
    // Initialize wallet and contracts
    const wallet = new ethers.Wallet(privateKey, provider);
    const routerContract = new ethers.Contract(
      UNISWAP_V2_ROUTER_ADDRESS,
      UNISWAP_V2_ROUTER_ABI,
      wallet
    );
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token decimals
    const decimals = await tokenContract.decimals();
    
    // Convert token amount to wei
    const tokenAmountWei = ethers.utils.parseUnits(tokenAmount, decimals);
    
    // Check allowance and approve if needed
    const allowance = await tokenContract.allowance(wallet.address, UNISWAP_V2_ROUTER_ADDRESS);
    if (allowance.lt(tokenAmountWei)) {
      const approveTx = await tokenContract.approve(
        UNISWAP_V2_ROUTER_ADDRESS,
        ethers.constants.MaxUint256
      );
      await approveTx.wait();
    }
    
    // Set up swap parameters
    const path = [tokenAddress, WRAPPED_MON_ADDRESS];
    const to = wallet.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
    
    // Calculate minimum amount out (with 5% slippage)
    const amounts = await routerContract.getAmountsOut(tokenAmountWei, path);
    const amountOutMin = amounts[1].mul(95).div(100); // 5% slippage
    
    // Execute swap
    const tx = await routerContract.swapExactTokensForETH(
      tokenAmountWei,
      amountOutMin,
      path,
      to,
      deadline,
      { gasLimit: 500000 }
    );
    
    await tx.wait();
    return tx.hash;
  } catch (error) {
    throw new Error(`Failed to sell token: ${error.message}`);
  }
}

module.exports = {
  getTokenInfo,
  getTokenPrice,
  buyToken,
  sellToken
};