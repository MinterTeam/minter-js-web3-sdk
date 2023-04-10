# minter-js-web3-sdk

[![NPM Package](https://img.shields.io/npm/v/minter-js-web3-sdk.svg?style=flat-square)](https://www.npmjs.org/package/minterjs-util)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square&label=license)](https://github.com/MinterTeam/minter-js-web3-sdk/blob/master/LICENSE)

Please note that this package is under active development and is subject to change.

## Install

`npm install minter-js-web3-sdk`


## Usage

```js
// - calculation of smart-wallet address
// - methods to build, sign, and broadcast combined tx from multiple internal txs
import useWeb3SmartWallet from 'minter-js-web3-sdk/src/composables/use-web3-smartwallet.js';

// - calculates reward amount (in erc20 tokens or native coin) for relay service
// - build internal txs to swap erc20 token to native coin and send it to relay service as reward
import useWeb3SmartWalletWithRelayReward from 'minter-js-web3-sdk/src/composables/use-web3-smartwallet-relay-reward.js';

// swap tokens via 1inch, makes estimation and build internal swap tx
import useWeb3SmartWalletSwap from 'minter-js-web3-sdk/src/composables/use-web3-smartwallet-swap.js';
```


## Examples

Transfer ERC20 token and pay fee with it
https://github.com/MinterTeam/honee-app-web/blob/dev/components/ActionSendWeb3.vue

Swap via 1inch (spend on Minter and receive on Minter)
https://github.com/MinterTeam/honee-app-web/blob/master/components/ActionSwapWeb3.vue
