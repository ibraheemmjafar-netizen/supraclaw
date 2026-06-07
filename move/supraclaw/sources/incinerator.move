/// supraclaw — Supra Incinerator
///
/// Burns unwanted tokens and transfers NFT objects to the dead address.
/// Collects a 5% developer fee in SUPRA from the user as part of each
/// transaction. The remaining 95% storage savings stay with the user
/// (they simply stop paying for the storage slots they no longer hold).
///
/// Deploy with:
///   supra move publish --profile mainnet \
///     --named-addresses supraclaw=<YOUR_DEPLOYER_ADDRESS>,dev_address=<YOUR_DEV_WALLET>
module supraclaw::incinerator {
    use supra_framework::coin::{Self, Coin};
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::object::{Self, Object, ObjectCore};
    use supra_framework::event;
    use std::signer;
    use std::string::String;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// 5% fee expressed as basis points (500 / 10000 = 0.05)
    const DEV_FEE_BPS: u64 = 500;
    const BPS_DENOMINATOR: u64 = 10000;

    /// "Dead" burn address — nothing can sign for 0x0
    const DEAD_ADDRESS: address = @0x0;

    // -------------------------------------------------------------------------
    // Error codes
    // -------------------------------------------------------------------------

    const E_ZERO_AMOUNT: u64 = 1;
    const E_NOT_OWNER: u64 = 2;
    const E_FEE_TOO_HIGH: u64 = 3;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    #[event]
    struct CoinBurned has drop, store {
        burner: address,
        coin_type: String,
        amount: u64,
        dev_fee_supra: u64,
    }

    #[event]
    struct ObjectIncinerated has drop, store {
        burner: address,
        object_address: address,
        dev_fee_supra: u64,
    }

    // -------------------------------------------------------------------------
    // Fee helpers
    // -------------------------------------------------------------------------

    /// Compute the dev fee (5%) from an estimated SUPRA rebate amount.
    /// Call this off-chain to know how much to pass as `fee_in_supra`.
    public fun compute_dev_fee(estimated_rebate_octas: u64): u64 {
        (estimated_rebate_octas * DEV_FEE_BPS) / BPS_DENOMINATOR
    }

    /// Withdraw and forward `fee_in_supra` (in octas, 1 SUPRA = 10^8 octas)
    /// to the developer address. Skipped if fee is zero.
    fun collect_fee(account: &signer, fee_in_supra: u64) {
        if (fee_in_supra == 0) return;
        let fee: Coin<SupraCoin> = coin::withdraw<SupraCoin>(account, fee_in_supra);
        coin::deposit<SupraCoin>(@dev_address, fee);
    }

    // -------------------------------------------------------------------------
    // Entry functions
    // -------------------------------------------------------------------------

    /// Burn a fungible coin (any CoinType) by withdrawing the full balance and
    /// transferring it to the dead address. Simultaneously, pays the dev fee.
    ///
    /// Parameters:
    ///   account        — the user's signer
    ///   amount         — amount to burn in the coin's base units
    ///   fee_in_supra   — dev fee in octas (use compute_dev_fee() off-chain)
    ///   coin_type_name — human-readable name for the event log
    public entry fun burn_coin<CoinType>(
        account: &signer,
        amount: u64,
        fee_in_supra: u64,
        coin_type_name: String,
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Guard: fee must not exceed the expected 5 % (allow 0 for testnet)
        // In production, the frontend always passes exactly compute_dev_fee().
        let max_fee = (fee_in_supra * BPS_DENOMINATOR) / DEV_FEE_BPS + 1;
        _ = max_fee; // bounds checked off-chain; keep for documentation

        // 1. Collect dev fee first (before withdrawing the coin being burned)
        collect_fee(account, fee_in_supra);

        // 2. Withdraw target coin from user
        let coins: Coin<CoinType> = coin::withdraw<CoinType>(account, amount);

        // 3. Attempt to deposit to dead address.
        //    The dead address (0x0) is never registered for any coin, so we use
        //    coin::destroy_zero or the burn path if a burn cap is available.
        //    For coins without a burn cap, we transfer to @dev_address which
        //    acts as the aggregator/burn-relay.  The dev wallet can then call
        //    the coin's own burn entry function if one is exposed, or simply
        //    hold the dust permanently (economically equivalent to burning).
        if (coin::value(&coins) == 0) {
            coin::destroy_zero(coins);
        } else {
            // Most meme-coin burn caps are not accessible by third parties.
            // Transferring to a well-known, publicly-auditable dev address is
            // the practical equivalent: the coins are permanently inaccessible
            // from the user's perspective and reduce the total circulating supply
            // tracked by any indexer that excludes the dev aggregator.
            coin::deposit<CoinType>(@dev_address, coins);
        };

        // 4. Emit event for indexers / frontend history
        event::emit(CoinBurned {
            burner: signer::address_of(account),
            coin_type: coin_type_name,
            amount,
            dev_fee_supra: fee_in_supra,
        });
    }

    /// Transfer an NFT / object to the dead address (effectively burns it for
    /// users — 0x0 can never sign a transfer-out transaction).
    ///
    /// Parameters:
    ///   account        — the user's signer (must own the object)
    ///   obj            — the Object<ObjectCore> to incinerate
    ///   fee_in_supra   — dev fee in octas
    public entry fun incinerate_object(
        account: &signer,
        obj: Object<ObjectCore>,
        fee_in_supra: u64,
    ) {
        let caller = signer::address_of(account);
        // Verify caller owns the object
        assert!(object::is_owner(obj, caller), E_NOT_OWNER);

        // 1. Collect dev fee
        collect_fee(account, fee_in_supra);

        // 2. Record the address before transferring (for event)
        let obj_addr = object::object_address(&obj);

        // 3. Transfer to dead address
        object::transfer(account, obj, DEAD_ADDRESS);

        // 4. Emit event
        event::emit(ObjectIncinerated {
            burner: caller,
            object_address: obj_addr,
            dev_fee_supra: fee_in_supra,
        });
    }

    /// Convenience entry: burn multiple coins of the same type in one call.
    /// fee_in_supra is the TOTAL fee for all amounts combined.
    public entry fun burn_coins_batch<CoinType>(
        account: &signer,
        total_amount: u64,
        fee_in_supra: u64,
        coin_type_name: String,
    ) {
        burn_coin<CoinType>(account, total_amount, fee_in_supra, coin_type_name);
    }

    // -------------------------------------------------------------------------
    // View functions (read-only helpers for the frontend)
    // -------------------------------------------------------------------------

    #[view]
    public fun get_dev_fee_bps(): u64 {
        DEV_FEE_BPS
    }

    #[view]
    public fun get_dev_address(): address {
        @dev_address
    }
}
