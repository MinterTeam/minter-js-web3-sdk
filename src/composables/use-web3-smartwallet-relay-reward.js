import {reactive, computed, toRefs, watch} from 'vue-demi';
import {watchDebounced} from '@vueuse/core';
import Big from 'minterjs-util/src/big.js';
import {wait} from '@shrpne/utils/src/wait.js';
import {SMART_WALLET_RELAY_BROADCASTER_ADDRESS, NATIVE_COIN_ADDRESS, BSC_CHAIN_ID} from '../config.js';
import {toErcDecimals, fromErcDecimals, getFeeAmount, buildWethUnwrap, getWrappedNativeContractAddress} from '../web3.js';
// import {ParaSwapSwapSide} from '../api/swap-paraswap-models.d.ts';
// import {buildTxForSwap as buildTxForParaSwap, getEstimationLimit as getParaSwapEstimationLimit} from '../api/swap-paraswap.js';
import {buildTxForSwap as buildTxForZeroExSwap, getEstimationLimit as getZeroExEstimationLimit} from '../api/swap-0x.js';
import {getErrorText} from '../utils/server-error.js';
import useWeb3SmartWallet from '../composables/use-web3-smartwallet.js';

const GAS_PRICE_BSC = 5; // in gwei
const SLIPPAGE_PERCENT = 5;
// gas limits of:
// base extra fee added for each tx to cover unexpected costs, also covers:
// - native coin transfer to relay 21000-35000
// - smart-wallet broadcast expenses up to 100000
// - transferToBridge 75000 (if complexity:0)
export const RELAY_REWARD_AMOUNT_BASE_GAS_LIMIT = 500000; // equivalent of 0.0025 BNB
// fee for smart-wallet contract creation via factory
export const RELAY_REWARD_AMOUNT_CREATE_GAS_LIMIT = 1000000; // equivalent of 0.005 BNB
// @TODO use transferToBridge 75000 gas limit if no swap required
// fee for each swap inside combined tx
export const RELAY_REWARD_AMOUNT_SWAP_GAS_LIMIT = 500000; // equivalent of 0.0025 BNB


// @TODO estimate actual gas price if token already exists on smart-wallet
export default function useWeb3SmartWalletWithRelayReward({estimationThrottle = 100} = {}) {
    const sw = useWeb3SmartWallet();

    const props = reactive({
        /** @type {ChainId} */
        chainId: 0,
        gasPriceGwei: 0,
        gasTokenAddress: '',
        gasTokenDecimals: 0,
        // amount of swap tx combined into smart-wallet tx (e.g. several swaps for portfolio buy)
        complexity: 1,
        estimationSkip: false,
    });

    /**
     * @param {Partial<props>&Partial<Parameters<typeof sw.setSmartWalletProps>[0]>} newProps
     */
    function setProps(newProps) {
        Object.assign(props, newProps);
        sw.setSmartWalletProps(newProps);
    }

    const state = reactive({
        isEstimationLimitForRelayRewardsLoading: false,
        estimationLimitForRelayRewardsError: '',
        /** @type {number|string} */
        amountEstimationLimitForRelayReward: 0,
    });


    const isGasTokenWrappedNative = computed(() => {
        return props.gasTokenAddress?.toLowerCase() === getWrappedNativeContractAddress(props.chainId)
    });
    const isGasTokenNativeLike = computed(() => {
        return isGasTokenWrappedNative.value || props.gasTokenAddress?.toLowerCase() === NATIVE_COIN_ADDRESS;
    })
    // in gwei
    const gasPrice = computed(() => {
        if (props.chainId === BSC_CHAIN_ID) {
            return GAS_PRICE_BSC;
        }
        return props.gasPriceGwei;
    });
    const combinedTxGasLimit = computed(() => getCombinedTxGasLimit(props.complexity));
    const relayRewardAmount = computed(() => getFeeAmount(gasPrice.value, combinedTxGasLimit.value));

    watch([
        gasPrice,
        combinedTxGasLimit,
    ], () => {
        sw.setSmartWalletProps({
            gasPriceGwei: gasPrice.value,
            gasLimit: combinedTxGasLimit.value,
        });
    }, {immediate: true});

    function getCombinedTxGasLimit(complexity = 1) {
        const baseRewardGasLimit = RELAY_REWARD_AMOUNT_BASE_GAS_LIMIT;
        const createRewardGasLimit = sw.isSmartWalletExists.value ? 0 : RELAY_REWARD_AMOUNT_CREATE_GAS_LIMIT;
        const gasSwapRewardGasLimit = isGasTokenNativeLike.value ? 0 : RELAY_REWARD_AMOUNT_SWAP_GAS_LIMIT;
        const swapRewardGasLimit = complexity * RELAY_REWARD_AMOUNT_SWAP_GAS_LIMIT;
        return baseRewardGasLimit + createRewardGasLimit + gasSwapRewardGasLimit + swapRewardGasLimit;
    }

    /**
     * Offline recalculation of erc20 token spend limit to swap for relay reward
     * @param {number} complexity - new complexity
     * @param {number|string} oldGasLimit
     * @param {number|string} oldEstimation - old spend limit estimated on oldGasLimit
     * @return {number}
     */
    function recalculateEstimation(complexity, oldGasLimit, oldEstimation) {
        const baseSingle = RELAY_REWARD_AMOUNT_BASE_GAS_LIMIT;
        const createSingle = RELAY_REWARD_AMOUNT_CREATE_GAS_LIMIT;
        const gasSwapSingle = RELAY_REWARD_AMOUNT_SWAP_GAS_LIMIT; // swap for BNB to pay relay reward to pusher
        const swapSingle = RELAY_REWARD_AMOUNT_SWAP_GAS_LIMIT;
        const baseRewardPart = new Big(baseSingle).div(oldGasLimit);
        const createRewardPart = sw.isSmartWalletExists.value ? new Big(0) : new Big(createSingle).div(oldGasLimit);
        const gasSwapRewardPart = isGasTokenNativeLike.value ? new Big(0) : new Big(gasSwapSingle).div(oldGasLimit);
        const swapRewardPart = new Big(swapSingle).div(oldGasLimit);

        const baseReward = baseRewardPart.times(oldEstimation);
        const createReward = createRewardPart.times(oldEstimation);
        const gasSwapReward = gasSwapRewardPart.times(oldEstimation);
        const swapReward = swapRewardPart.times(complexity).times(oldEstimation);

        return baseReward.plus(createReward).plus(gasSwapReward).plus(swapReward).toNumber();
    }

    // gas token will be used to reward relay service
    const swapToRelayRewardParams = computed(() => {
        return swapZeroExParams.value;
        // return swapParaSwapParams.value;
    });
    const swapZeroExParams = computed(() => {
        return {
            sellToken: props.gasTokenAddress,
            // sellTokenDecimals: props.gasTokenDecimals,
            buyToken: NATIVE_COIN_ADDRESS,
            // destToken: NETWORK_DATA[props.chainId]?.wrappedNativeContractAddress,
            // buyTokenDecimals: 18,
            buyAmount: toErcDecimals(relayRewardAmount.value, 18),
            slippagePercentage: SLIPPAGE_PERCENT / 100, // part of 1
            skipValidation: true,
            intentOnFilling: false,
            takerAddress: sw.smartWalletAddress.value,
            receiver: SMART_WALLET_RELAY_BROADCASTER_ADDRESS,
        };
    });
    /*
    const swapParaSwapParams = computed(() => {
        return {
            network: props.chainId,
            srcToken: props.gasTokenAddress,
            srcDecimals: props.gasTokenDecimals,
            destToken: NATIVE_COIN_ADDRESS,
            // destToken: NETWORK_DATA[props.chainId]?.wrappedNativeContractAddress,
            destDecimals: 18,
            amount: toErcDecimals(relayRewardAmount.value, 18),
            side: ParaSwapSwapSide.BUY,
            slippage: SLIPPAGE_PERCENT * 100, // in bp
            maxImpact: 50, // 50% (default 15% can be exceeded on "bipx to 0.01bnb swap" despite it has 10k liquidity)
            userAddress: sw.smartWalletAddress.value,
            txOrigin: SMART_WALLET_RELAY_BROADCASTER_ADDRESS,
            receiver: SMART_WALLET_RELAY_BROADCASTER_ADDRESS,
        };
    });
    */
    // tx params suitable for fee estimation (fake payload, need to prepare later)
    /*
    const feeTxParams = computed(() => {
        const coin = getTokenSymbolForNetwork('BNB');
        return {
            // chainId: 1,
            type: TX_TYPE.SEND,
            data: {
                to: SMART_WALLET_RELAY_MINTER_ADDRESS,
                // @TODO estimate precise value
                value: relayRewardAmount.value,
                coin,
            },
            gasCoin: coin,
            // gasPrice: 1,
            payload: Array.from({length: PAYLOAD_MAX_LENGTH}).fill('0').join(''),
        };
    });
    */


    //@TODO maybe check isEqual
    watchDebounced([
        swapToRelayRewardParams,
        sw.smartWalletAddress,
        sw.isSmartWalletExistenceLoading,
    ], (newVal, oldVal) => {
        if (props.estimationSkip) {
            return;
        }
        if (!sw.smartWalletAddress.value || sw.isSmartWalletExistenceLoading.value) {
            return;
        }
        //@TODO maybe wait until whole form will be filled by user
        if (props.gasTokenAddress && props.gasTokenDecimals) {
            state.isEstimationLimitForRelayRewardsLoading = true;
            state.estimationLimitForRelayRewardsError = '';
            estimateSpendLimitForRelayReward()
                .then((spendLimit) => {
                    state.isEstimationLimitForRelayRewardsLoading = false;
                    setAmountEstimationLimitForRelayReward(spendLimit);
                })
                .catch((error) => {
                    setAmountEstimationLimitForRelayReward(0);
                    state.isEstimationLimitForRelayRewardsLoading = false;
                    const isZeroExLiquidityError = error.response?.data.validationErrors?.[0]?.reason === 'INSUFFICIENT_ASSET_LIQUIDITY'
                    state.estimationLimitForRelayRewardsError = isZeroExLiquidityError
                        ? 'Unable to swap token for relay reward: no liquidity pools with it or too low liquidity'
                        : getErrorText(error);
                });
        } else {
            setAmountEstimationLimitForRelayReward(0);
        }
    }, {
        debounce: estimationThrottle,
        maxWait: estimationThrottle,
        // throttle: estimationThrottle,
        // leading: false,
        // trailing: true,
    });

    /**
     * @param {number|string} value
     */
    function setAmountEstimationLimitForRelayReward(value) {
        state.amountEstimationLimitForRelayReward = value;
    }

    //@TODO sometimes goes to infinite loop
    /**
     * @return {Promise<string|number>}
     */
    function estimateSpendLimitForRelayReward() {
        if (isGasTokenNativeLike.value) {
            return Promise.resolve(relayRewardAmount.value);
        } else {
            return getZeroExEstimationLimit(props.chainId, swapToRelayRewardParams.value)
                .then((swapLimit) => {
                    return fromErcDecimals(swapLimit, props.gasTokenDecimals);
                });
            // return getParaSwapEstimationLimit(swapToRelayRewardEstimationParams.value);
        }
    }

    /**
     * @return {Promise<ParaSwapTransactionsBuildCombined>}
     */
    function _buildTxForRelayReward() {
        if (isGasTokenNativeLike.value) {
            /** @type {Array<EvmTxParams>} */
            let txList = [];
            const relayRewardAmountWei = toErcDecimals(relayRewardAmount.value, 18);
            // unwrap
            if (isGasTokenWrappedNative.value) {
                txList.push(buildWethUnwrap(props.chainId, relayRewardAmountWei));
            }
            // send
            txList.push({
                to: SMART_WALLET_RELAY_BROADCASTER_ADDRESS,
                value: relayRewardAmountWei,
                data: '0x',
            });
            return Promise.resolve({
                swapLimit: relayRewardAmount.value,
                txList,
            });
        } else {
            return buildTxForZeroExSwap(props.chainId, swapToRelayRewardParams.value)
                .then((result) => {
                    return {
                        txList: result.txList,
                        swapLimit: fromErcDecimals(result.swapLimit, props.gasTokenDecimals),
                    };
                });
            // return buildTxForParaSwap(props.chainId, swapToRelayRewardParams.value);
        }
    }

    /**
     * @return {Promise<ParaSwapTransactionsBuildCombined>}
     */
    function buildTxForRelayReward() {
        return _buildTxForRelayReward()
            .then((result) => {
                state.amountEstimationLimitForRelayReward = result.swapLimit;
                // wait for recalculate computed (e.g. amountToSellForSwapToHub)
                return wait(50, result);
            });
    }


    return {
        ...sw,
        ...toRefs(state),
        setSmartWalletProps: setProps,
        gasPrice,
        relayRewardAmount,
        swapToRelayRewardParams,
        // feeTxParams,
        estimateSpendLimitForRelayReward,
        getCombinedTxGasLimit,
        recalculateEstimation,
        buildTxForRelayReward,
    };
}


/**
 * @typedef {object} SmartWalletTxParams
 * @property {string} to
 * @property {string} data
 * @property {string} value
 */

