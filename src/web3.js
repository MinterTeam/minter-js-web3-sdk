import Eth from 'web3-eth';
import Utils from 'web3-utils';
import Contract from 'web3-eth-contract';
import AbiCoder from 'web3-eth-abi';
import Big from 'minterjs-util/src/big.js';
import {ETHEREUM_API_URL, BSC_API_URL, ETHEREUM_CHAIN_ID, BSC_CHAIN_ID, NATIVE_COIN_ADDRESS, NETWORK_DATA} from './config.js';
import erc20ABI from './abi/erc20.js';
import hubABI from './abi/hub.js';
import wethAbi from './abi/weth.js';


export const web3Utils = Utils;
/** @deprecated use getProviderByChain instead */
export const web3Eth = new Eth(ETHEREUM_API_URL);
export const web3EthEth = new Eth(ETHEREUM_API_URL);
export const web3EthBsc = new Eth(BSC_API_URL);
export const web3Abi = AbiCoder;



const transactionPollingInterval = 5000;
[web3Eth, web3EthEth, web3EthBsc]
    .forEach((eth) => eth.transactionPollingInterval = transactionPollingInterval);

/**
 *
 * @param {object} abi
 * @return {(method: string, ...args: any[]) => string} abiMethodEncoder
 */
export function AbiMethodEncoder(abi) {
    const contract = new Contract(abi);
    return function abiMethodEncoder(method, ...args) {
        return contract.methods[method](...args).encodeABI();
    };
}

const WEI_DECIMALS = 18;
/**
 * @param {number|string} balance - balance in erc20 decimals
 * @param {number} [ercDecimals=18]
 * @return {string}
 */
export function fromErcDecimals(balance, ercDecimals = 18) {
    const decimalsDelta = Math.max(WEI_DECIMALS - ercDecimals, 0);
    balance = new Big(10).pow(decimalsDelta).times(balance).toFixed(0);
    return web3Utils.fromWei(balance.toString(), "ether");
}

/**
 * @param {number|string} balance
 * @param {number} [ercDecimals=18]
 * @return {string}
 */
export function toErcDecimals(balance, ercDecimals = 18) {
    balance = new Big(balance).toFixed(Number(ercDecimals));
    balance = web3Utils.toWei(balance.toString(), "ether");
    const decimalsDelta = Math.max(WEI_DECIMALS - ercDecimals, 0);
    const tens = new Big(10).pow(decimalsDelta);
    return new Big(balance).div(tens).toFixed(0);
}

/**
 * @typedef {import('web3-core').Transaction & import('web3-core').TransactionReceipt & {confirmations: number, timestamp: number}} Web3Tx
 */




let cachedBlock = {
    isLoading: false,
    timestamp: 0,
    providerHost: '',
    promise: null,
};

/**
 * @param {Eth} web3Eth
 * @return {Promise<number>}
 */
export function getBlockNumber(web3Eth) {
    const savedProviderHost = web3Eth.currentProvider.host;
    const isSameProviderHost = savedProviderHost === cachedBlock.providerHost;
    if (cachedBlock.isLoading && isSameProviderHost) {
        return cachedBlock.promise;
    }
    if (Date.now() - cachedBlock.timestamp < 5000 && isSameProviderHost) {
        return cachedBlock.promise;
    }

    const blockPromise = web3Eth.getBlockNumber();
    cachedBlock.isLoading = true;
    cachedBlock.providerHost = savedProviderHost;
    cachedBlock.promise = blockPromise;

    blockPromise
        .then(() => {
            // make sure response correspond to cache (in case of two parallel requests for different hosts)
            if (savedProviderHost === cachedBlock.providerHost) {
                cachedBlock.isLoading = false;
                cachedBlock.timestamp = Date.now();
            }
        })
        .catch((error) => {
            if (savedProviderHost === cachedBlock.providerHost) {
                cachedBlock.isLoading = false;
            }
            throw error;
        });

    return blockPromise;
}

// save promises forever if no error
const decimalsPromiseCache = {};

/**
 * @param {string} tokenContractAddress
 * @param {number} chainId
 * @param {(tokenContractAddress: string, chainId: number) => number} [customResolver]
 * @return {Promise<number>}
 */
export function getTokenDecimals(tokenContractAddress, chainId, customResolver) {
    if (!chainId) {
        return Promise.reject(new Error('chainId not specified'));
    }
    tokenContractAddress = tokenContractAddress.toLowerCase();
    // search from cache
    if (decimalsPromiseCache[chainId]?.[tokenContractAddress]) {
        return decimalsPromiseCache[chainId][tokenContractAddress];
    }

    if (typeof customResolver === 'function') {
        const found = customResolver(tokenContractAddress, chainId);
        if (typeof found === 'number' && found > 0) {
            return Promise.resolve(found);
        }
    }

    const currentEth = getProviderByChain(chainId);
    const contract = new currentEth.Contract(erc20ABI, tokenContractAddress);
    const decimalsPromise = contract.methods.decimals().call()
        .then((decimals) => {
            return Number(decimals);
        })
        .catch((error) => {
            console.log(error);
            delete decimalsPromiseCache[chainId][tokenContractAddress];
            return WEI_DECIMALS;
        });
    if (!decimalsPromiseCache[chainId]) {
        decimalsPromiseCache[chainId] = {};
    }
    decimalsPromiseCache[chainId][tokenContractAddress] = decimalsPromise;

    return decimalsPromise;
}

/**
 * @param {number} chainId
 * @param {string} tokenContractAddress
 * @param {string} accountAddress
 * @param {string} spenderContractAddress
 * @return {Promise<string>}
 */
export function getAllowance(chainId, tokenContractAddress, accountAddress, spenderContractAddress) {
    const web3Eth = getProviderByChain(chainId);
    return new web3Eth.Contract(erc20ABI, tokenContractAddress).methods.allowance(accountAddress, spenderContractAddress).call();
}

/**
 * @param {ChainId} chainId
 * @param {string} amount - in wei
 * @return {EvmTxParams}
 */
export function buildWethUnwrap(chainId, amount) {
    const wethContractAddress = getWrappedNativeContractAddress(chainId);
    if (!wethContractAddress) {
        throw new Error('Invalid chainId');
    }
    const data = AbiMethodEncoder(wethAbi)('withdraw', amount);
    return {
        to: wethContractAddress,
        data,
        value: 0,
    }
}

/**
 * @param {string} tokenContractAddress
 * @param {string} spenderContractAddress
 * @param {string|number|undefined} [amount] - in wei
 * @return {EvmTxParams}
 */
export function buildApproveTx(tokenContractAddress, spenderContractAddress, amount) {
    const amountToUnlock = typeof amount === 'undefined'
        ? '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        : amount;
    const data = AbiMethodEncoder(erc20ABI)('approve', spenderContractAddress, amountToUnlock);

    return {
        to: tokenContractAddress,
        data,
        value: '0',
    };
}

/**
 * @param {string} tokenContractAddress
 * @param {string} recipientAddress
 * @param {string} amount - in wei
 * @return {EvmTxParams}
 */
export function buildTransferTx(tokenContractAddress, recipientAddress, amount) {
    const data = AbiMethodEncoder(erc20ABI)('transfer', recipientAddress, amount);

    return {
        to: tokenContractAddress,
        data,
        value: '0',
    };
}

/**
 * @param {number} chainId
 * @param {string|undefined} tokenContractAddress
 * @param {number} tokenDecimals
 * @param {string} destinationMinterAddress
 * @param {string|number} amount - in ether or coins
 * @param {object} [options]
 * @param {boolean} [options.keepValueAsEther]
 * @return {EvmTxParams}
 */
export function buildDepositTx(chainId, tokenContractAddress, tokenDecimals, destinationMinterAddress, amount, {keepValueAsEther} = {}) {
    const hubBridgeContractAddress = NETWORK_DATA[chainId].hubBridgeContractAddress;
    const address = getHubDestinationAddressBytes(destinationMinterAddress);
    const destinationChain = getHubDestinationChainBytes();
    const isNativeToken = !tokenContractAddress;
    if (isNativeToken) {
        return {
            to: hubBridgeContractAddress,
            value: keepValueAsEther ? amount : toErcDecimals(amount, tokenDecimals),
            data: AbiMethodEncoder(hubABI)(
                'transferETHToChain',
                destinationChain,
                address,
                0,
            ),
        };
    } else {
        return {
            to: hubBridgeContractAddress,
            value: '0',
            data: AbiMethodEncoder(hubABI)(
                'transferToChain',
                tokenContractAddress,
                destinationChain,
                address,
                toErcDecimals(amount, tokenDecimals),
                0,
            ),
        };
    }
}

/**
 * @typedef {object} EvmTxParams
 * @property {string} to
 * @property {string|number} value
 * @property {string} data
 */

/**
 * @param {number} chainId
 * @param {string|undefined} tokenContractAddress
 * @param {number} tokenDecimals
 * @param {string} destinationMinterAddress
 * @param {string|number} amount - in ether or coins
 * @param {string} accountAddress
 * @return {Promise<Array<EvmTxParams>>}
 */
export async function buildDepositWithApproveTxList(chainId, tokenContractAddress, tokenDecimals, destinationMinterAddress, amount, accountAddress) {
    const depositTx = buildDepositTx(chainId, tokenContractAddress, tokenDecimals, destinationMinterAddress, amount);

    return await addApproveTx(tokenContractAddress, toErcDecimals(amount, tokenDecimals), depositTx, {
        chainIdForAllowanceCheck: chainId,
        accountAddressForAllowanceCheck: accountAddress,
        approveInfinite: true,
    });
}


/**
 * @template {EvmTxParams} T
 * @param {string} tokenContractAddress
 * @param {number|string|undefined} tokenAmount - in wei
 * @param {T} targetTx
 * @param {object} [options]
 * @param {ChainId} [options.chainIdForAllowanceCheck]
 * @param {string} [options.accountAddressForAllowanceCheck]
 * @param {boolean} [options.approveInfinite]
 * @return {Promise<[EvmTxParams?, T] | [T]>}
 */
export async function addApproveTx(tokenContractAddress, tokenAmount, targetTx, {chainIdForAllowanceCheck, accountAddressForAllowanceCheck, approveInfinite} = {}) {
    let approveTx;

    const isNativeToken = !tokenContractAddress || tokenContractAddress.toLowerCase() === NATIVE_COIN_ADDRESS;
    if (!isNativeToken) {
        const spenderContractAddress = targetTx.to;
        const canCheckAllowance = chainIdForAllowanceCheck && accountAddressForAllowanceCheck;
        const allowance = canCheckAllowance
            ? await getAllowance(chainIdForAllowanceCheck, tokenContractAddress, accountAddressForAllowanceCheck, spenderContractAddress)
            : 0;
        if (!allowance || new Big(allowance).lt(tokenAmount)) {
            approveTx = buildApproveTx(tokenContractAddress, spenderContractAddress, approveInfinite ? undefined : tokenAmount);
        }
    }

    return approveTx ? [approveTx, targetTx] : [targetTx];
}


/**
 * Calculate fee in native coin from gas price and gas limit
 * @param {number|string} gasPriceGwei
 * @param {number|string} gasLimit
 * @return {number|string}
 */
export function getFeeAmount(gasPriceGwei, gasLimit) {
    // gwei to ether
    const gasPrice = web3Utils.fromWei(web3Utils.toWei(gasPriceGwei.toString(), 'gwei'), 'ether');
    return new Big(gasPrice).times(gasLimit).toString();
}


/**
 * @param {ChainId} chainId
 * @return {Eth}
 */
export function getProviderByChain(chainId) {
    validateChainId(chainId);
    if (!chainId) {
        return web3Eth;
    }
    if (chainId === ETHEREUM_CHAIN_ID) {
        return web3EthEth;
    }
    if (chainId === BSC_CHAIN_ID) {
        return web3EthBsc;
    }
}





function validateChainId(chainId) {
    if (chainId && typeof chainId !== 'number') {
        throw new Error(`chainId should be a number`);
    }
}

/**
 * @param {string} destinationAddress
 * @return {Buffer}
 */
export function getHubDestinationAddressBytes(destinationAddress) {
    return Buffer.concat([Buffer.alloc(12), Buffer.from(web3Utils.hexToBytes(destinationAddress.replace("Mx", "0x")))]);
}

/**
 * @param {string} [chain='minter']
 * @return {Buffer}
 */
export function getHubDestinationChainBytes(chain = 'minter') {
    return Buffer.from(chain, 'utf-8');
}

/**
 * return WETH/WBNB address
 * @param {ChainId} chainId
 * @return {string|void}
 */
export function getWrappedNativeContractAddress(chainId) {
    return NETWORK_DATA[chainId]?.wrappedNativeContractAddress;
}

/**
 * @param {ChainId} chainId
 * @param {string} tokenContractAddress
 */
export function fixNativeContractAddress(chainId, tokenContractAddress) {
    tokenContractAddress = tokenContractAddress?.toLowerCase();
    const isNativeToken = tokenContractAddress === '0x0000000000000000000000000000000000000000'
        || tokenContractAddress === NATIVE_COIN_ADDRESS;

    if (isNativeToken) {
        return NATIVE_COIN_ADDRESS;
    } else {
        return tokenContractAddress;
    }
}

/**
 * @param {ChainId} chainId
 * @param {string} tokenContractAddress
 */
export function fixWrappedNativeContractAddress(chainId, tokenContractAddress) {
    tokenContractAddress = tokenContractAddress?.toLowerCase();
    const isWrappedNativeToken = tokenContractAddress === getWrappedNativeContractAddress(chainId);

    if (isWrappedNativeToken) {
        return NATIVE_COIN_ADDRESS;
    } else {
        return fixNativeContractAddress(chainId, tokenContractAddress);
    }
}
