import web3Utils from 'web3-utils';
import Contract from 'web3-eth-contract';
import Big from 'minterjs-util/src/big.js';
import erc20ABI from './abi/erc20.js';
import wethAbi from './abi/weth.js';


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

export const WEI_DECIMALS = 18;
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

