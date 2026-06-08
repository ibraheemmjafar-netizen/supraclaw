/**
 * supraTransaction.ts
 * Helpers for Supra Move transactions via StarKey Wallet.
 */

export const INCINERATOR_ADDRESS =
  "0x939132a494abe660f78a4a2cfcb1a8a8c1f8655154d9e0feee904afe74d614a5";

export const DEV_ADDRESS =
  "0x939132a494abe660f78a4a2cfcb1a8a8c1f8655154d9e0feee904afe74d614a5";

export const DEV_FEE_BPS = 500;
export const BPS_DENOMINATOR = 10_000;
export const SUPRA_DECIMALS = 8;
export const OCTAS_PER_SUPRA = 10 ** SUPRA_DECIMALS;

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

// ─── RPC helpers ─────────────────────────────────────────────────────────────

export interface RawResource {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Fetch ALL account resources with pagination.
 * Handles both `{result: [...]}` and direct-array responses from Supra RPC.
 */
export async function fetchAccountResources(
  address: string,
  network: "mainnet" | "testnet"
): Promise<RawResource[]> {
  const rpc = getRpcUrl(network);
  const all: RawResource[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    // cap at 20 pages to avoid infinite loop
    const url = cursor
      ? `${rpc}/rpc/v1/accounts/${address}/resources?cursor=${encodeURIComponent(cursor)}&limit=100`
      : `${rpc}/rpc/v1/accounts/${address}/resources?limit=100`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`RPC ${res.status}: ${await res.text()}`);

    const json = await res.json() as unknown;

    // Normalise: Supra wraps in {result:[...]} or returns array directly
    let page_resources: RawResource[];
    if (Array.isArray(json)) {
      page_resources = json as RawResource[];
      cursor = null;
    } else if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      page_resources = (Array.isArray(obj["result"]) ? obj["result"] : []) as RawResource[];
      cursor = typeof obj["cursor"] === "string" ? obj["cursor"] : null;
    } else {
      break;
    }

    all.push(...page_resources);
    if (!cursor || page_resources.length === 0) break;
  }

  return all;
}

/**
 * Fetch token events from an account to discover v1 owned NFTs.
 * Uses the deposit_events handle from TokenStore.
 */
export async function fetchTokenEvents(
  address: string,
  network: "mainnet" | "testnet",
  eventHandle: string,
  limit = 50
): Promise<unknown[]> {
  const rpc = getRpcUrl(network);
  const url = `${rpc}/rpc/v1/accounts/${address}/events/${eventHandle}?limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json() as unknown;
    if (Array.isArray(json)) return json;
    const obj = json as Record<string, unknown>;
    return Array.isArray(obj["result"]) ? obj["result"] as unknown[] : [];
  } catch {
    return [];
  }
}

/**
 * Fetch a single resource by type from a given address (used for FA metadata).
 */
export async function fetchResource(
  address: string,
  resourceType: string,
  network: "mainnet" | "testnet"
): Promise<Record<string, unknown> | null> {
  const rpc = getRpcUrl(network);
  const url = `${rpc}/rpc/v1/accounts/${address}/resource/${encodeURIComponent(resourceType)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as unknown;
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      return (obj["result"] ?? obj) as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Token parsers ────────────────────────────────────────────────────────────

/** Parse legacy CoinStore resources (non-SUPRA, non-zero balance). */
export function parseCoinResources(resources: RawResource[]) {
  const PREFIX = "0x1::coin::CoinStore<";
  return resources
    .filter((r) =>
      r.type.startsWith(PREFIX) &&
      !r.type.includes("supra_coin::SupraCoin") &&
      !r.type.includes("0x1::coin::CoinStore<0x1::")
    )
    .map((r) => {
      const coinType = r.type.replace(PREFIX, "").replace(/>$/, "");
      const coinData = r.data as { coin?: { value?: string } };
      const rawBalance = coinData?.coin?.value ?? "0";
      const balance = parseInt(rawBalance, 10);
      const parts = coinType.split("::");
      const name = parts[parts.length - 1] ?? coinType;
      return { coinType, name, balance, rawBalance, estimatedRebate: 0.001 };
    })
    .filter((c) => c.balance > 0);
}

/**
 * Parse Fungible Asset stores from account resources.
 * Supra may store these directly on the account as:
 *   0x1::fungible_asset::FungibleStore
 *   0x1::primary_fungible_store::PrimaryFungibleStore
 *   (some Supra-specific variant)
 */
export interface FaTokenInfo {
  metadataAddress: string;
  balance: number;
  rawBalance: string;
  estimatedRebate: number;
}

export function parseFaResources(resources: RawResource[]): FaTokenInfo[] {
  const FA_PATTERNS = [
    "fungible_asset::FungibleStore",
    "primary_fungible_store",
    "::FungibleStore",
  ];

  return resources
    .filter((r) => FA_PATTERNS.some((p) => r.type.includes(p)))
    .map((r) => {
      const data = r.data as {
        balance?: string;
        metadata?: { inner?: string };
      };
      const rawBalance = data?.balance ?? "0";
      const balance = parseInt(rawBalance, 10);
      const metadataAddress = data?.metadata?.inner ?? "";
      return { metadataAddress, balance, rawBalance, estimatedRebate: 0.002 };
    })
    .filter((fa) => fa.balance > 0 && fa.metadataAddress);
}

/**
 * Resolve FA metadata (name + symbol) from the metadata object address.
 * Falls back gracefully if the fetch fails.
 */
export async function resolveFaMetadata(
  metadataAddress: string,
  network: "mainnet" | "testnet"
): Promise<{ name: string; symbol: string; decimals: number }> {
  try {
    const data = await fetchResource(
      metadataAddress,
      "0x1::fungible_asset::Metadata",
      network
    );
    if (!data) throw new Error("no metadata");
    const meta = data as { name?: string; symbol?: string; decimals?: number };
    return {
      name: meta.name ?? metadataAddress.slice(0, 8),
      symbol: meta.symbol ?? "???",
      decimals: meta.decimals ?? 8,
    };
  } catch {
    return { name: metadataAddress.slice(0, 8), symbol: "???", decimals: 8 };
  }
}

/**
 * Parse v1 NFT TokenStore — returns the deposit event handle for querying.
 * The TokenStore resource IS directly on the account (not an object).
 */
export interface TokenStoreInfo {
  depositEventHandle: string;
  withdrawEventHandle: string;
}

export function parseTokenStore(resources: RawResource[]): TokenStoreInfo | null {
  const store = resources.find((r) => r.type === "0x3::token::TokenStore");
  if (!store) return null;

  const data = store.data as {
    deposit_events?: { guid?: { id?: { addr?: string; creation_num?: string } } };
    withdraw_events?: { guid?: { id?: { addr?: string; creation_num?: string } } };
  };

  const depositGuid = data?.deposit_events?.guid?.id;
  const withdrawGuid = data?.withdraw_events?.guid?.id;

  if (!depositGuid?.addr) return null;

  return {
    depositEventHandle: `${depositGuid.addr}::${depositGuid.creation_num}`,
    withdrawEventHandle: withdrawGuid?.addr
      ? `${withdrawGuid.addr}::${withdrawGuid.creation_num}`
      : "",
  };
}

/**
 * Fetch SUPRA balance for display in header.
 */
export async function fetchSupraBalance(
  address: string,
  network: "mainnet" | "testnet"
): Promise<number> {
  try {
    const resources = await fetchAccountResources(address, network);
    const store = resources.find(
      (r) => r.type === "0x1::coin::CoinStore<0x1::supra_coin::SupraCoin>"
    );
    if (!store) return 0;
    const data = store.data as { coin?: { value?: string } };
    return parseInt(data?.coin?.value ?? "0", 10) / OCTAS_PER_SUPRA;
  } catch {
    return 0;
  }
}

// ─── Transaction payloads ────────────────────────────────────────────────────

export function buildBurnCoinPayload(
  coinType: string,
  amount: string,
  devFeeOctas: number,
  coinTypeName: string
): object {
  return {
    function: `${INCINERATOR_ADDRESS}::incinerator::burn_coin`,
    type_arguments: [coinType],
    arguments: [amount, devFeeOctas.toString(), coinTypeName],
    type: "entry_function_payload",
  };
}

export function buildIncinerateObjectPayload(
  objectAddress: string,
  devFeeOctas: number
): object {
  return {
    function: `${INCINERATOR_ADDRESS}::incinerator::incinerate_object`,
    type_arguments: [],
    // Pass object address — StarKey resolves Object<ObjectCore> from address
    arguments: [objectAddress, devFeeOctas.toString()],
    type: "entry_function_payload",
  };
}

// ─── Transaction submission ──────────────────────────────────────────────────

export async function submitTransaction(payload: object): Promise<{ hash: string; success: boolean }> {
  const starkey = (window as Window & {
    starkey?: { supra: { sendTransaction: (p: object) => Promise<{ hash: string }> } };
  }).starkey;
  if (!starkey?.supra) throw new Error("StarKey wallet is not installed");
  const result = await starkey.supra.sendTransaction(payload);
  return { hash: result.hash, success: true };
}

export async function burnAssets(
  assets: Array<{
    type: "fungible" | "nft";
    coinType?: string;
    objectAddress?: string;
    rawBalance?: string;
    estimatedRebate: number;
  }>
): Promise<{ txHash: string; totalDevFeeOctas: number }> {
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
        devFeeOctas,
        asset.coinType.split("::").pop() ?? asset.coinType
      );
    } else if (asset.type === "nft" && asset.objectAddress) {
      payload = buildIncinerateObjectPayload(asset.objectAddress, devFeeOctas);
    } else {
      continue;
    }

    const result = await submitTransaction(payload);
    lastHash = result.hash;
  }

  return { txHash: lastHash, totalDevFeeOctas };
}

// ─── Explorer ────────────────────────────────────────────────────────────────

export function getExplorerTxUrl(txHash: string, network: "mainnet" | "testnet"): string {
  const base =
    network === "mainnet"
      ? "https://explorer.supra.com/txn"
      : "https://explorer-testnet.supra.com/txn";
  return `${base}/${txHash}`;
}