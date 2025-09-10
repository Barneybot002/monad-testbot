# Monad Testnet Trading Bot

A Telegram bot for buying and selling tokens on the Monad testnet using Uniswap V2.

## Features

- Create and manage Ethereum wallets
- Check token balances on Monad testnet
- Buy tokens via Uniswap V2 on Monad testnet
- Sell tokens for MON
- User-friendly inline keyboard interface
- Error handling and logging

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Telegram Bot Token (from BotFather)

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

or

```bash
yarn install
```

3. Configure your environment variables in the `.env` file:

```
# Replace with your actual bot token from BotFather
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Other variables are pre-configured for Monad testnet
MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz
CHAIN_ID=10143
UNISWAP_V2_ROUTER=0xfb8e1c3b833f9e67a71c859a132cf783b645e436
WRAPPED_MON=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701
```

### Running the Bot

```bash
npm start
```

or

```bash
yarn start
```

For development mode with auto-restart on file changes:

```bash
npm run dev
```

## Bot Commands

- `/start` - Start the bot and see the welcome message
- `/wallet` - Manage your wallet (create or import)
- `/create_wallet` - Create a new wallet directly
- `/balance` - Check your token balances
- `/buy` - Buy tokens on Monad testnet
- `/sell` - Sell tokens on Monad testnet
- `/help` - Show help message

## Getting a Bot Token

1. Open Telegram and search for `@BotFather`
2. Start a chat with BotFather and send `/newbot`
3. Follow the instructions to create a new bot
4. Once created, BotFather will provide you with a token
5. Copy this token and paste it in your `.env` file, replacing `your_bot_token_here` with your actual token:

```
TELEGRAM_BOT_TOKEN=your_actual_token_here
```

## Important Notes

- This bot is for educational purposes and testing on the Monad testnet
- Never share your private keys with anyone
- In a production environment, you should use a proper database to store user data

## Project Structure

```
├── data/                  # Data storage (wallets)
├── src/
│   ├── bot.js            # Main bot implementation
│   ├── index.js          # Entry point
│   └── utils/
│       ├── errorHandler.js  # Error handling utilities
│       ├── walletUtils.js   # Wallet management utilities
│       └── uniswapUtils.js  # Uniswap interaction utilities
├── .env                  # Environment variables
├── package.json          # Project dependencies
└── README.md            # This file
```

## Monad Testnet Information

- RPC URL: https://testnet-rpc.monad.xyz
- Chain ID: 10143
- Uniswap V2 Router: 0xfb8e1c3b833f9e67a71c859a132cf783b645e436
- Wrapped MON (WMON): 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701