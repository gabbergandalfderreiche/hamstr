// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Base mainnet (chain id 8453) addresses, all checked on-chain (2026-10-25/26):
/// token symbols, aToken underlying + pool, Uniswap router factory and pool liquidity,
/// Chainlink feed descriptions.
library BaseAddresses {
    // Tokens
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    address internal constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;

    // Aave V3
    address internal constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address internal constant AAVE_A_WETH = 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7;
    address internal constant AAVE_A_USDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    // Uniswap V3 (both pools below use the 0.05% fee tier)
    address internal constant UNISWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    uint24 internal constant FEE_USDC_CBBTC = 500;
    uint24 internal constant FEE_WETH_CBBTC = 500;

    // Chainlink (8 decimals, USD)
    address internal constant FEED_USDC_USD = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;
    address internal constant FEED_ETH_USD = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    address internal constant FEED_CBBTC_USD = 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D;
    address internal constant SEQUENCER_UPTIME = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;
}
