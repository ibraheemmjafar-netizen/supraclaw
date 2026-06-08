/**
 * supraTransaction.ts — Supra RPC + StarKey transaction helpers.
 *
 * VERIFIED against mainnet RPC at https://rpc-mainnet.supra.com
 * Real API format: {"Resources":{"resource":[[typeStr, typeData], ...]}}
 * Balances come from POST /rpc/v1/view with 0x1::coin::balance view fn.
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

// ─── Supra RPC resource type from the API ────────────────────────────────────
// Resources endpoint returns: {"Resources":{"resource":[[typeStr, typeData], ...]}}
// typeData contains type metadata ONLY — balances are fetched via view functions.

interface SupraTypeData {
  address: string;
  module: string;
  name: string;
  type_args: Array<{
    struct?: { address: string; module: string; name: string; type_args: unknown[] };
  }>;
}

export interface RawSupraResource {
  typeStr: string;    // e.g. "0x1::coin::CoinStore<d0f37d...::OG::OG>"
  typeData: SupraTypeData;
}

/**
 * Fetch all account resources. Handles pagination.
 * Real Supra API returns: {"Resources":{"resource":[[typeStr,typeData],...]},"cursor":"..."}
 */
export async function fetchAccountResources(
  address: string,
  network: "mainnet" | "testnet"
): Promise<RawSupraResource[]> {
  const rpc = getRpcUrl(network);
  const all: RawSupraResource[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const url = cursor
      ? `${rpc}/rpc/v1/accounts/${address}/resources?cursor=${encodeURIComponent(cursor)}&limit=100`
      : `${rpc}/rpc/v1/accounts/${address}/resources?limit=100`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Supra RPC ${res.status}: ${await res.text()}`);
    const json = await res.json() as Record<string, unknown>;

    // Parse real format: {"Resources":{"resource":[[typeStr,typeData],...]}}
    const resourcePairs = (json?.["Resources"] as Record<string, unknown>)?.["resource"];
    if (!Array.isArray(resourcePairs)) break;

    for (const pair of resourcePairs) {
      if (Array.isArray(pair) && pair.length === 2) {
        all.push({ typeStr: pair[0] as string, typeData: pair[1] as SupraTypeData });
      }
    }

    cursor = typeof json["cursor"] === "string" ? json["cursor"] : null;
    if (!cursor || resourcePairs.length === 0) break;
  }

  return all;
}

// ─── View function caller ────────────────────────────────────────────────────

/**
 * Call a Move view function.
 * POST /rpc/v1/view → {"result": [...]}
 */
export async function callView(
  fn: string,
  typeArgs: string[],
  args: string[],
  network: "mainnet" | "testnet"
): Promise<unknown[]> {
  const rpc = getRpcUrl(network);
  const res = await fetch(`${rpc}/rpc/v1/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ function: fn, type_arguments: typeArgs, arguments: args }),
  });
  if (!res.ok) throw new Error(`view call failed ${res.status}`);
  const json = await res.json() as { result?: unknown[] };
  return json.result ?? [];
}

// ─── Coin helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the inner coin type string from a CoinStore resource.
 * type_args[0].struct gives {address (no 0x), module, name}
 */
export function extractCoinType(resource: RawSupraResource): string | null {
  const s = resource.typeData?.type_args?.[0]?.struct;
  if (!s?.address || !s?.module || !s?.name) return null;
  return `0x${s.address}::${s.module}::${s.name}`;
}

export async function fetchCoinBalance(
  coinType: string,
  walletAddress: string,
  network: "mainnet" | "testnet"
): Promise<number> {
  try {
    const result = await callView("0x1::coin::balance", [coinType], [walletAddress], network);
    return parseInt(result[0] as string, 10);
  } catch {
    return 0;
  }
}

export async function fetchCoinDecimals(
  coinType: string,
  network: "mainnet" | "testnet"
): Promise<number> {
  try {
    const result = await callView("0x1::coin::decimals", [coinType], [], network);
    return result[0] as number;
  } catch {
    return 6; // safe default for Atmos memes
  }
}

export async function fetchCoinName(
  coinType: string,
  network: "mainnet" | "testnet"
): Promise<string> {
  try {
    const result = await callView("0x1::coin::name", [coinType], [], network);
    return result[0] as string || coinType.split("::").pop() || coinType;
  } catch {
    return coinType.split("::").pop() ?? coinType;
  }
}

export async function fetchCoinSymbol(
  coinType: string,
  network: "mainnet" | "testnet"
): Promise<string> {
  try {
    const result = await callView("0x1::coin::symbol", [coinType], [], network);
    return result[0] as string || coinType.split("::").pop() || "???";
  } catch {
    return coinType.split("::").pop() ?? "???";
  }
}

/** Returns all CoinStore resources, excluding native SUPRA. */
export function getCoinStoreResources(resources: RawSupraResource[]): RawSupraResource[] {
  return resources.filter((r) => {
    if (!r.typeStr.includes("::coin::CoinStore<")) return false;
    const s = r.typeData?.type_args?.[0]?.struct;
    if (!s) return false;
    // Skip native SUPRA coin (0x1::supra_coin::SupraCoin)
    const addr = s.address.replace(/^0+/, "");
    if (addr === "1" && s.module === "supra_coin") return false;
    return true;
  });
}

/** Fetch SUPRA native balance for header display. */
export async function fetchSupraBalance(
  address: string,
  network: "mainnet" | "testnet"
): Promise<number> {
  try {
    const result = await callView(
      "0x1::coin::balance",
      ["0x1::supra_coin::SupraCoin"],
      [address],
      network
    );
    return parseInt(result[0] as string, 10) / OCTAS_PER_SUPRA;
  } catch {
    return 0;
  }
}

// ─── NFT (v1 TokenStore) ─────────────────────────────────────────────────────

export interface V1NftInfo {
  name: string;
  collection: string;
  creator: string;
  propertyVersion: string;
}

/** Check if account has a v1 TokenStore. */
export function hasTokenStore(resources: RawSupraResource[]): boolean {
  return resources.some((r) =>
    r.typeStr.includes("0x0000000000000000000000000000000000000000000000000000000000000003::token::TokenStore") ||
    r.typeStr === "0x3::token::TokenStore"
  );
}

/**
 * Fetch v1 NFT deposit events to discover owned tokens.
 * Endpoint: GET /rpc/v1/accounts/{addr}/events/0x3::token::TokenStore/deposit_events
 */
export async function fetchV1NftDepositEvents(
  address: string,
  network: "mainnet" | "testnet",
  limit = 100
): Promise<V1NftInfo[]> {
  const rpc = getRpcUrl(network);
  const url = `${rpc}/rpc/v1/accounts/${address}/events/0x3::token::TokenStore/deposit_events?limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json() as unknown;

    // Try multiple response shapes
    let events: unknown[] = [];
    if (Array.isArray(json)) events = json;
    else if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      events = Array.isArray(obj["events"]) ? obj["events"] :
               Array.isArray(obj["result"]) ? obj["result"] : [];
    }

    return events.map((ev: unknown) => {
      const e = ev as Record<string, unknown>;
      const data = (e["data"] ?? e) as Record<string, unknown>;
      const id = (data["id"] ?? data) as Record<string, unknown>;
      const tokenDataId = (id["token_data_id"] ?? id) as Record<string, unknown>;
      return {
        name: (tokenDataId["name"] as string) ?? "Unknown NFT",
        collection: (tokenDataId["collection"] as string) ?? "Unknown Collection",
        creator: (tokenDataId["creator"] as string) ?? "",
        propertyVersion: (id["property_version"] as string) ?? "0",
      };
    });
  } catch {
    return [];
  }
}

// ─── Transaction builders ────────────────────────────────────────────────────

export function buildBurnCoinPayload(
  coinType: string,
  amount: string,
  devFeeOctas: number
): object {
  return {
    function: `${INCINERATOR_ADDRESS}::incinerator::burn_coin`,
    type_arguments: [coinType],
    arguments: [amount, devFeeOctas.toString(), coinType.split("::").pop() ?? coinType],
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
    arguments: [objectAddress, devFeeOctas.toString()],
    type: "entry_function_payload",
  };
}

export async function submitTransaction(payload: object): Promise<{ hash: string }> {
  const starkey = (window as Window & {
    starkey?: { supra: { sendTransaction: (p: object) => Promise<{ hash: string }> } };
  }).starkey;
  if (!starkey?.supra) throw new Error("StarKey wallet not installed");
  return starkey.supra.sendTransaction(payload);
}

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
      payload = buildBurnCoinPayload(asset.coinType, asset.rawBalance, devFeeOctas);
    } else if (asset.type === "nft" && asset.objectAddress) {
      payload = buildIncinerateObjectPayload(asset.objectAddress, devFeeOctas);
    } else continue;

    const result = await submitTransaction(payload);
    lastHash = result.hash;
  }

  return { txHash: lastHash, totalDevFeeOctas };
}

export function getExplorerTxUrl(txHash: string, network: "mainnet" | "testnet"): string {
  const base = network === "mainnet"
    ? "https://explorer.supra.com/txn"
    : "https://explorer-testnet.supra.com/txn";
  return `${base}/${txHash}`;
}