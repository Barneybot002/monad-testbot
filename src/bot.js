/**
 * Monad Testnet Trading Bot
 * A Telegram bot for buying and selling tokens on Monad testnet
 */

const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Import utilities
const walletUtils = require('./utils/walletUtils');
const uniswapUtils = require('./utils/uniswapUtils');
const monadScanUtils = require('./utils/monadScanUtils');
const { logger, ERROR_MESSAGES, asyncErrorHandler } = require('./utils/errorHandler');

// Load environment variables
dotenv.config();

// Check if bot token is set
if (!process.env.TELEGRAM_BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

// Initialize bot with polling
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Make bot globally available for error handler
global.bot = bot;

// Data storage
let userWallets = {};
let userSessions = {};

// Try to load existing wallets from file
try {
  const dataDir = path.join(__dirname, '../data');
  const walletsFile = path.join(dataDir, 'wallets.json');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (fs.existsSync(walletsFile)) {
    const data = fs.readFileSync(walletsFile, 'utf8');
    userWallets = JSON.parse(data);
    logger.info('Loaded existing wallets');
  }
} catch (error) {
  logger.error(`Failed to load wallets: ${error.message}`);
}

// Save wallets to file
function saveWallets() {
  try {
    const dataDir = path.join(__dirname, '../data');
    const walletsFile = path.join(dataDir, 'wallets.json');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(walletsFile, JSON.stringify(userWallets, null, 2));
  } catch (error) {
    logger.error(`Failed to save wallets: ${error.message}`);
  }
}

// Command handlers
const handleStart = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  await bot.sendMessage(
    chatId,
    `*Welcome to Monad Testnet Trading Bot!* 🚀\n\n` +
    `This bot helps you trade tokens on Monad Testnet using Uniswap V2.\n\n` +
    `Use /help to see available commands.`,
    { parse_mode: 'Markdown' }
  );
});

const handleHelp = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(
    chatId,
    `*Monad Testnet Trading Bot Commands:*\n\n` +
    `🚀 /start - Start the bot and see welcome message\n` +
    `🔐 /createwallet - Manage your wallet (create new or import existing)\n` +
    `👛 /mywallet - View your wallet details\n` +
    `💰 /balance - Check your MON and token balances\n` +
    `🛒 /buy - Buy tokens on Uniswap V2\n` +
    `💱 /sell - Sell tokens on Uniswap V2\n` +
    `❓ /help - Show this help message\n\n` +
    `💎 *Powered by Barney* 💎`,
    { parse_mode: 'Markdown' }
  );
});

const handleCreateWallet = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Create inline keyboard for wallet options
  const keyboard = {
    inline_keyboard: [
      [{ text: 'Create New Wallet', callback_data: 'create_wallet' }],
      [{ text: 'Import from Private Key', callback_data: 'import_private_key' }],
      [{ text: 'Import from Mnemonic', callback_data: 'import_mnemonic' }],
      [{ text: 'Cancel', callback_data: 'cancel' }]
    ]
  };
  
  // Clear any existing session
  userSessions[userId] = { state: 'WALLET_MENU' };
  
  await bot.sendMessage(
    chatId,
    '🔐 Please select an option:',
    { reply_markup: keyboard }
  );
});

const handleCreateNewWallet = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Create a new wallet
  const wallet = walletUtils.createWallet();
  
  // Store wallet data
  userWallets[userId] = wallet;
  saveWallets();
  
  // Send wallet info to user
  await bot.sendMessage(
    chatId,
    `✅ *New wallet created!*\n\n` +
    `*Address:* \`${wallet.address}\`\n\n` +
    `*Private Key:* \`${wallet.privateKey}\`\n\n` +
    `*Mnemonic:* \`${wallet.mnemonic}\`\n\n` +
    `⚠️ *IMPORTANT:* Save your private key and mnemonic phrase securely. Anyone with access to these can control your wallet.`,
    { parse_mode: 'Markdown' }
  );
});

const handleBalance = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  const address = userWallets[userId].address;
  
  // Send loading message
  const loadingMsg = await bot.sendMessage(chatId, 'Fetching balance information...');
  
  try {
    // Get MON balance
    const monBalance = await walletUtils.getBalance(address);
    
    // Format the balance message
    let balanceMessage = `*Wallet Balance*\n\n` +
                        `*Address:* \`${address}\`\n\n` +
                        `*MON:* ${monBalance} MON\n\n`;
    
    // Get ERC20 tokens from MonadScan API
    const tokens = await monadScanUtils.getWalletTokens(address);
    
    if (tokens && tokens.length > 0) {
      balanceMessage += '*ERC20 Tokens:*\n';
      
      for (const token of tokens) {
        balanceMessage += `\n*${token.symbol}*: ${token.balance} (${token.name})`;
      }
    } else {
      balanceMessage += '*No tokens found in this wallet*';
    }
    
    // Update the message
    await bot.editMessageText(
      balanceMessage,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `Error fetching balance: ${error.message}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      }
    );
  }
});

const handleBuy = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  // Check if wallet has enough MON
  const address = userWallets[userId].address;
  const monBalance = await walletUtils.getBalance(address);
  
  if (parseFloat(monBalance) <= 0) {
    await bot.sendMessage(
      chatId,
      `${ERROR_MESSAGES.INSUFFICIENT_BALANCE} Your balance: ${monBalance} MON`
    );
    return;
  }
  
  // Set session state
  userSessions[userId] = { state: 'BUY_TOKEN' };
  
  await bot.sendMessage(
    chatId,
    `Your MON balance: ${monBalance} MON\n\n` +
    `Please enter the contract address of the token you want to buy:`
  );
});

const handleSell = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  // Set session state
  userSessions[userId] = { state: 'SELL_TOKEN' };
  
  await bot.sendMessage(
    chatId,
    'Please enter the contract address of the token you want to sell:'
  );
});

// Function to handle contract address input without commands
const handleContractAddressInput = asyncErrorHandler(async (msg, tokenAddress) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  const address = userWallets[userId].address;
  
  // Send loading message
  const loadingMsg = await bot.sendMessage(chatId, 'Fetching token information...');
  
  try {
    // Get token info
    const tokenInfo = await uniswapUtils.getTokenInfo(tokenAddress);
    
    // Get additional token details from MonadScan API
    const tokenDetails = await monadScanUtils.getTokenDetails(tokenAddress);
    
    // Get token balance
    const tokenBalance = await walletUtils.getTokenBalance(address, tokenAddress);
    
    // Get MON balance
    const monBalance = await walletUtils.getBalance(address);
    
    // Format market cap and price info
    const marketCap = tokenDetails.marketCap ? `$${Number(tokenDetails.marketCap).toLocaleString()}` : 'Unknown';
    const price = tokenDetails.price ? `$${Number(tokenDetails.price).toLocaleString()}` : 'Unknown';
    
    // Format balance
    const formattedBalance = tokenBalance && tokenBalance.balance ? tokenBalance.balance : '0';
    
    // Create buy/sell/cancel buttons
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🛒 Buy', callback_data: `buy_token_${tokenAddress}` },
          { text: '💰 Sell', callback_data: `sell_token_${tokenAddress}` },
          { text: '❌ Cancel', callback_data: 'cancel' }
        ]
      ]
    };
    
    // Update message with token info and buttons
    await bot.editMessageText(
      `*Token found: ${tokenInfo.name} (${tokenInfo.symbol})*\n\n` +
      `💰 *Market Cap:* ${marketCap}\n` +
      `💲 *Price:* ${price}\n\n` +
      `*Your Balance:* ${formattedBalance} ${tokenInfo.symbol}\n` +
      `*Your MON:* ${monBalance} MON\n\n` +
      `What would you like to do with this token?`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `Error fetching token info: ${error.message}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      }
    );
  }
});

// Handle callback queries (button clicks)
bot.on('callback_query', asyncErrorHandler(async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;
  
  // Acknowledge the callback query
  await bot.answerCallbackQuery(query.id);
  
  // Handle refresh and sell token callbacks
  if (data.startsWith('refresh_')) {
    const tokenAddress = data.replace('refresh_', '');
    await handleRefreshToken(query, tokenAddress);
    return;
  }
  
  if (data.startsWith('sell_token_')) { // Handle sell token button
    const tokenAddress = data.replace('sell_token_', '');
    await handleSellToken(query, tokenAddress);
    return;
  }
  
  // Handle buy token button
  if (data.startsWith('buy_token_')) {
    const tokenAddress = data.replace('buy_token_', '');
    // Implement buy token button handler
    const userId = query.from.id.toString();
    
    // Set session state for buying this token
    userSessions[userId] = { 
      state: 'BUY_AMOUNT',
      tokenAddress,
      tokenInfo: await uniswapUtils.getTokenInfo(tokenAddress)
    };
    
    // Create inline keyboard for amount options
    const keyboard = {
      inline_keyboard: [
        [
          { text: '1 MON', callback_data: 'buy_1' },
          { text: '2 MON', callback_data: 'buy_2' },
          { text: '5 MON', callback_data: 'buy_5' }
        ],
        [
          { text: '10 MON', callback_data: 'buy_10' },
          { text: '50 MON', callback_data: 'buy_50' },
          { text: 'Custom', callback_data: 'buy_custom' }
        ],
        [{ text: 'Cancel', callback_data: 'cancel' }]
      ]
    };
    
    await bot.sendMessage(
      chatId,
      `Token: ${userSessions[userId].tokenInfo.symbol} (${userSessions[userId].tokenInfo.name})\n` +
      `Address: ${tokenAddress}\n\n` +
      `How much MON do you want to spend?`,
      { reply_markup: keyboard }
    );
    return;
  }
  
  // Handle sell token button
  if (data.startsWith('sell_token_')) {
    const tokenAddress = data.replace('sell_token_', '');
    const userId = query.from.id.toString();
    const address = userWallets[userId].address;
    
    try {
      // Get token info and balance
      const tokenInfo = await uniswapUtils.getTokenInfo(tokenAddress);
      const tokenBalance = await walletUtils.getTokenBalance(address, tokenAddress);
      
      // Check if user has any tokens
      if (parseFloat(tokenBalance.balance) <= 0) {
        await bot.sendMessage(
          chatId,
          `You don't have any ${tokenInfo.symbol} tokens to sell.`
        );
        return;
      }
      
      // Store in session
      userSessions[userId] = {
        state: 'SELL_AMOUNT',
        tokenAddress,
        tokenInfo,
        tokenBalance: tokenBalance.balance
      };
      
      // Create inline keyboard for amount options
      const keyboard = {
        inline_keyboard: [
          [
            { text: '25%', callback_data: 'sell_25' },
            { text: '50%', callback_data: 'sell_50' },
            { text: '75%', callback_data: 'sell_75' }
          ],
          [
            { text: '100%', callback_data: 'sell_100' },
            { text: 'Custom', callback_data: 'sell_custom' }
          ],
          [{ text: 'Cancel', callback_data: 'cancel' }]
        ]
      };
      
      await bot.sendMessage(
        chatId,
        `Token: ${tokenInfo.symbol} (${tokenInfo.name})\n` +
        `Balance: ${tokenBalance.balance} ${tokenInfo.symbol}\n\n` +
        `How much do you want to sell?`,
        { reply_markup: keyboard }
      );
    } catch (error) {
      await bot.sendMessage(
        chatId,
        `Error fetching token info: ${error.message}`
      );
    }
    return;
  }
  
  // Handle different button actions
  switch (data) {
    case 'wallet':
      await handleCreateWallet({ chat: { id: chatId }, from: { id: userId } });
      break;
      
    case 'mywallet':
      await handleMyWalletImplementation({ chat: { id: chatId }, from: { id: userId } });
      break;
      
    case 'balance':
      await handleBalance({ chat: { id: chatId }, from: { id: userId } });
      break;
      
    case 'buy':
      await handleBuy({ chat: { id: chatId }, from: { id: userId } });
      break;
      
    case 'sell':
      await handleSell({ chat: { id: chatId }, from: { id: userId } });
      break;
      
    case 'help':
      await handleHelp({ chat: { id: chatId } });
      break;
      
    case 'create_wallet':
      await handleCreateNewWallet({ chat: { id: chatId }, from: { id: userId } });
      break;
      
    case 'show_private_key':
      if (userWallets[userId]) {
        await bot.sendMessage(
          chatId,
          `*Your Private Key:*\n\n\`${userWallets[userId].privateKey}\`\n\n⚠️ *NEVER share this with anyone!*`,
          { parse_mode: 'Markdown' }
        );
      }
      break;
      
    case 'delete_wallet':
      if (userWallets[userId]) {
        delete userWallets[userId];
        saveWallets();
        await bot.sendMessage(
          chatId,
          '✅ Your wallet has been deleted from this bot.'
        );
      }
      break;
      
    case 'import_private_key':
      userSessions[userId] = { state: 'IMPORT_PRIVATE_KEY' };
      await bot.sendMessage(chatId, 'Please enter your private key:');
      break;
      
    case 'import_mnemonic':
      userSessions[userId] = { state: 'IMPORT_MNEMONIC' };
      await bot.sendMessage(chatId, 'Please enter your mnemonic phrase:');
      break;
      
    case 'cancel':
      delete userSessions[userId];
      await bot.sendMessage(chatId, 'Operation cancelled.');
      break;
      
    // Buy amount options
    case 'buy_1':
    case 'buy_2':
    case 'buy_5':
    case 'buy_10':
    case 'buy_50':
    case 'buy_custom':
      await handleBuyAmountChoice(query);
      break;
      
    // Sell amount options
    case 'sell_25':
    case 'sell_50':
    case 'sell_75':
    case 'sell_100':
    case 'sell_custom':
      await handleSellAmountChoice(query);
      break;
      
    // Confirmation
    case 'confirm_buy':
      await handleConfirmBuy(query);
      break;
      
    case 'confirm_sell':
      await handleConfirmSell(query);
      break;
  }
}));

// Handle text messages
bot.on('message', asyncErrorHandler(async (msg) => {
  // Skip if not a text message or is a command
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text.trim();
  
  // Check if text is a contract address (even without active session)
  if (text.match(/^0x[a-fA-F0-9]{40}$/)) {
    // Check if user has a wallet
    if (!userWallets[userId]) {
      await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
      return;
    }
    
    // If no active session, show token details with buy/sell buttons
    if (!userSessions[userId] || !userSessions[userId].state) {
      await handleContractAddressInput(msg, text);
      return;
    }
    
    // If there's an active session, process according to the state
    if (userSessions[userId].state === 'BUY_TOKEN') {
      await handleBuyTokenAddress(msg);
      return;
    } else if (userSessions[userId].state === 'SELL_TOKEN') {
      await handleSellTokenAddress(msg);
      return;
    }
    
    // For any other state, show token details with buy/sell buttons
    await handleContractAddressInput(msg, text);
    return;
  }
  
  // Check if user has an active session
  if (!userSessions[userId]) return;
  
  const session = userSessions[userId];
  
  switch (session.state) {
    case 'IMPORT_PRIVATE_KEY':
      await handleImportPrivateKey(msg);
      break;
      
    case 'IMPORT_MNEMONIC':
      await handleImportMnemonic(msg);
      break;
      
    case 'BUY_TOKEN':
      await handleBuyTokenAddress(msg);
      break;
      
    case 'BUY_CUSTOM_AMOUNT':
      await handleBuyCustomAmount(msg);
      break;
      
    case 'SELL_TOKEN':
      await handleSellTokenAddress(msg);
      break;
      
    case 'SELL_CUSTOM_AMOUNT':
      await handleSellCustomAmount(msg);
      break;
  }
}));

// Additional handler implementations
const handleImportPrivateKey = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const privateKey = msg.text.trim();
  
  try {
    // Import wallet from private key
    const wallet = walletUtils.importWalletFromPrivateKey(privateKey);
    
    // Store wallet data
    userWallets[userId] = wallet;
    saveWallets();
    
    // Clear session
    delete userSessions[userId];
    
    // Send wallet info to user
    await bot.sendMessage(
      chatId,
      `✅ *Wallet imported successfully!*\n\n` +
      `*Address:* \`${wallet.address}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.INVALID_PRIVATE_KEY);
  }
});

const handleImportMnemonic = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const mnemonic = msg.text.trim();
  
  try {
    // Import wallet from mnemonic
    const wallet = walletUtils.importWalletFromMnemonic(mnemonic);
    
    // Store wallet data
    userWallets[userId] = wallet;
    saveWallets();
    
    // Clear session
    delete userSessions[userId];
    
    // Send wallet info to user
    await bot.sendMessage(
      chatId,
      `✅ *Wallet imported successfully!*\n\n` +
      `*Address:* \`${wallet.address}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.INVALID_MNEMONIC);
  }
});

const handleBuyTokenAddress = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const tokenAddress = msg.text.trim();
  
  // Validate address format
  if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.INVALID_ADDRESS);
    return;
  }
  
  // If user is in BUY_TOKEN state, proceed with buying
  if (userSessions[userId] && userSessions[userId].state === 'BUY_TOKEN') {
    // Send loading message
    const loadingMsg = await bot.sendMessage(chatId, 'Fetching token information...');
    
    try {
      // Get token info
      const tokenInfo = await uniswapUtils.getTokenInfo(tokenAddress);
      
      // Store in session
      userSessions[userId] = {
        state: 'BUY_AMOUNT',
        tokenAddress,
        tokenInfo
      };
      
      // Create inline keyboard for amount options
      const keyboard = {
        inline_keyboard: [
          [
            { text: '1 MON', callback_data: 'buy_1' },
            { text: '2 MON', callback_data: 'buy_2' },
            { text: '5 MON', callback_data: 'buy_5' }
          ],
          [
            { text: '10 MON', callback_data: 'buy_10' },
            { text: '50 MON', callback_data: 'buy_50' },
          { text: 'Custom', callback_data: 'buy_custom' }
        ],
        [{ text: 'Cancel', callback_data: 'cancel' }]
      ]
    };
    
    // Update message
    await bot.editMessageText(
      `Token: ${tokenInfo.symbol} (${tokenInfo.name})\n` +
      `Address: ${tokenAddress}\n\n` +
      `How much MON do you want to spend?`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        reply_markup: keyboard
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `Error fetching token info: ${error.message}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      }
    );
  }
  } else {
    // If not in BUY_TOKEN state, show token details with buy/sell buttons
    await handleContractAddressInput(msg, tokenAddress);
  }
});

const handleBuyAmountChoice = asyncErrorHandler(async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;
  
  // Get session data
  const session = userSessions[userId];
  if (!session || session.state !== 'BUY_AMOUNT') return;
  
  if (data === 'buy_custom') {
    // Ask for custom amount
    userSessions[userId].state = 'BUY_CUSTOM_AMOUNT';
    await bot.sendMessage(chatId, 'Please enter the amount of MON you want to spend:');
    return;
  }
  
  // Parse amount from callback data
  const amount = data.split('_')[1];
  
  // Store amount in session
  userSessions[userId].monAmount = amount;
  
  // Create confirmation keyboard
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: 'confirm_buy' },
        { text: '❌ Cancel', callback_data: 'cancel' }
      ]
    ]
  };
  
  await bot.sendMessage(
    chatId,
    `You are about to buy ${session.tokenInfo.symbol} with ${amount} MON.\n\n` +
    `Do you want to proceed?`,
    { reply_markup: keyboard }
  );
});

const handleBuyCustomAmount = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text.trim();
  
  // Validate amount
  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.INVALID_AMOUNT);
    return;
  }
  
  // Get session data
  const session = userSessions[userId];
  if (!session || session.state !== 'BUY_CUSTOM_AMOUNT') return;
  
  // Check if user has enough balance
  const address = userWallets[userId].address;
  const monBalance = await walletUtils.getBalance(address);
  
  if (parseFloat(monBalance) < amount) {
    await bot.sendMessage(
      chatId,
      `${ERROR_MESSAGES.INSUFFICIENT_BALANCE} Your balance: ${monBalance} MON`
    );
    return;
  }
  
  // Store amount in session
  userSessions[userId].state = 'BUY_AMOUNT';
  userSessions[userId].monAmount = amount.toString();
  
  // Create confirmation keyboard
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: 'confirm_buy' },
        { text: '❌ Cancel', callback_data: 'cancel' }
      ]
    ]
  };
  
  await bot.sendMessage(
    chatId,
    `You are about to buy ${session.tokenInfo.symbol} with ${amount} MON.\n\n` +
    `Do you want to proceed?`,
    { reply_markup: keyboard }
  );
});

const handleConfirmBuy = asyncErrorHandler(async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  
  // Get session data
  const session = userSessions[userId];
  if (!session) return;
  
  const tokenAddress = session.tokenAddress;
  const tokenInfo = session.tokenInfo;
  const monAmount = session.monAmount;
  const privateKey = userWallets[userId].privateKey;
  
  // Send processing message
  const processingMsg = await bot.sendMessage(
    chatId,
    `Processing your purchase of ${tokenInfo.symbol}...\n` +
    `Amount: ${monAmount} MON\n\n` +
    `Please wait, this may take a moment.`
  );
  
  try {
    // Execute the buy transaction
    const txHash = await uniswapUtils.buyToken(privateKey, tokenAddress, monAmount);
    
    // Format success message with transaction link
    const successText = 
      `✅ *Purchase Successful!*\n\n` +
      `Bought ${tokenInfo.symbol} for ${monAmount} MON\n\n` +
      `[View Transaction](https://explorer.monad.xyz/testnet/tx/${txHash})`;
    
    await bot.editMessageText(
      successText,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
    
    // Wait 1 second before sending token details message
    setTimeout(async () => {
      try {
        // Get updated token balance
        const address = userWallets[userId].address;
        const tokenBalance = await walletUtils.getTokenBalance(address, tokenAddress);
        
        // Get token details from MonadScan API
        const tokenDetails = await monadScanUtils.getTokenDetails(tokenAddress);
        
        // Format market cap and price info
        const marketCap = tokenDetails.marketCap ? `$${Number(tokenDetails.marketCap).toLocaleString()}` : 'Unknown';
        const price = tokenDetails.price ? `$${Number(tokenDetails.price).toLocaleString()}` : 'Unknown';
        
        // Create refresh and sell buttons
        const keyboard = {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: `refresh_${tokenAddress}` },
              { text: '💰 Sell', callback_data: `sell_${tokenAddress}` }
            ]
          ]
        };
        
        // Format balance
        const formattedBalance = tokenBalance && tokenBalance.balance ? tokenBalance.balance : '0';
        
        // Send token details message with buttons
        await bot.sendMessage(
          chatId,
          `*${tokenInfo.name} (${tokenInfo.symbol}) Details*\n\n` +
          `💰 *Market Cap:* ${marketCap}\n` +
          `💲 *Price:* ${price}\n\n` +
          `*Your Balance:* ${formattedBalance} ${tokenInfo.symbol}`,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      } catch (error) {
        console.error('Error sending token details:', error);
      }
    }, 1000);
  } catch (error) {
    const errorText = `❌ Transaction failed: ${error.message}`;
    await bot.editMessageText(
      errorText,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
  }
  
  // Clear session
  delete userSessions[userId];
});

const handleSellTokenAddress = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const tokenAddress = msg.text.trim();
  
  // Validate address format
  if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.INVALID_ADDRESS);
    return;
  }
  
  // If user is in SELL_TOKEN state, proceed with selling
  if (userSessions[userId] && userSessions[userId].state === 'SELL_TOKEN') {
    // Send loading message
    const loadingMsg = await bot.sendMessage(chatId, 'Fetching token information...');
    
    try {
      // Get token info and balance
      const address = userWallets[userId].address;
      const tokenInfo = await uniswapUtils.getTokenInfo(tokenAddress);
      const tokenBalance = await walletUtils.getTokenBalance(address, tokenAddress);
      
      // Check if user has any tokens
      if (parseFloat(tokenBalance.balance) <= 0) {
        await bot.editMessageText(
          `You don't have any ${tokenInfo.symbol} tokens to sell.`,
          {
            chat_id: chatId,
            message_id: loadingMsg.message_id
          }
        );
        return;
      }
      
      // Store in session
      userSessions[userId] = {
        state: 'SELL_AMOUNT',
        tokenAddress,
        tokenInfo,
        tokenBalance: tokenBalance.balance
      };
      
      // Create inline keyboard for amount options
      const keyboard = {
        inline_keyboard: [
          [
            { text: '25%', callback_data: 'sell_25' },
            { text: '50%', callback_data: 'sell_50' },
            { text: '75%', callback_data: 'sell_75' }
          ],
          [
            { text: '100%', callback_data: 'sell_100' },
            { text: 'Custom', callback_data: 'sell_custom' }
          ],
          [{ text: 'Cancel', callback_data: 'cancel' }]
        ]
      };
      
      // Update message
      await bot.editMessageText(
        `Token: ${tokenInfo.symbol} (${tokenInfo.name})\n` +
        `Balance: ${tokenBalance.balance} ${tokenInfo.symbol}\n\n` +
        `How much do you want to sell?`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: keyboard
        }
      );
    } catch (error) {
      await bot.editMessageText(
        `Error fetching token info: ${error.message}`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id
        }
      );
    }
  } else {
    // If not in SELL_TOKEN state, show token details with buy/sell buttons
    await handleContractAddressInput(msg, tokenAddress);
  }
});

const handleSellAmountChoice = asyncErrorHandler(async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;
  
  // Get session data
  const session = userSessions[userId];
  if (!session || session.state !== 'SELL_AMOUNT') return;
  
  if (data === 'sell_custom') {
    // Ask for custom amount
    userSessions[userId].state = 'SELL_CUSTOM_AMOUNT';
    await bot.sendMessage(
      chatId,
      `Please enter the amount of ${session.tokenInfo.symbol} you want to sell (max: ${session.tokenBalance}):`
    );
    return;
  }
  
  // Parse percentage from callback data
  const percentage = parseInt(data.split('_')[1]);
  const totalBalance = parseFloat(session.tokenBalance);
  const amount = (totalBalance * percentage / 100).toFixed(6);
  
  // Store amount in session
  userSessions[userId].tokenAmount = amount;
  
  // Create confirmation keyboard
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: 'confirm_sell' },
        { text: '❌ Cancel', callback_data: 'cancel' }
      ]
    ]
  };
  
  await bot.sendMessage(
    chatId,
    `You are about to sell ${amount} ${session.tokenInfo.symbol} (${percentage}% of your balance).\n\n` +
    `Do you want to proceed?`,
    { reply_markup: keyboard }
  );
});

const handleSellCustomAmount = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text.trim();
  
  // Validate amount
  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.INVALID_AMOUNT);
    return;
  }
  
  // Get session data
  const session = userSessions[userId];
  if (!session || session.state !== 'SELL_CUSTOM_AMOUNT') return;
  
  // Check if amount is valid
  const totalBalance = parseFloat(session.tokenBalance);
  if (amount > totalBalance) {
    await bot.sendMessage(
      chatId,
      `${ERROR_MESSAGES.INSUFFICIENT_BALANCE} Your balance: ${totalBalance} ${session.tokenInfo.symbol}`
    );
    return;
  }
  
  // Store amount in session
  userSessions[userId].state = 'SELL_AMOUNT';
  userSessions[userId].tokenAmount = amount.toString();
  
  // Create confirmation keyboard
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: 'confirm_sell' },
        { text: '❌ Cancel', callback_data: 'cancel' }
      ]
    ]
  };
  
  await bot.sendMessage(
    chatId,
    `You are about to sell ${amount} ${session.tokenInfo.symbol}.\n\n` +
    `Do you want to proceed?`,
    { reply_markup: keyboard }
  );
});

const handleConfirmSell = asyncErrorHandler(async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  
  // Get session data
  const session = userSessions[userId];
  if (!session) return;
  
  const tokenAddress = session.tokenAddress;
  const tokenInfo = session.tokenInfo;
  const tokenAmount = session.tokenAmount;
  const privateKey = userWallets[userId].privateKey;
  
  // Send processing message
  const processingMsg = await bot.sendMessage(
    chatId,
    `Processing your sale of ${tokenAmount} ${tokenInfo.symbol}...\n\n` +
    `Please wait, this may take a moment.`
  );
  
  try {
    // Execute the sell transaction
    const txHash = await uniswapUtils.sellToken(privateKey, tokenAddress, tokenAmount);
    
    // Format success message with transaction link
    const successText = 
      `✅ *Sale Successful!*\n\n` +
      `Sold ${tokenAmount} ${tokenInfo.symbol} for MON\n\n` +
      `[View Transaction](https://explorer.monad.xyz/testnet/tx/${txHash})`;
    
    await bot.editMessageText(
      successText,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    const errorText = `❌ Transaction failed: ${error.message}`;
    await bot.editMessageText(
      errorText,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
  }
  
  // Clear session
  delete userSessions[userId];
});

// Add new handler for /mywallet command
const handleMyWallet = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  const address = userWallets[userId].address;
  
  // Send loading message
  const loadingMsg = await bot.sendMessage(chatId, 'Fetching wallet information...');
  
  try {
    // Get MON balance
    const monBalance = await walletUtils.getBalance(address);
    
    // Create inline keyboard with options
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Show Private Key', callback_data: 'show_private_key' }],
        [{ text: 'Delete Wallet', callback_data: 'delete_wallet' }]
      ]
    };
    
    // Format the wallet message
    let walletMessage = `*Your Wallet*\n\n` +
                       `*Address:* \`${address}\`\n\n` +
                       `*MON Balance:* ${monBalance} MON\n\n`;
    
    // Try to get token balances (this would be expanded in a real implementation)
    // For now, we'll just show MON balance
    walletMessage += '*No tokens found in this wallet*';
    
    // Update the message
    await bot.editMessageText(
      walletMessage,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `Error fetching wallet information: ${error.message}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      }
    );
  }
});

// Implementation for handleMyWallet function
const handleMyWalletImplementation = asyncErrorHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  const address = userWallets[userId].address;
  
  // Send loading message
  const loadingMsg = await bot.sendMessage(chatId, 'Fetching wallet information...');
  
  try {
    // Get MON balance
    const monBalance = await walletUtils.getBalance(address);
    
    // Create inline keyboard with show private key and delete wallet buttons
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔑 Show Private Key', callback_data: 'show_private_key' }],
        [{ text: '🗑️ Delete Wallet', callback_data: 'delete_wallet' }]
      ]
    };
    
    // Format the wallet message
    let walletMessage = `👛 *Your Wallet*\n\n` +
                       `*Address:* \`${address}\`\n\n` +
                       `*MON Balance:* ${monBalance} MON\n\n`;
    
    // Update the message
    await bot.editMessageText(
      walletMessage,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `Error fetching wallet information: ${error.message}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      }
    );
  }
});

// Handle refresh token button
const handleRefreshToken = asyncErrorHandler(async (query, tokenAddress) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  const address = userWallets[userId].address;
  
  // Send loading message
  const loadingMsg = await bot.sendMessage(chatId, 'Refreshing token information...');
  
  try {
    // Get token info
    const tokenInfo = await uniswapUtils.getTokenInfo(tokenAddress);
    
    // Get token balance
    const tokenBalance = await walletUtils.getTokenBalance(address, tokenAddress);
    
    // Get token details from MonadScan API
    const tokenDetails = await monadScanUtils.getTokenDetails(tokenAddress);
    
    // Format market cap and price info
    const marketCap = tokenDetails.marketCap ? `$${Number(tokenDetails.marketCap).toLocaleString()}` : 'Unknown';
    const price = tokenDetails.price ? `$${Number(tokenDetails.price).toLocaleString()}` : 'Unknown';
    
    // Create refresh and sell buttons
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: `refresh_${tokenAddress}` },
          { text: '💰 Sell', callback_data: `sell_${tokenAddress}` }
        ]
      ]
    };
    
    // Format balance
    const formattedBalance = tokenBalance && tokenBalance.balance ? tokenBalance.balance : '0';
    
    // Delete loading message
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    
    // Send token details message with buttons
    await bot.sendMessage(
      chatId,
      `*${tokenInfo.name} (${tokenInfo.symbol}) Details*\n\n` +
      `💰 *Market Cap:* ${marketCap}\n` +
      `💲 *Price:* ${price}\n\n` +
      `*Your Balance:* ${formattedBalance} ${tokenInfo.symbol}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  } catch (error) {
    await bot.editMessageText(
      `Error refreshing token information: ${error.message}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      }
    );
  }
});

// Handle sell token button
const handleSellToken = asyncErrorHandler(async (query, tokenAddress) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  
  // Check if user has a wallet
  if (!userWallets[userId]) {
    await bot.sendMessage(chatId, ERROR_MESSAGES.WALLET_NOT_FOUND);
    return;
  }
  
  // Get token info and balance
  const address = userWallets[userId].address;
  
  try {
    const tokenInfo = await uniswapUtils.getTokenInfo(tokenAddress);
    const tokenBalance = await walletUtils.getTokenBalance(address, tokenAddress);
    
    // Check if user has any tokens
    if (parseFloat(tokenBalance.balance) <= 0) {
      await bot.sendMessage(
        chatId,
        `You don't have any ${tokenInfo.symbol} tokens to sell.`
      );
      return;
    }
    
    // Store in session
    userSessions[userId] = {
      state: 'SELL_AMOUNT',
      tokenAddress,
      tokenInfo,
      tokenBalance: tokenBalance.balance
    };
    
    // Create inline keyboard for amount options
    const keyboard = {
      inline_keyboard: [
        [
          { text: '25%', callback_data: 'sell_25' },
          { text: '50%', callback_data: 'sell_50' },
          { text: '75%', callback_data: 'sell_75' }
        ],
        [
          { text: '100%', callback_data: 'sell_100' },
          { text: 'Custom', callback_data: 'sell_custom' }
        ],
        [{ text: 'Cancel', callback_data: 'cancel' }]
      ]
    };
    
    await bot.sendMessage(
      chatId,
      `Token: ${tokenInfo.symbol} (${tokenInfo.name})\n` +
      `Balance: ${tokenBalance.balance} ${tokenInfo.symbol}\n\n` +
      `How much do you want to sell?`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `Error fetching token info: ${error.message}`
    );
  }
});

// Add command handlers
bot.onText(/\/start/, handleStart);
bot.onText(/\/help/, handleHelp);
bot.onText(/\/createwallet/, handleCreateWallet);
bot.onText(/\/create_wallet/, handleCreateNewWallet);
bot.onText(/\/mywallet/, handleMyWallet);
bot.onText(/\/balance/, handleBalance);
bot.onText(/\/buy/, handleBuy);
bot.onText(/\/sell/, handleSell);

// Log startup
logger.info('Monad Testnet Trading Bot started');
console.log('Monad Testnet Trading Bot is running...');