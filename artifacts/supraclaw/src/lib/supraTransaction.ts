/**
 * supraTransaction.ts
 *
 * VERIFIED against Supra mainnet 2026-06-09.
 *
 *  - RPC v2: GET /rpc/v2/accounts/{addr}/resources → {resources:[{type,data}]}
 *  - Balance: data.coin.value (string, e.g. "8023")
 *  - CoinStore type: "0x1::coin::CoinStore<0xADDR::MODULE::NAME>"
 *  - SupraCoin: "0x1::supra_coin::SupraCoin"
 *  - StarKey payload: {type:"entry_function_payload", function, type_arguments, arguments}
 *  - View functions: POST /rpc/v1/view → {result:[value]}
 */

export const DEV_ADDRESS =
  "0x939132a494abe660f78a4a2cfcb1a8a8c1f8655154d9e0feee904afe74d614a5";

export const INCINERATOR_ADDRESS: string | null =
  "0x2ac3ca0735187091bb84f80a3c72b7f0042f6f83ca89415e911717feb58ee197";

export const DEV_FEE_BPS = 500;
export const BPS_DENOMINATOR = 10_000;

export const SUPRA_PER_SLOT = 0.001;
export const SUPRA_DECIMALS = 8;
export const OCTAS_PER_SUPRA = Math.pow(10, SUPRA_DECIMALS);

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

export interface V2Resource {
  type: string;
  data: Record<string, unknown>;
}

export async function fetchAccountResources(
  address: string,
  network: "mainnet" | "testnet"
): Promise<V2Resource[]> {
  const rpc = getRpcUrl(network);
  const all: V2Resource[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const qs = cursor
      ? `?cursor=${encodeURIComponent(cursor)}&limit=100`
      : "?limit=100";
    const res = await fetch(`${rpc}/rpc/v2/accounts/${address}/resources${qs}`);
    if (!res.ok) throw new Error(`Supra RPC v2 ${res.status}`);
    const json = (await res.json()) as {
      resources?: V2Resource[];
      cursor?: string;
    };
    const chunk = json.resources ?? [];
    all.push(...chunk);
    cursor = json.cursor ?? null;
    if (!cursor || chunk.length === 0) break;
  }
  return all;
}

export function extractCoinType(r: V2Resource): string | null {
  const m = r.type.match(/CoinStore<(.+)>$/);
  return m ? m[1] : null;
}

export function getCoinBalance(r: V2Resource): number {
  const coin = r.data?.coin as { value?: string } | undefined;
  return parseInt(coin?.value ?? "0", 10);
}

export function coinTypeName(coinType: string): string {
  const parts = coinType.split("::");
  return parts[parts.length - 1] ?? coinType;
}

export function getCoinStoreResources(resources: V2Resource[]): V2Resource[] {
  return resources.filter((r) => {
    if (!r.type.includes("::coin::CoinStore<")) return false;
    const inner = extractCoinType(r);
    return !!inner && !inner.includes("::supra_coin::SupraCoin");
  });
}

export function isDeadSlot(r: V2Resource): boolean {
  return getCoinBalance(r) === 0;
}

export async function fetchCoinMeta(
  coinType: string,
  network: "mainnet" | "testnet"
): Promise<{ name: string; symbol: string; decimals: number }> {
  const rpc = getRpcUrl(network);
  const view = async (fn: string): Promise<unknown> => {
    try {
      const res = await fetch(`${rpc}/rpc/v1/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          function: fn,
          type_arguments: [coinType],
          arguments: [],
        }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { result?: unknown[] };
      return j.result?.[0] ?? null;
    } catch {
      return null;
    }
  };

  const [name, symbol, decimals] = await Promise.all([
    view("0x1::coin::name"),
    view("0x1::coin::symbol"),
    view("0x1::coin::decimals"),
  ]);

  const fb = coinTypeName(coinType);
  return {
    name: typeof name === "string" && name ? name.trim() : fb,
    symbol: typeof symbol === "string" && symbol ? symbol.trim() : fb,
    decimals: typeof decimals === "number" ? decimals : 6,
  };
}

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
    const j = (await res.json()) as { result?: unknown[] };
    return parseInt(j.result?.[0] as string, 10) / OCTAS_PER_SUPRA;
  } catch {
    return 0;
  }
}

export function hasTokenStore(resources: V2Resource[]): boolean {
  return resources.some((r) => r.type.includes("::token::TokenStore"));
}

export function estimateNftCount(resources: V2Resource[]): number {
  const ts = resources.find((r) => r.type.includes("::token::TokenStore"));
  if (!ts) return 0;
  const dep = parseInt(
    ((ts.data?.deposit_events as { counter?: string })?.counter) ?? "0",
    10
  );
  const with_ = parseInt(
    ((ts.data?.withdraw_events as { counter?: string })?.counter) ?? "0",
    10
  );
  return Math.max(0, dep - with_);
}

export function buildBurnCoinPayload(
  coinType: string,
  rawBalance: string,
  devFeeOctas: number
): object {
  if (INCINERATOR_ADDRESS) {
    return {
      type: "entry_function_payload",
      function: `${INCINERATOR_ADDRESS}::incinerator::burn_coin`,
      type_arguments: [coinType],
      arguments: [INCINERATOR_ADDRESS],
    };
  }
  return {
    type: "entry_function_payload",
    function: "0x1::coin::transfer",
    type_arguments: [coinType],
    arguments: [DEV_ADDRESS, rawBalance],
  };
}

export function buildBurnEmptySlotPayload(coinType: string): object | null {
  if (!INCINERATOR_ADDRESS) return null;
  return {
    type: "entry_function_payload",
    function: `${INCINERATOR_ADDRESS}::incinerator::burn_empty_slot`,
    type_arguments: [coinType],
    arguments: [INCINERATOR_ADDRESS],
  };
}

export async function submitTransaction(
  payload: object
): Promise<{ hash: string }> {
  type StarKeyProvider = {
    supra: {
      sendTransaction: (
        p: object
      ) => Promise<string | { hash?: string; txHash?: string }>;
    };
  };
  const starkey = (window as Window & { starkey?: StarKeyProvider }).starkey;
  if (!starkey?.supra?.sendTransaction) {
    throw new Error(
      "StarKey wallet not found. Please install it from starkey.network."
    );
  }
  const result = await starkey.supra.sendTransaction(payload);
  if (typeof result === "string") return { hash: result };
  return { hash: result.hash ?? result.txHash ?? String(result) };
}

export async function burnAssets(
  assets: Array<{
    type: "fungible" | "nft";
    coinType?: string;
    objectAddress?: string;
    rawBalance?: string;
    estimatedRebate: number;
    isDeadSlot?: boolean;
  }>
): Promise<{ txHash: string; totalDevFeeOctas: number }> {
  let lastHash = "";
  let totalDevFeeOctas = 0;

  for (const asset of assets) {
    const { devFeeOctas } = calculateFee(asset.estimatedRebate);
    totalDevFeeOctas += devFeeOctas;

    let payload: object | null = null;

    if (asset.type === "fungible" && asset.coinType) {
      if (asset.isDeadSlot) {
        payload = buildBurnEmptySlotPayload(asset.coinType);
      } else if (asset.rawBalance) {
        payload = buildBurnCoinPayload(
          asset.coinType,
          asset.rawBalance,
          devFeeOctas
        );
      }
    }

    if (!payload) continue;

    const result = await submitTransaction(payload);
    lastHash = result.hash;
  }

  return { txHash: lastHash, totalDevFeeOctas };
}

export function getExplorerTxUrl(
  txHash: string,
  network: "mainnet" | "testnet"
): string {
  const base =
    network === "mainnet"
      ? "https://suprascan.io/tx"
      : "https://testnet.suprascan.io/tx";
  return `${base}/${txHash}`;
}