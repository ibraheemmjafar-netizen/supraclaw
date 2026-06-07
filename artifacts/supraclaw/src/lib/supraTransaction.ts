/**
 * supraTransaction.ts
 *
 * Helpers for building and submitting Supra Move transactions via StarKey Wallet.
 *
 * DEPLOYED CONTRACT ADDRESS:
 *   Replace INCINERATOR_ADDRESS below with your published module address after
 *   running:  supra move publish --profile mainnet ...
 *
 * Supra RPC REST API docs: https://docs.supra.com/network/api-reference
 * StarKey wallet docs:      https://docs.starkey.app/
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * The address where you deployed the supraclaw::incinerator module.
 * Update this after running `supra move publish`.
 */
export const INCINERATOR_ADDRESS =
  "0x939132a494abe660f78a4a2cfcb1a8a8c1f8655154d9e0feee904afe74d614a5";

/**
 * Your developer wallet address (receives 5% fee).
 * This must match the `dev_address` named-address used during deployment.
 */
export const DEV_ADDRESS =
  "0x939132a494abe660f78a4a2cfcb1a8a8c1f8655154d9e0feee904afe74d614a5";

/** 5% fee in basis points */
export const DEV_FEE_BPS = 500;
export const BPS_DENOMINATOR = 10_000;

/** 1 SUPRA = 100_000_000 octas (8 decimal places) */
export const SUPRA_DECIMALS = 8;
export const OCTAS_PER_SUPRA = 10 ** SUPRA_DECIMALS;

// ─── RPC endpoints ───────────────────────────────────────────────────────────

export const RPC_MAINNET = "https://rpc-mainnet.supra.com";
export const RPC_TESTNET = "https://rpc-testnet.supra.com";

export function getRpcUrl(network: "mainnet" | "testnet"): string {
  return network === "mainnet" ? RPC_MAINNET : RPC_TESTNET;
}

// ─── Fee calculation ─────────────────────────────────────────────────────────

/**
 * Given an estimated SUPRA rebate (in SUPRA, not octas), returns:
 *   devFee   — 5% of rebate (in SUPRA)
 *   netAmount — 95% that stays with the user (in SUPRA)
 *   devFeeOctas — dev fee in octas for on-chain use
 */
export function calculateFee(estimatedRebateSupra: number): {
  devFee: number;
  netAmount: number;
  devFeeOctas: number;
} {
  const devFee = estimatedRebateSupra * (DEV_FEE_BPS / BPS_DENOMINATOR);
  const netAmount = estimatedRebateSupra - devFee;
  const devFeeOctas = Math.floor(devFee * OCTAS_PER_SUPRA);
  return { devFee, netAmount, devFeeOctas };
}

// ─── Supra account resources ─────────────────────────────────────────────────

export interface CoinResource {
  type: string;           // e.g. "0x1::coin::CoinStore<0xABC::my_coin::MyCoin>"
  data: {
    coin: { value: string };
    frozen: boolean;
  };
}

export interface FungibleStoreResource {
  type: string;
  data: {
    balance: string;
    metadata: { inner: string };
  };
}

/**
 * Fetch all resources for a Supra account.
 * Returns the raw JSON array from the REST API.
 */
export async function fetchAccountResources(
  address: string,
  network: "mainnet" | "testnet"
): Promise<unknown[]> {
  const rpc = getRpcUrl(network);
  const url = `${rpc}/rpc/v1/accounts/${address}/resources`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RPC error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { result?: unknown[] };
  return json.result ?? [];
}

/**
 * Fetch the SUPRA coin balance (in SUPRA, not octas) for an address.
 */
export async function fetchSupraBalance(
  address: string,
  network: "mainnet" | "testnet"
): Promise<number> {
  try {
    const resources = await fetchAccountResources(address, network);
    const coinStore = resources.find((r: unknown) => {
      const resource = r as { type: string };
      return resource.type === "0x1::coin::CoinStore<0x1::supra_coin::SupraCoin>";
    }) as CoinResource | undefined;

    if (!coinStore) return 0;
    return parseInt(coinStore.data.coin.value, 10) / OCTAS_PER_SUPRA;
  } catch {
    return 0;
  }
}

/**
 * Parse coin resources from raw account resources and return burnable items.
 * Filters out: SupraCoin (native) and zero-balance coins.
 */
export function parseCoinResources(resources: unknown[]): Array<{
  coinType: string;
  name: string;
  balance: number;
  rawBalance: string;
  estimatedRebate: number;
}> {
  const COIN_STORE_PREFIX = "0x1::coin::CoinStore<";

  return resources
    .filter((r: unknown) => {
      const resource = r as { type: string };
      return (
        resource.type.startsWith(COIN_STORE_PREFIX) &&
        !resource.type.includes("supra_coin::SupraCoin") &&
        !resource.type.includes("0x1::coin::CoinStore<0x1::")
      );
    })
    .map((r: unknown) => {
      const resource = r as CoinResource;
      const coinType = resource.type
        .replace(COIN_STORE_PREFIX, "")
        .replace(/>$/, "");

      const rawBalance = resource.data.coin.value;
      const balance = parseInt(rawBalance, 10);

      // Estimate rebate: ~0.001 SUPRA per coin store slot (heuristic)
      const estimatedRebate = 0.001;

      const parts = coinType.split("::");
      const name = parts[parts.length - 1] ?? coinType;

      return { coinType, name, balance, rawBalance, estimatedRebate };
    })
    .filter((c) => c.balance > 0);
}

// ─── Transaction builders ─────────────────────────────────────────────────────

/**
 * Build a Move entry-function payload for burning a single coin type.
 *
 * The frontend calls this and passes the result to starkey.supra.sendTransaction().
 */
export function buildBurnCoinPayload(
  coinType: string,
  amount: string,
  devFeeOctas: number
): object {
  return {
    function: `${INCINERATOR_ADDRESS}::incinerator::burn_coin`,
    type_arguments: [coinType],
    arguments: [
      amount,
      devFeeOctas.toString(),
      coinType, // coin_type_name string arg for event
    ],
    type: "entry_function_payload",
  };
}

/**
 * Build a Move entry-function payload for incinerating an NFT object.
 */
export function buildIncinerateObjectPayload(
  objectAddress: string,
  devFeeOctas: number
): object {
  return {
    function: `${INCINERATOR_ADDRESS}::incinerator::incinerate_object`,
    type_arguments: [],
    arguments: [objectAddress, devFeeOctas.toString()],
    type: "entry_function_payload",
  };
}

// ─── StarKey transaction submission ──────────────────────────────────────────

export interface StarKeyTxResult {
  hash: string;
  success: boolean;
}

/**
 * Submit a single Move entry-function transaction via StarKey wallet.
 * Returns the on-chain transaction hash.
 */
export async function submitTransaction(
  payload: object
): Promise<StarKeyTxResult> {
  const starkey = (window as Window & { starkey?: { supra: { sendTransaction: (p: object) => Promise<{ hash: string }> } } }).starkey;
  if (!starkey?.supra) {
    throw new Error("StarKey wallet is not installed");
  }

  const result = await starkey.supra.sendTransaction(payload);
  return {
    hash: result.hash,
    success: true,
  };
}

/**
 * High-level burn flow for a list of selected assets.
 * Submits one transaction per asset (Supra does not support multi-call PTBs yet
 * the same way Sui does — batch by doing sequential transactions).
 *
 * Returns the last transaction hash (for history display).
 */
export async function burnAssets(assets: Array<{
  type: "fungible" | "nft";
  coinType?: string;
  objectAddress?: string;
  rawBalance?: string;
  estimatedRebate: number;
}>): Promise<{ txHash: string; totalDevFeeOctas: number }> {
  let lastHash = "";
  let totalDevFeeOctas = 0;

  for (const asset of assets) {
    const { devFeeOctas } = calculateFee(asset.estimatedRebate);
    totalDevFeeOctas += devFeeOctas;

    let payload: object;

    if (asset.type === "fungible" && asset.coinType && asset.rawBalance) {
      payload = buildBurnCoinPayload(
        asset.coinType,
        asset.rawBalance,
        devFeeOctas
      );
    } else if (asset.type === "nft" && asset.objectAddress) {
      payload = buildIncinerateObjectPayload(
        asset.objectAddress,
        devFeeOctas
      );
    } else {
      continue;
    }

    const result = await submitTransaction(payload);
    lastHash = result.hash;
  }

  return { txHash: lastHash, totalDevFeeOctas };
}

// ─── Explorer link ────────────────────────────────────────────────────────────

export function getExplorerTxUrl(
  txHash: string,
  network: "mainnet" | "testnet"
): string {
  const base =
    network === "mainnet"
      ? "https://explorer.supra.com/txn"
      : "https://explorer-testnet.supra.com/txn";
  return `${base}/${txHash}`;
}
