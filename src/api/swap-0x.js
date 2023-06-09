import axios from 'axios';
import {Cache, cacheAdapterEnhancer} from 'axios-extensions';
import Big from 'minterjs-util/src/big.js';
import {getMaxEstimationLimit, getMinEstimationLimit} from 'minterjs-util/src/swap-limit.js';
import {config, NATIVE_COIN_ADDRESS, ZERO_EX_ETHEREUM_API_URL, ZERO_EX_BSC_API_URL} from '../config.js';
import {buildApproveTx, getAllowance} from '../web3.js';
import {getDefaultAdapter} from '../utils/axios-default-adapter.js';


const ZERO_EX_API_URL_LIST = {
    1: ZERO_EX_ETHEREUM_API_URL,
    56: ZERO_EX_BSC_API_URL,
};


const instance = axios.create({
    // baseURL: ZERO_EX_API_URL,
    adapter: cacheAdapterEnhancer(getDefaultAdapter(), { enabledByDefault: false}),
});

// exclude RFQ liquidity (it is considered not stable and can be expired during long smart-wallet withdrawals)
const EXCLUDE_PROTOCOLS = '0x';

/**
 * @param {number|string} chainId
 * @param {ZeroExSwapParams} swapParams
 * @return {Promise<ZeroExSwapResponse>}
 */
function _buildTxForSwap(chainId, swapParams) {
    swapParams = {
        ...swapParams,
        excludedSources: EXCLUDE_PROTOCOLS,
    };
    return instance.get('swap/v1/quote', {
        baseURL: ZERO_EX_API_URL_LIST[chainId],
        params: swapParams,
        headers: {
            '0x-api-key': config.ZERO_EX_API_KEY,
        },
    })
        .then((response) => {
            return response.data;
        });
}

/**
 * @param {number} chainId
 * @param {ZeroExSwapParams&{receiver?: string}} swapParams
 * @return {Promise<{txList: Array<OneInchTx|EvmTxParams>, swapLimit: string}>}
 */
export async function buildTxForSwap(chainId, swapParams) {
    const txList = [];

    // swap
    const swapTx = await _buildTxForSwap(chainId, swapParams);
    // if (swapParams.sellAmount) {
    //     response.data.minBuyAmount = calculateEstimationLimit(swapParams, swapTx);
    // } else {
    //     response.data.maxSellAmount = calculateEstimationLimit(swapParams, swapTx);
    // }
    const swapLimit = calculateEstimationLimit(swapParams, swapTx);
    const maxSellAmount = swapParams.sellAmount ? swapParams.sellAmount : swapLimit;

    // allowance
    if (swapParams.sellToken !== NATIVE_COIN_ADDRESS) {
        // @TODO maybe just approve sell amount instead of infinite
        const allowance = await getAllowance(chainId, swapParams.sellToken, swapParams.takerAddress, swapTx.allowanceTarget);
        if (new Big(allowance).lt(maxSellAmount)) {
            txList.push(buildApproveTx(swapParams.sellToken, swapTx.allowanceTarget));
        }
    }

    txList.push(swapTx);
    if (swapParams.receiver) {
        txList.push({
            to: swapParams.receiver,
            //@TODO if buyToken is erc20 token use transferToken method of erc20 contract (now only works with native coin)
            value: swapTx.buyAmount,
            data: '0x',
        });
    }

    return {
        swapLimit,
        txList,
    };
}

const fastCache = new Cache({ttl: 5 * 1000, max: 100});

/**
 * @param {number|string} chainId
 * @param {ZeroExSwapParams} swapParams
 * @return {Promise<ZeroExPriceResponse>}
 */
function getPrice(chainId, swapParams) {
    swapParams = {
        ...swapParams,
        excludedSources: EXCLUDE_PROTOCOLS,
    };
    return instance.get('swap/v1/price', {
            baseURL: ZERO_EX_API_URL_LIST[chainId],
            params: swapParams,
            cache: fastCache,
            headers: {
                '0x-api-key': config.ZERO_EX_API_KEY,
            },
        })
        .then((response) => {
            return response.data;
        });
}

/**
 * @param {number} chainId
 * @param {ZeroExSwapParams} swapParams
 * @return {Promise<string|number>}
 */
export function getEstimationLimit(chainId, swapParams) {
    return getPrice(chainId, swapParams)
        .then((priceData) => {
            return calculateEstimationLimit(swapParams, priceData);
        });
}

/**
 * @param {ZeroExSwapParams} swapParams
 * @param {ZeroExPriceResponse} priceData
 * @return {string}
 */
function calculateEstimationLimit(swapParams, priceData) {
    const estimation = swapParams.sellAmount ? priceData.buyAmount : priceData.sellAmount;
    const getLimit = swapParams.sellAmount ? getMinEstimationLimit : getMaxEstimationLimit;
    return getLimit(estimation, swapParams.slippagePercentage);
}

/**
 * @typedef {object} ZeroExSwapParams
 * @property {string} buyToken - token address the taker wants to buy
 * @property {string} sellToken - token address the taker wants to sell
 * @property {string} [buyAmount] - amount of the buy token, if the taker is requesting to buy
 * @property {string} [sellAmount] - amount of the sell token, if the taker is requesting to sell
 * // OPTIONAL PARAMETERS
 * @property {number|string} slippagePercentage - e.g 0.03 for 3% slippage allowed.
 * // The address which will fill the quote.
 * // When provided the gas will be estimated and returned and the entire transaction will be validated for success.
 * // If the validation fails a Revert Error will be returned in the response.
 * // Required for RFQ liquidity
 * @property {string} takerAddress
 */

/**
 * @typedef {object} ZeroExPriceResponse
 * @property {string} buyAmount
 * @property {string} sellAmount
 */

/**
 * @typedef {ZeroExPriceResponse & OneInchTx} ZeroExSwapResponse
 * @property {string} allowanceTarget
 */

