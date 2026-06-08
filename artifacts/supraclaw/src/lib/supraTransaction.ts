/**
 * supraTransaction.ts
 *
 * VERIFIED against Supra mainnet RPC.
 *
 * API facts (tested 2026-06-08):
 *  - Use /rpc/v2/ — gives {resources:[{type,data}]} with real balances in data.coin.value
 *  - /rpc/v1/ resources gives type metadata ONLY (no balances)
 *  - StarKey sendTransaction uses {data:{function,typeArguments,functionArguments}} format
 *  - Incinerator contract must be deployed separately; until then we use coin::transfer to dev
 */

export const DEV_ADDRESS =
  "0x939132a494abe660f78a4a2cfcb1a8a8c1f8655154d9e0feee904afe74d614a5";

// Set this once the incinerator Move module is deployed to mainnet
export const INCINERATOR_ADDRESS: string | null = null;

export const DEV_FEE_BPS = 500; // 5%
export const BPS_DENOMINATOR = 10_000;
export const SUPRA_DECIMALS = 8;
export const OCTAS_PER_SUPRA = 10 ** SUPRA_DECIMALS;
// Estimated SUPRA storage deposit freed per CoinStore slot (empirical ~0.001 SUPRA on Supra)
export const SUPRA_PER_SLOT = 0.001;

export const RPC_MAINNET = "https://rpc-mainnet.supra.com";
export const RPC_TESTNET = "https://rpc-testnet.supra.com";

export function getRpcUrl(network: "mainnet" | "testnet"): string {
  return network === "mainnet" ? RPC_MAINNET : RPC_TESTNET;
}

export function calculateFee(estimatedRebateSupra: number) {
  const devFee = estimatedRebateSupra * (DEV_FEE_BPS / BPS_DENOMINATOR);
  const netAmount = estimatedRebateSupra - devFee;
  const devFeeOctas = Math.floor(devFee * OCTAS_PER_SUPRA);
  return { devFee, netAmount, devFeeOctas };
}

// ─── RPC v2 resource types ────────────────────────────────────────────────────
// GET /rpc/v2/accounts/{addr}/resources → {resources:[{type:string, data:{...}}], cursor?:string}

export interface V2Resource {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Fetch all account resources using RPC v2 (includes actual data/balances).
 * Paginates automatically.
 */
export async function fetchAccountResources(
  address: string,
  network: "mainnet" | "testnet"
): Promise<V2Resource[]> {
  const rpc = getRpcUrl(network);
  const all: V2Resource[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const url = cursor
      ? `${rpc}/rpc/v2/accounts/${address}/resources?cursor=${encodeURIComponent(cursor)}&limit=100`
      : `${rpc}/rpc/v2/accounts/${address}/resources?limit=100`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Supra RPC v2 ${res.status}: ${await res.text()}`);
    const json = await res.json() as { resources?: V2Resource[]; cursor?: string };

    const resources = json.resources ?? [];
    all.push(...resources);

    cursor = json.cursor ?? null;
    if (!cursor || resources.length === 0) break;
  }

  return all;
}

// ─── Coin helpers (v2) ────────────────────────────────────────────────────────

/**
 * Filter to non-SUPRA CoinStore resources.
 * v2 types use short form: "0x1::coin::CoinStore<0xADDR::MODULE::NAME>"
 */
export function getCoinStoreResources(resources: V2Resource[]): V2Resource[] {
  return resources.filter((r) => {
    if (!r.type.includes("::coin::CoinStore<")) return false;
    // Skip native SUPRA
    const inner = extractCoinType(r);
    if (!inner) return false;
    if (inner.includes("::supra_coin::SupraCoin")) return false;
    return true;
  });
}

/**
 * Extract coin type string from CoinStore resource type.
 * "0x1::coin::CoinStore<0xd0f37da...::OG::OG>" → "0xd0f37da...::OG::OG"
 */
export function extractCoinType(resource: V2Resource): string | null {
  const match = resource.type.match(/CoinStore<(.+)>$/);
  return match ? match[1] : null;
}

/**
 * Get balance directly from v2 resource data — no view function needed.
 * data.coin.value is a string like "8023"
 */
export function getCoinBalance(resource: V2Resource): number {
  const coin = resource.data?.coin as { value?: string } | undefined;
  return parseInt(coin?.value ?? "0", 10);
}

/** Get display name from coin type: "0x...::OG::OG" → "OG" */
export function coinTypeName(coinType: string): string {
  const parts = coinType.split("::");
  return parts[parts.length - 1] ?? coinType;
}

/** Fetch coin metadata (name, symbol, decimals) via view functions. */
export async function fetchCoinMeta(
  coinType: string,
  network: "mainnet" | "testnet"
): Promise<{ name: string; symbol: string; decimals: number }> {
  const rpc = getRpcUrl(network);
  const call = async (fn: string, args: string[] = []) => {
    try {
      const res = await fetch(`${rpc}/rpc/v1/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ function: fn, type_arguments: [coinType], arguments: args }),
      });
      if (!res.ok) return null;
      const j = await res.json() as { result?: unknown[] };
      return j.result?.[0] ?? null;
    } catch {
      return null;
    }
  };

  const [name, symbol, decimals] = await Promise.all([
    call("0x1::coin::name"),
    call("0x1::coin::symbol"),
    call("0x1::coin::decimals"),
  ]);

  return {
    name: (name as string) || coinTypeName(coinType),
    symbol: (symbol as string) || coinTypeName(coinType),
    decimals: typeof decimals === "number" ? decimals : 6,
  };
}

/** Fetch SUPRA native balance for header display. */
export async function fetchSupraBalance(
  address: string,
  network: "mainnet" | "testnet"
): Promise<number> {
  const rpc = getRpcUrl(network);
  try {
    const res = await fetch(`${rpc}/rpc/v1/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: "0x1::coin::balance",
        type_arguments: ["0x1::supra_coin::SupraCoin"],
        arguments: [address],
      }),
    });
    const j = await res.json() as { result?: unknown[] };
    return parseInt(j.result?.[0] as string, 10) / OCTAS_PER_SUPRA;
  } catch {
    return 0;
  }
}

// ─── NFT (v1 TokenStore via transaction history) ─────────────────────────────

export interface V1Nft {
  creator: string;
  collection: string;
  name: string;
  propertyVersion: string;
}

/** Check if account has a v1 TokenStore (= has v1 NFTs). */
export function hasTokenStore(resources: V2Resource[]): boolean {
  return resources.some((r) =>
    r.type === "0x3::token::TokenStore" ||
    r.type.includes("::token::TokenStore")
  );
}

/**
 * Discover v1 NFTs by parsing recent transaction arguments.
 * This works because list_token / offer_token / transfer_token calls
 * embed collection name and token name as BCS hex-encoded strings.
 */
export async function fetchNftsFromTransactions(
  address: string,
  network: "mainnet" | "testnet",
  limit = 100
): Promise<V1Nft[]> {
  const rpc = getRpcUrl(network);
  try {
    const res = await fetch(
      `${rpc}/rpc/v1/accounts/${address}/transactions?limit=${limit}`
    );
    if (!res.ok) return [];
    const json = await res.json() as { record?: unknown[] };
    const txs = json.record ?? [];

    const nfts: V1Nft[] = [];
    const seen = new Set<string>();

    for (const tx of txs) {
      const payload = (tx as Record<string, unknown>)?.["payload"];
      const move = (payload as Record<string, unknown>)?.["Move"];
      if (!move) continue;

      const fn = (move as Record<string, unknown>).function as string ?? "";
      const args = (move as Record<string, unknown>).arguments as string[] ?? [];

      // Supra token marketplace / token module transactions
      // arg pattern: [creator_or_market_addr, collection_hex, name_hex, ...]
      if (
        fn.includes("::token") ||
        fn.includes("::token0x3") ||
        fn.includes("offer_token") ||
        fn.includes("transfer_token") ||
        fn.includes("list_token") ||
        fn.includes("direct_transfer")
      ) {
        if (args.length >= 3) {
          const collection = hexToUtf8(args[1]);
          const name = hexToUtf8(args[2]);
          const creator = args[0];
          if (collection && name) {
            const key = `${creator}::${collection}::${name}`;
            if (!seen.has(key)) {
              seen.add(key);
              nfts.push({ creator, collection, name, propertyVersion: "0" });
            }
          }
        }
      }
    }

    return nfts;
  } catch {
    return [];
  }
}

/** Decode a BCS-encoded hex string argument to UTF-8. */
function hexToUtf8(hex: string): string {
  if (!hex || !hex.startsWith("0x")) return "";
  try {
    const bytes = Buffer.from(hex.slice(2), "hex");
    // BCS strings are prefixed with ULEB128 length — try to strip it
    // Simple heuristic: if first byte looks like a length prefix, skip it
    if (bytes.length > 1 && bytes[0] < 128 && bytes[0] === bytes.length - 1) {
      return bytes.slice(1).toString("utf8");
    }
    return bytes.toString("utf8");
  } catch {
    return "";
  }
}

// ─── Transaction builders ────────────────────────────────────────────────────

/**
 * Build a coin transfer payload.
 *
 * Uses StarKey's newer Aptos wallet standard format:
 * {data: {function, typeArguments, functionArguments}}
 *
 * Until the Incinerator Move contract is deployed, we transfer coins to the
 * dev address. The dev manually sends SUPRA rebates back to users.
 *
 * When INCINERATOR_ADDRESS is set (contract deployed), switch to:
 *   function: `${INCINERATOR_ADDRESS}::incinerator::burn_and_rebate`
 *   functionArguments: [amount, devFeeOctas.toString()]
 */
export function buildBurnCoinPayload(
  coinType: string,
  rawBalance: string,
  _devFeeOctas: number
): object {
  return {
    data: {
      function: "0x1::coin::transfer",
      typeArguments: [coinType],
      // Transfer full balance to dev address; dev sends rebate back off-chain
      functionArguments: [DEV_ADDRESS, rawBalance],
    },
  };
}

/**
 * Submit a transaction via the connected StarKey wallet.
 * StarKey injects `window.starkey.supra` and handles signing + submission.
 */
export async function submitTransaction(payload: object): Promise<{ hash: string }> {
  type StarKey = {
    supra: {
      sendTransaction: (p: object) => Promise<string | { hash?: string; txHash?: string }>;
    };
  };
  const starkey = (window as Window & { starkey?: StarKey }).starkey;
  if (!starkey?.supra) throw new Error("StarKey wallet not found. Please install it.");
  const result = await starkey.supra.sendTransaction(payload);
  // StarKey may return a tx hash string OR an object
  if (typeof result === "string") return { hash: result };
  return { hash: result.hash ?? result.txHash ?? String(result) };
}

export async function burnAssets(assets: Array<{
  type: "fungible" | "nft";
  coinType?: string;
  rawBalance?: string;
  estimatedRebate: number;
}>): Promise<{ txHash: string; totalDevFeeOctas: number }> {
  let lastHash = "";
  let totalDevFeeOctas = 0;

  for (const asset of assets) {
    const { devFeeOctas } = calculateFee(asset.estimatedRebate);
    totalDevFeeOctas += devFeeOctas;

    if (asset.type === "fungible" && asset.coinType && asset.rawBalance) {
      const payload = buildBurnCoinPayload(asset.coinType, asset.rawBalance, devFeeOctas);
      const result = await submitTransaction(payload);
      lastHash = result.hash;
    }
    // NFT burn: add when incinerator contract is deployed
  }

  return { txHash: lastHash, totalDevFeeOctas };
}

export function getExplorerTxUrl(txHash: string, network: "mainnet" | "testnet"): string {
  const base =
    network === "mainnet"
      ? "https://suprascan.io/tx"
      : "https://testnet.suprascan.io/tx";
  return `${base}/${txHash}`;
}