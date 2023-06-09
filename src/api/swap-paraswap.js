import axios from 'axios';
import {Cache, cacheAdapterEnhancer} from 'axios-extensions';
import Big from 'minterjs-util/src/big.js';
import {getMaxEstimationLimit, getMinEstimationLimit} from 'minterjs-util/src/swap-limit.js';
import {ParaSwapSwapSide} from './swap-paraswap-models';
import {fromErcDecimals, getAllowance, buildApproveTx} from '../web3.js';
import {PARASWAP_API_URL, NATIVE_COIN_ADDRESS} from '../config.js';
import {getDefaultAdapter} from '../utils/axios-default-adapter.js';


const instance = axios.create({
    baseURL: PARASWAP_API_URL,
    adapter: cacheAdapterEnhancer(getDefaultAdapter(), { enabledByDefault: false}),
});

// exclude RFQ liquidity (it is considered not stable and can be expired during long smart-wallet withdrawals)
const EXCLUDE_PROTOCOLS = '0xRFQt,OMM1';

/**
 * @param {Partial<ParaSwapPricesListParams & ParaSwapTransactionsRequestPayload>} swapParams
 * @return {Promise<ParaSwapTransactionsBuildCombined>}
 */
export async function buildTxForSwap(swapParams) {
    const {srcToken, srcDecimals, destToken, destDecimals, amount, side, network} = swapParams;
    const priceRoute = await getPriceRoute({srcToken, srcDecimals, destToken, destDecimals, amount, side, network});

    const txList = [];
    if (srcToken !== NATIVE_COIN_ADDRESS) {
        const allowance = await getAllowance(network, srcToken, swapParams.userAddress, priceRoute.tokenTransferProxy);
        if (new Big(allowance).lt(priceRoute.srcAmount)) {
            txList.push(buildApproveTx(srcToken, priceRoute.tokenTransferProxy));
        }
    }

    const swapTx = await buildTransaction(network, {
        srcToken,
        srcDecimals,
        destToken,
        destDecimals,
        srcAmount: side === ParaSwapSwapSide.SELL ? priceRoute.srcAmount : undefined,
        destAmount: side === ParaSwapSwapSide.BUY ? priceRoute.destAmount : undefined,
        slippage: swapParams.slippage,
        userAddress: swapParams.userAddress,
        txOrigin: swapParams.txOrigin,
        receiver: swapParams.receiver,
        priceRoute,
        excludeDEXS: EXCLUDE_PROTOCOLS,
    });
    txList.push(swapTx);

    return {
        swapLimit: calculateEstimationLimit(priceRoute, swapParams.side, swapParams.slippage),
        txList,
    };
}

const fastCache = new Cache({ttl: 2 * 1000, max: 100});

/**
 * @param {ParaSwapPricesListParams} swapParams
 * @return {Promise<ParaSwapPriceRoute>}
 */
function getPriceRoute(swapParams) {
    swapParams = {
        ...swapParams,
        excludeDEXS: EXCLUDE_PROTOCOLS,
    };
    return instance.get('prices', {
            params: swapParams,
            cache: fastCache,
        })
        .then((response) => {
            /** @type {ParaSwapPriceRoute} */
            const priceRoute = response.data.priceRoute;
            // priceRoute object must not be changed and should be passed to `buildTransaction` as is
            return Object.freeze(priceRoute);
        });
}

/**
 * @param {ParaSwapPricesListParams&{slippage: ParaSwapTransactionsRequestPayload['slippage']}} swapParams
 * @return {Promise<string|number>}
 */
export function getEstimationLimit(swapParams) {
    return getPriceRoute(swapParams)
        .then((priceRoute) => {
            return calculateEstimationLimit(priceRoute, swapParams.side, swapParams.slippage);
        });
}

/**
 * @param {ParaSwapPriceRoute} priceRoute
 * @param {ParaSwapSwapSide} side
 * @param {ParaSwapTransactionsRequestPayload['slippage']} slippage
 * @return {string}
 */
function calculateEstimationLimit(priceRoute, side, slippage) {
    // normalize slippage to percent, then to part
    const slippagePart = new Big(slippage).div(100).div(100);

    if (side === ParaSwapSwapSide.SELL) {
        const limitWei = getMinEstimationLimit(priceRoute.destAmount, slippagePart);
        return fromErcDecimals(limitWei, priceRoute.destDecimals);
    } else {
        const limitWei = getMaxEstimationLimit(priceRoute.srcAmount, slippagePart);
        return fromErcDecimals(limitWei, priceRoute.srcDecimals);
    }
}

/**
 * @param {number|string} chainId
 * @param {ParaSwapTransactionsRequestPayload} txRequest
 * @return {Promise<ParaSwapTransactionsBuildResponse>}
 */
export function buildTransaction(chainId, txRequest) {
    return instance.post(`transactions/${chainId}`, txRequest, {
        params: {
            ignoreChecks: true,
        },
    })
        .then((response) => {
            return response.data;
        });
}


/**
 * @typedef {{txList: Array<ParaSwapTransactionsBuildResponse|EvmTxParams>, swapLimit: string}} ParaSwapTransactionsBuildCombined
 */
