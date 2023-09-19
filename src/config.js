export const config = {
    ZERO_EX_API_KEY: '',
};

/**
 * @param {Partial<config>} configValue
 */
export function setConfig(configValue) {
    Object.assign(config, configValue);
}

export const MAINNET = 'mainnet';
export const TESTNET = 'testnet';
export const NETWORK = true /*process.env.APP_ENV === MAINNET*/ ? MAINNET : TESTNET;

export const HUB_ETHEREUM_CONTRACT_ADDRESS = '0x897c27Fa372AA730D4C75B1243E7EA38879194E2';
export const HUB_BSC_CONTRACT_ADDRESS = '0xF5b0ed82a0b3e11567081694cC66c3df133f7C8F';
export const HUB_MINTER_MULTISIG_ADDRESS = 'Mx68f4839d7f32831b9234f9575f3b95e1afe21a56';
export const HUB_API_URL = 'https://hub-api.minter.network/';
export const HUB_DEPOSIT_PROXY_API_URL = HUB_API_URL + 'deposit-proxy/';
export const SMART_WALLET_RELAY_API_URL = HUB_API_URL + 'smart-wallet-relay/';
export const ETHEREUM_API_URL = 'https://mainnet.infura.io/v3/0ab122c0f98043eda95266a862528e4c';
export const BSC_API_URL = 'https://rpc.ankr.com/bsc/';
/** @type {ChainId} */
export const ETHEREUM_CHAIN_ID = NETWORK === MAINNET ? 1 : 3;
/** @type {ChainId} */
export const BSC_CHAIN_ID = NETWORK === MAINNET ? 56 : 97;

export const ONE_INCH_API_URL = 'https://api.1inch.io/v5.0/';
export const PARASWAP_API_URL = 'https://apiv5.paraswap.io/';
export const ZERO_EX_ETHEREUM_API_URL = 'https://api.0x.org/';
export const ZERO_EX_BSC_API_URL = 'https://bsc.api.0x.org/';
export const WETH_CONTRACT_ADDRESS = NETWORK === MAINNET ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' : '0x0a180a76e4466bf68a7f86fb029bed3cccfaaac5';// '0xc778417e063141139fce010982780140aa0cd5ab';
export const WBNB_CONTRACT_ADDRESS = NETWORK === MAINNET ? '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' : '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';
// recognized by 1inch/paraswap/0x and other third parties as native coin
export const NATIVE_COIN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const HUB_DEPOSIT_PROXY_ETHEREUM_CONTRACT_ADDRESS = '0x52058c3f5fa9a7a5dfe4d5edee38b0045f635ca0';
export const HUB_DEPOSIT_PROXY_BSC_CONTRACT_ADDRESS = '0x0C9B820C0877340333E874AE70395Da7353E7cA3';
export const SMART_WALLET_FACTORY_CONTRACT_ADDRESS = "0x324718b3cE9906fcf5cE140342146Eb16970d889";
export const SMART_WALLET_FACTORY_LEGACY_BSC_CONTRACT_ADDRESS = "0x7F3C8d5363B44875001Fa2A63A7dB6FCb8BEE989";
export const SMART_WALLET_RELAY_BROADCASTER_ADDRESS = '0x64e51D5930CDBbf99f3cB27654A03b18f7060C5E';
export const SMART_WALLET_RELAY_MINTER_ADDRESS = "Mxc9b1b39f4c94b1bcbf68c1beba97ab84f7763cf0";


/**
 * @readonly
 * @enum {string}
 */
export const HUB_NETWORK_SLUG = {
    ETHEREUM: 'ethereum',
    BSC: 'bsc',
    MINTER: 'minter',
};


/**
 * @typedef {object} HubChainDataItem
 * @property {ChainId} chainId
 * @property {HUB_NETWORK_SLUG} hubNetworkSlug
 * @property {string} apiUrl
 * @property {string} hubBridgeContractAddress
 * @property {string} wrappedNativeContractAddress
 */

/**
 * @readonly
 * @type {Record<ChainId, HubChainDataItem>}
 */
export const NETWORK_DATA = {
    [ETHEREUM_CHAIN_ID]: {
        chainId: ETHEREUM_CHAIN_ID,
        hubNetworkSlug: HUB_NETWORK_SLUG.ETHEREUM,
        apiUrl: ETHEREUM_API_URL,
        hubBridgeContractAddress: HUB_ETHEREUM_CONTRACT_ADDRESS.toLowerCase(),
        wrappedNativeContractAddress: WETH_CONTRACT_ADDRESS.toLowerCase(),
    },
    [BSC_CHAIN_ID]: {
        chainId: BSC_CHAIN_ID,
        hubNetworkSlug: HUB_NETWORK_SLUG.BSC,
        apiUrl: BSC_API_URL,
        hubBridgeContractAddress: HUB_BSC_CONTRACT_ADDRESS.toLowerCase(),
        wrappedNativeContractAddress: WBNB_CONTRACT_ADDRESS.toLowerCase(),
    },
};

/**
 * @readonly
 * @enum {string}
 */
export const HUB_TRANSFER_STATUS = {
    not_found_long: 'not_found_long', // custom status
    not_found: 'TX_STATUS_NOT_FOUND',
    deposit_to_hub_received: "TX_STATUS_DEPOSIT_RECEIVED",
    batch_created: "TX_STATUS_BATCH_CREATED",
    batch_executed: "TX_STATUS_BATCH_EXECUTED",
    refund: "TX_STATUS_REFUNDED",
};

/**
 * @readonly
 * @enum {string}
 */
export const HUB_DEPOSIT_TX_PURPOSE = {
    SEND: 'Send',
    UNLOCK: 'Unlock',
    WRAP: 'Wrap',
    UNWRAP: 'Unwrap',
    OTHER: 'Other',
};


/**
 * Order matters
 * @enum {string}
 */
export const HUB_BUY_STAGE = {
    // common
    WAIT_ETH: 'wait_eth',
    // smart-wallet relay
    SEND_TO_RELAY: 'send_to_relay',
    // user signed tx before bridge
    SWAP_ETH: 'swap_eth',
    WRAP_ETH: 'wrap_eth',
    UNWRAP_ETH: 'unwrap_eth',
    APPROVE_BRIDGE: 'approve_bridge',
    SEND_BRIDGE: 'send_bridge',
    // common
    WAIT_BRIDGE: 'wait_bridge',
    SWAP_MINTER: 'swap_minter',
    FINISH: 'finish',
};

/**
 * @enum {string}
 */
export const HUB_WITHDRAW_SPEED = {
    MIN: 'min',
    FAST: 'fast',
};

