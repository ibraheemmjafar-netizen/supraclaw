/// Supra Incinerator — burns coin slots, returns SUPRA storage rebates.
///
/// Deploy flow:
///   1. supra move publish → get YOUR_ADDRESS
///   2. init_treasury(admin, 10_000_000_000)  ← 100 SUPRA seed
///   3. register_coin<T>(admin)               ← once per coin type
///   4. Users call burn_coin<T> or burn_empty_slot<T>
module incinerator::incinerator {
    use std::signer;
    use std::error;
    use 0x1::coin;
    use 0x1::supra_coin::SupraCoin;

    const E_TREASURY_EXISTS:     u64 = 1;
    const E_TREASURY_NOT_FOUND:  u64 = 2;
    const E_INSUFFICIENT_FUNDS:  u64 = 3;
    const E_NON_ZERO_BALANCE:    u64 = 4;

    const DEV_FEE_BPS:        u64 = 500;
    const BPS_DENOM:          u64 = 10_000;
    const DEFAULT_REBATE:     u64 = 100_000_000; // 1 SUPRA per slot

    struct Treasury has key {
        balance: coin::Coin<SupraCoin>,
        rebate_per_slot: u64,
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    /// Call once after deployment to seed the rebate fund.
    public entry fun init_treasury(admin: &signer, seed_amount: u64) {
        let addr = signer::address_of(admin);
        assert!(!exists<Treasury>(addr), error::already_exists(E_TREASURY_EXISTS));
        let coins = coin::withdraw<SupraCoin>(admin, seed_amount);
        move_to(admin, Treasury { balance: coins, rebate_per_slot: DEFAULT_REBATE });
    }

    /// Add more SUPRA to the rebate fund.
    public entry fun top_up_treasury(admin: &signer, amount: u64) acquires Treasury {
        let addr = signer::address_of(admin);
        assert!(exists<Treasury>(addr), error::not_found(E_TREASURY_NOT_FOUND));
        let coins = coin::withdraw<SupraCoin>(admin, amount);
        coin::merge(&mut borrow_global_mut<Treasury>(addr).balance, coins);
    }

    /// Change the rebate amount per slot.
    public entry fun set_rebate(admin: &signer, new_rebate_octas: u64) acquires Treasury {
        let addr = signer::address_of(admin);
        assert!(exists<Treasury>(addr), error::not_found(E_TREASURY_NOT_FOUND));
        borrow_global_mut<Treasury>(addr).rebate_per_slot = new_rebate_octas;
    }

    /// Register incinerator address to receive a coin type.
    /// MUST be called for each CoinType before users can burn it.
    public entry fun register_coin<CoinType>(admin: &signer) {
        if (!coin::is_account_registered<CoinType>(signer::address_of(admin))) {
            coin::register<CoinType>(admin);
        };
    }

    // ── User ───────────────────────────────────────────────────────────────────

    /// Burn a coin with balance:
    ///   1. Transfers ALL user's CoinType to dev (incinerator address)
    ///   2. Closes user's CoinStore slot (frees storage, VM returns deposit)
    ///   3. Sends SUPRA rebate minus 5% fee to user
    public entry fun burn_coin<CoinType>(user: &signer, dev_addr: address) acquires Treasury {
        let user_addr = signer::address_of(user);
        let bal = coin::balance<CoinType>(user_addr);
        if (bal > 0) {
            coin::transfer<CoinType>(user, dev_addr, bal);
        };
        coin::unregister<CoinType>(user);
        send_rebate(user_addr, dev_addr);
    }

    /// Burn an empty dead slot (zero-balance CoinStore):
    ///   Closes the slot and sends rebate.
    public entry fun burn_empty_slot<CoinType>(user: &signer, dev_addr: address) acquires Treasury {
        let user_addr = signer::address_of(user);
        assert!(coin::balance<CoinType>(user_addr) == 0, error::invalid_state(E_NON_ZERO_BALANCE));
        coin::unregister<CoinType>(user);
        send_rebate(user_addr, dev_addr);
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    fun send_rebate(user_addr: address, dev_addr: address) acquires Treasury {
        assert!(exists<Treasury>(dev_addr), error::not_found(E_TREASURY_NOT_FOUND));
        let t = borrow_global_mut<Treasury>(dev_addr);
        let gross = t.rebate_per_slot;
        assert!(coin::value(&t.balance) >= gross, error::resource_exhausted(E_INSUFFICIENT_FUNDS));
        let fee    = (gross * DEV_FEE_BPS) / BPS_DENOM;
        let user_net = gross - fee;
        let rebate = coin::extract(&mut t.balance, user_net);
        coin::deposit<SupraCoin>(user_addr, rebate);
        // fee stays in treasury as dev earnings
    }
}