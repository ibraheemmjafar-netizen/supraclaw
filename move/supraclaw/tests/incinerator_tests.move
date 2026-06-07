/// Unit tests for supraclaw::incinerator
/// Run on testnet with: supra move test --profile testnet
#[test_only]
module supraclaw::incinerator_tests {
    use supra_framework::coin;
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::account;
    use supraclaw::incinerator;
    use std::string;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    fun setup_account(framework: &signer, addr: address, supra_amount: u64): signer {
        let acct = account::create_account_for_test(addr);
        let (burn_cap, mint_cap) = supra_framework::supra_coin::initialize_for_test(framework);
        let coins = coin::mint<SupraCoin>(supra_amount, &mint_cap);
        coin::register<SupraCoin>(&acct);
        coin::deposit<SupraCoin>(addr, coins);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
        acct
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    #[test(framework = @supra_framework, user = @0xCAFE)]
    public entry fun test_compute_dev_fee(framework: &signer, user: &signer) {
        // 5% of 1 SUPRA (10^8 octas) should be 5_000_000 octas
        let fee = incinerator::compute_dev_fee(100_000_000);
        assert!(fee == 5_000_000, 1);

        // 5% of 0 should be 0
        let fee_zero = incinerator::compute_dev_fee(0);
        assert!(fee_zero == 0, 2);
    }

    #[test]
    public entry fun test_get_dev_fee_bps() {
        assert!(incinerator::get_dev_fee_bps() == 500, 1);
    }

    #[test(framework = @supra_framework, user = @0xCAFE, dev = @dev_address)]
    public entry fun test_burn_coin_pays_fee(
        framework: &signer,
        user: &signer,
        dev: &signer,
    ) {
        // Give user 10 SUPRA
        let _user_acct = setup_account(framework, @0xCAFE, 1_000_000_000);
        account::create_account_for_test(@dev_address);
        coin::register<SupraCoin>(dev);

        let initial_dev_balance = coin::balance<SupraCoin>(@dev_address);

        // Burn 0.1 SUPRA with a 5% fee (5_000_000 octas on 1e8 estimate)
        incinerator::burn_coin<SupraCoin>(
            user,
            10_000_000,        // burn 0.1 SUPRA
            5_000_000,         // 5% fee
            string::utf8(b"SupraCoin"),
        );

        let final_dev_balance = coin::balance<SupraCoin>(@dev_address);
        assert!(final_dev_balance == initial_dev_balance + 5_000_000, 1);
    }
}
