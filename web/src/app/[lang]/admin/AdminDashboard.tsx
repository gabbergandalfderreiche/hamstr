"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  parseAbi,
  type Address,
  type ContractFunctionParameters,
  type Hex,
} from "viem";
import { useBalance, useConnection, usePublicClient, useReadContracts } from "wagmi";
import { btcYieldVaultAbi, oracleSwapperAbi, turboVaultAbi } from "@/generated/contracts";
import { ConnectButton } from "@/components/ConnectButton";
import { Hamster } from "@/components/Hamster";
import { fetchAdminLogs, summarize, type Flow } from "@/lib/adminLogs";
import type { Live } from "@/lib/live";
import { AAVE_POOL, aavePoolAbi, isSupplyBlocked } from "@/lib/market";
import { useT } from "@/i18n/client";

const REFRESH_MS = 60_000;
const DAY = 86_400;
/** Below this the keeper can no longer pay for harvests. */
const KEEPER_MIN_ETH = 500_000_000_000_000n; // 0.0005 ETH
const TEST_USDC = 1_000_000n;
const TEST_ETH = 500_000_000_000_000n;
const MAX_UINT128 = 2n ** 128n - 1n;

const timelockAbi = parseAbi(["function getMinDelay() view returns (uint256)"]);
const positionManagerAbi = parseAbi([
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) payable returns (uint256 amount0, uint256 amount1)",
]);

type Deployment = Live["deployment"] & { keeper?: Address; multisig?: Address; treasury?: Address };
type Tone = "good" | "warn" | "bad";

const lower = (a?: string) => a?.toLowerCase() ?? "";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Operator view: revenue from the fee, users, TVL, what needs doing, health and roles.
 * Everything is public on-chain data; the wallet check only keeps the page tidy for visitors.
 */
export function AdminDashboard({ live }: { live: Live }) {
  const { t } = useT();
  const ad = t.admin;
  const loc = t.numberLocale;
  const d = live.deployment as Deployment;
  const { address } = useConnection();
  const adminWallets = [d.multisig, d.treasury].filter(Boolean).map(lower);
  const isAdmin = Boolean(address) && adminWallets.includes(lower(address));

  // ---- chain reads -------------------------------------------------------------------------
  const vaults = live.vaults;
  const turbo = d.turboVault;
  const named: [string, ContractFunctionParameters][] = [];
  for (const v of vaults) {
    const c = { address: v.address, abi: btcYieldVaultAbi } as const;
    for (const fn of ["totalSupply", "totalAssets", "depositCap", "userDepositCap", "pendingYield", "unrealizedYield", "minHarvest", "performanceFee", "paused"] as const)
      named.push([`${v.id}.${fn}`, { ...c, functionName: fn }]);
  }
  if (turbo) {
    const c = { address: turbo, abi: turboVaultAbi } as const;
    for (const fn of ["totalAssets", "totalSupply", "depositCap", "inRange", "paused", "performanceFee", "positionManager", "positionId"] as const)
      named.push([`turbo.${fn}`, { ...c, functionName: fn }]);
  }
  const quote = (from: Address, to: Address, amount: bigint) =>
    ({ address: d.swapper, abi: oracleSwapperAbi, functionName: "quote", args: [from, to, amount] }) as const;
  named.push(["satsPerUsdc", quote(d.usdc, d.cbbtc, 1_000_000n)]);
  named.push(["usdcPerEth", quote(d.weth, d.usdc, 10n ** 18n)]);
  named.push(["satsPerEth", quote(d.weth, d.cbbtc, 10n ** 18n)]);
  const treasury = d.treasury ?? d.multisig;
  if (treasury)
    for (const [k, token] of [["usdc", d.usdc], ["weth", d.weth], ["cbbtc", d.cbbtc]] as const)
      named.push([`treasury.${k}`, { address: token, abi: erc20Abi, functionName: "balanceOf", args: [treasury] }]);
  for (const [k, asset] of [["usdc", d.usdc], ["weth", d.weth]] as const) {
    named.push([`aave.${k}.config`, { address: AAVE_POOL, abi: aavePoolAbi, functionName: "getConfiguration", args: [asset] }]);
    named.push([`aave.${k}.reserve`, { address: AAVE_POOL, abi: aavePoolAbi, functionName: "getReserveData", args: [asset] }]);
  }
  named.push(["timelock.delay", { address: d.timelock, abi: timelockAbi, functionName: "getMinDelay" }]);

  const reads = useReadContracts({ contracts: named.map((n) => n[1]), query: { enabled: isAdmin, refetchInterval: REFRESH_MS } });
  const r = useMemo(() => {
    const out: Record<string, unknown> = {};
    named.forEach(([key], i) => (out[key] = reads.data?.[i]?.status === "success" ? reads.data[i].result : undefined));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reads.data]);
  const big = (key: string) => (r[key] as bigint | undefined) ?? 0n;

  const treasuryEth = useBalance({ address: treasury, query: { enabled: isAdmin && Boolean(treasury), refetchInterval: REFRESH_MS } });
  const keeperEth = useBalance({ address: d.keeper, query: { enabled: isAdmin && Boolean(d.keeper), refetchInterval: REFRESH_MS } });

  // Aave: how much the reserve could pay out right now (underlying sitting at the aToken).
  const aToken = (k: string) => (r[`aave.${k}.reserve`] as { aTokenAddress: Address } | undefined)?.aTokenAddress;
  const liquidity = useReadContracts({
    contracts: [
      { address: d.usdc, abi: erc20Abi, functionName: "balanceOf", args: [aToken("usdc") ?? d.usdc] },
      { address: d.weth, abi: erc20Abi, functionName: "balanceOf", args: [aToken("weth") ?? d.weth] },
      { address: aToken("usdc") ?? d.usdc, abi: erc20Abi, functionName: "totalSupply" },
      { address: aToken("weth") ?? d.weth, abi: erc20Abi, functionName: "totalSupply" },
    ],
    query: { enabled: isAdmin && Boolean(aToken("usdc") && aToken("weth")), refetchInterval: REFRESH_MS },
  });

  // Turbo fees still in the Uniswap position; 10 % of them become protocol revenue on the next collect.
  const client = usePublicClient();
  const positionManager = r["turbo.positionManager"] as Address | undefined;
  const positionId = big("turbo.positionId");
  const uncollected = useQuery({
    queryKey: ["admin-turbo-uncollected", positionManager, positionId.toString()],
    queryFn: async () =>
      (
        await client!.simulateContract({
          address: positionManager!,
          abi: positionManagerAbi,
          functionName: "collect",
          args: [{ tokenId: positionId, recipient: turbo!, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
          account: turbo!,
        })
      ).result,
    enabled: isAdmin && Boolean(client && positionManager && turbo) && positionId > 0n,
    refetchInterval: REFRESH_MS,
  });

  // ---- event history -----------------------------------------------------------------------
  const logs = useQuery({
    queryKey: ["admin-logs", d.usdcVault],
    queryFn: () => fetchAdminLogs(live),
    enabled: isAdmin,
    refetchInterval: 120_000,
  });
  const s = useMemo(() => (logs.data ? summarize(live, logs.data) : null), [live, logs.data]);
  const wallets = useMemo(() => (s ? [...s.firstSeen.keys()] : []), [s]);

  const holdings = useReadContracts({
    contracts: wallets.flatMap((w) => [
      ...vaults.map((v) => ({ address: v.address, abi: btcYieldVaultAbi, functionName: "balanceOf", args: [w] }) as const),
      ...(turbo ? [{ address: turbo, abi: turboVaultAbi, functionName: "balanceOf", args: [w] } as const] : []),
    ]),
    query: { enabled: isAdmin && wallets.length > 0, refetchInterval: REFRESH_MS },
  });

  if (!isAdmin) {
    return (
      <section className="card mx-auto max-w-lg p-8 text-center">
        <Hamster size={96} mood="wink" title="" className="mx-auto" />
        <h1 className="font-display mt-4 text-2xl font-extrabold">{ad.gateTitle}</h1>
        <p className="mt-2 text-sm text-muted">{ad.gateText}</p>
        <div className="mt-5 flex justify-center">
          <ConnectButton />
        </div>
      </section>
    );
  }

  // ---- numbers -----------------------------------------------------------------------------
  const satsPerUsdc = big("satsPerUsdc");
  const usdcPerEth = big("usdcPerEth");
  const satsPerEth = big("satsPerEth");
  const ethToSats = (wei: bigint) => (wei * satsPerEth) / 10n ** 18n;
  const assetToSats = (vault: Address, amount: bigint) =>
    lower(vault) === lower(d.usdcVault) ? (amount * satsPerUsdc) / 1_000_000n : ethToSats(amount);
  const satsToUsd = (sats: bigint | number) => (satsPerUsdc > 0n ? Number(sats) / Number(satsPerUsdc) : 0);
  const assetToUsd = (vault: Address, amount: bigint) =>
    lower(vault) === lower(d.usdcVault) ? Number(amount) / 1e6 : (Number(amount) / 1e18) * (Number(usdcPerEth) / 1e6);
  const ethUsd = Number(usdcPerEth) / 1e6;

  const num = (n: number, digits = 0) => n.toLocaleString(loc, { maximumFractionDigits: digits });
  const usd = (n: number) => `$ ${n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sats = (n: bigint | number) => `${num(Number(n))} sats`;
  const date = (sec: number) => new Date(sec * 1000).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" });
  // "Now" is the time of the latest block, so the time windows match the loaded history.
  const now = logs.data?.latestTime ?? 0;
  const since = (sec: number) => (x: { time: number }) => x.time >= now - sec;

  // Revenue: harvest fees (cbBTC) + Turbo protocol fees (WETH at today's price + cbBTC).
  const revenueIn = (window: number) => {
    if (!s) return 0n;
    const h = s.harvestFees.filter(since(window)).reduce((sum, f) => sum + f.sats, 0n);
    const tf = s.turboFees.filter(since(window)).reduce((sum, f) => sum + f.sats + ethToSats(f.weth), 0n);
    return h + tf;
  };
  const windows = [
    [ad.windows.day, DAY],
    [ad.windows.week, 7 * DAY],
    [ad.windows.month, 30 * DAY],
    [ad.windows.all, Number.MAX_SAFE_INTEGER],
  ] as const;
  const revenueByVault = s
    ? [
        ...vaults.map((v) => ({
          name: t.vaults[v.id].name,
          sats: s.harvestFees.filter((f) => lower(f.vault) === lower(v.address)).reduce((sum, f) => sum + f.sats, 0n),
        })),
        { name: t.turbo.title, sats: s.turboFees.reduce((sum, f) => sum + f.sats + ethToSats(f.weth), 0n) },
      ]
    : [];

  // Revenue still on its way: the fee share of interest not yet harvested, and of Turbo fees not yet collected.
  const pendingFeeSats =
    vaults.reduce((sum, v) => {
      const earned = big(`${v.id}.pendingYield`) + big(`${v.id}.unrealizedYield`);
      return sum + (assetToSats(v.address, earned) * big(`${v.id}.performanceFee`)) / 10_000n;
    }, 0n) +
    (uncollected.data
      ? ((ethToSats(uncollected.data[0]) + uncollected.data[1]) * big("turbo.performanceFee")) / 10_000n
      : 0n);

  // Users and holdings.
  const turboPerShare = big("turbo.totalSupply") > 0n ? Number(big("turbo.totalAssets")) / Number(big("turbo.totalSupply")) : 0;
  const perVault = vaults.length + (turbo ? 1 : 0);
  const holders = wallets
    .map((w, i) => {
      const bal = (j: number) => (holdings.data?.[i * perVault + j]?.result as bigint | undefined) ?? 0n;
      const usdValue =
        vaults.reduce((sum, v, j) => sum + assetToUsd(v.address, bal(j)), 0) +
        (turbo ? ((Number(bal(vaults.length)) * turboPerShare) / 1e18) * ethUsd : 0);
      return { wallet: w, usd: usdValue };
    })
    .sort((a, b) => b.usd - a.usd);
  const active = holders.filter((h) => h.usd > 0);
  const tvlUsd =
    vaults.reduce((sum, v) => sum + assetToUsd(v.address, big(`${v.id}.totalAssets`)), 0) +
    (Number(big("turbo.totalAssets")) / 1e18) * ethUsd;

  const isTest = (f: Flow) =>
    (lower(f.vault) === lower(d.usdcVault) && f.amount === TEST_USDC) || (lower(f.vault) === lower(d.ethVault) && f.amount === TEST_ETH);
  const testWallets = new Set(s?.deposits.filter(isTest).map((f) => f.wallet) ?? []);
  const convertedWallets = new Set(s?.deposits.filter((f) => !isTest(f) && testWallets.has(f.wallet)).map((f) => f.wallet) ?? []);

  const days = Array.from({ length: 14 }, (_, i) => {
    const end = now - i * DAY;
    const start = end - DAY;
    const inDay = (x: { time: number }) => x.time > start && x.time <= end;
    return {
      label: new Date(end * 1000).toLocaleDateString(loc, { day: "numeric", month: "numeric" }),
      newWallets: [...(s?.firstSeen.values() ?? [])].filter((time) => inDay({ time })).length,
      inUsd: s?.deposits.filter(inDay).reduce((sum, f) => sum + assetToUsd(f.vault, f.amount), 0) ?? 0,
      outUsd: s?.withdrawals.filter(inDay).reduce((sum, f) => sum + assetToUsd(f.vault, f.amount), 0) ?? 0,
    };
  }).reverse();

  // Health checks.
  const aaveOk = (k: "usdc" | "weth") => {
    const cfg = r[`aave.${k}.config`] as bigint | undefined;
    return cfg === undefined ? undefined : !isSupplyBlocked(cfg);
  };
  const ourAtAave = (id: "usdc" | "eth") => big(`${id}.totalAssets`);
  const aaveLiquidity = [
    { id: "usdc" as const, free: (liquidity.data?.[0]?.result as bigint | undefined) ?? 0n, supplied: (liquidity.data?.[2]?.result as bigint | undefined) ?? 0n, dec: 6, sym: "USDC" },
    { id: "eth" as const, free: (liquidity.data?.[1]?.result as bigint | undefined) ?? 0n, supplied: (liquidity.data?.[3]?.result as bigint | undefined) ?? 0n, dec: 18, sym: "ETH" },
  ];
  const pricesOk = satsPerUsdc > 0n && usdcPerEth > 0n && satsPerEth > 0n;
  const keeperBal = keeperEth.data?.value;

  const checks: { label: string; tone: Tone; detail: string }[] = [
    ...vaults.map((v) => {
      const solvent = big(`${v.id}.totalAssets`) >= big(`${v.id}.totalSupply`) + big(`${v.id}.pendingYield`);
      return { label: ad.health.solvent(t.vaults[v.id].name), tone: (solvent ? "good" : "bad") as Tone, detail: solvent ? ad.health.solventOk : ad.health.solventBad };
    }),
    ...(["usdc", "weth"] as const).map((k) => {
      const ok = aaveOk(k);
      return { label: ad.health.aave(k === "usdc" ? "USDC" : "WETH"), tone: (ok === false ? "warn" : "good") as Tone, detail: ok === false ? ad.health.aaveFrozen : ad.health.aaveOpen };
    }),
    ...aaveLiquidity.map((l) => {
      // Utilization near 100 % means big withdrawals across Aave may have to wait until borrowers repay.
      const utilization = l.supplied > 0n ? 1 - Number(l.free) / Number(l.supplied) : 0;
      const tone: Tone = l.free < ourAtAave(l.id) ? "bad" : utilization > 0.98 ? "warn" : "good";
      return {
        label: ad.health.liquidity(l.sym),
        tone,
        detail: ad.health.liquidityDetail(
          num(Number(formatUnits(l.free, l.dec)), 2),
          num(Number(formatUnits(ourAtAave(l.id), l.dec)), 6),
          l.sym,
          num(utilization * 100, 2),
        ),
      };
    }),
    { label: ad.health.prices, tone: pricesOk ? "good" : "bad", detail: pricesOk ? ad.health.pricesOk : ad.health.pricesBad },
    ...(turbo
      ? [{ label: ad.health.turboRange, tone: (r["turbo.inRange"] ? "good" : "warn") as Tone, detail: r["turbo.inRange"] ? ad.health.inRange : ad.health.outOfRange }]
      : []),
    ...[...vaults.map((v) => ({ name: t.vaults[v.id].name, key: `${v.id}.paused` })), ...(turbo ? [{ name: t.turbo.title, key: "turbo.paused" }] : [])].map((p) => ({
      label: ad.health.paused(p.name),
      tone: (r[p.key] ? "warn" : "good") as Tone,
      detail: r[p.key] ? ad.health.isPaused : ad.health.running,
    })),
  ];

  // Things to do.
  const todo: { tone: Tone; text: string }[] = [];
  for (const v of vaults) {
    const earned = big(`${v.id}.pendingYield`) + big(`${v.id}.unrealizedYield`);
    const min = big(`${v.id}.minHarvest`);
    const fmtAsset = (x: bigint) => `${num(Number(formatUnits(x, v.decimals)), v.decimals === 6 ? 4 : 8)} ${v.symbol}`;
    todo.push(
      earned >= min && min > 0n
        ? { tone: "warn", text: ad.todo.harvestDue(t.vaults[v.id].name, fmtAsset(earned)) }
        : { tone: "good", text: ad.todo.harvestNotYet(t.vaults[v.id].name, fmtAsset(earned), fmtAsset(min), s?.lastHarvest.get(v.address) ? date(s.lastHarvest.get(v.address)!) : ad.never) },
    );
  }
  if (keeperBal !== undefined)
    todo.push(
      keeperBal < KEEPER_MIN_ETH
        ? { tone: "bad", text: ad.todo.keeperLow(num(Number(formatUnits(keeperBal, 18)), 6)) }
        : { tone: "good", text: ad.todo.keeperOk(num(Number(formatUnits(keeperBal, 18)), 6)) },
    );
  for (const v of vaults) {
    const used = big(`${v.id}.depositCap`) > 0n ? Number(big(`${v.id}.totalSupply`)) / Number(big(`${v.id}.depositCap`)) : 0;
    if (used >= 0.8) todo.push({ tone: "warn", text: ad.todo.capNearlyFull(t.vaults[v.id].name, Math.round(used * 100)) });
  }

  const contractName = (a: string) =>
    ({
      [lower(d.usdcVault)]: t.vaults.usdc.name,
      [lower(d.ethVault)]: t.vaults.eth.name,
      [lower(turbo)]: t.turbo.title,
      [lower(d.timelock)]: "Timelock",
    })[lower(a)] ?? short(a);
  const accountName = (a: string) =>
    ({
      [lower(d.multisig)]: ad.you,
      [lower(d.keeper)]: "Keeper",
      [lower(d.timelock)]: "Timelock",
    })[lower(a)] ?? short(a);
  const opName = (target: Address, data: Hex) => {
    for (const abi of [btcYieldVaultAbi, turboVaultAbi]) {
      try {
        return decodeFunctionData({ abi, data }).functionName;
      } catch {
        // try the next ABI
      }
    }
    return data.slice(0, 10);
  };

  const maxDay = Math.max(1, ...days.map((x) => Math.max(x.inUsd, x.outUsd)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{ad.title}</h1>
          <p className="text-sm text-muted">{ad.sub}</p>
        </div>
        <div className="text-xs text-muted">
          {logs.isFetching ? ad.loading : logs.data ? ad.updated(date(logs.data.latestTime)) : ""}
        </div>
      </div>
      {logs.error && <p className="card p-4 text-sm text-red-600">{ad.logsError}</p>}

      {/* Revenue */}
      <Section title={ad.revenue.title} hint={ad.revenue.hint}>
        <div className="grid gap-3 sm:grid-cols-4">
          {windows.map(([label, w]) => {
            const v = revenueIn(w);
            return <Stat key={label} label={label} value={sats(v)} hint={usd(satsToUsd(v))} accent />;
          })}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Box title={ad.revenue.byVault}>
            {revenueByVault.map((x) => (
              <Row key={x.name} label={x.name} value={`${sats(x.sats)} · ${usd(satsToUsd(x.sats))}`} />
            ))}
            <Row label={ad.revenue.pending} value={`≈ ${sats(pendingFeeSats)} · ${usd(satsToUsd(pendingFeeSats))}`} muted />
          </Box>
          <Box title={ad.revenue.treasury(treasury ? short(treasury) : "–")}>
            <Row label="cbBTC" value={`${sats(big("treasury.cbbtc"))} · ${usd(satsToUsd(big("treasury.cbbtc")))}`} />
            <Row label="WETH" value={`${num(Number(formatUnits(big("treasury.weth"), 18)), 8)} · ${usd((Number(big("treasury.weth")) / 1e18) * ethUsd)}`} />
            <Row label="USDC" value={usd(Number(big("treasury.usdc")) / 1e6)} />
            <Row label="ETH" value={`${num(Number(formatUnits(treasuryEth.data?.value ?? 0n, 18)), 6)} · ${usd((Number(treasuryEth.data?.value ?? 0n) / 1e18) * ethUsd)}`} />
            <p className="mt-2 text-xs text-muted">{ad.revenue.treasuryNote}</p>
          </Box>
        </div>
      </Section>

      {/* Users */}
      <Section title={ad.users.title}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={ad.users.ever} value={num(wallets.length)} />
          <Stat label={ad.users.active} value={num(active.length)} />
          <Stat label={ad.users.testRuns} value={num(testWallets.size)} hint={ad.users.converted(convertedWallets.size)} />
          <Stat label={ad.users.tvl} value={usd(tvlUsd)} hint={ad.users.perWallet(usd(active.length ? tvlUsd / active.length : 0))} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Box title={ad.users.top}>
            {active.slice(0, 10).map((h, i) => (
              <Row
                key={h.wallet}
                label={`${i + 1}. ${accountName(h.wallet)}`}
                value={`${usd(h.usd)} · ${num(tvlUsd ? (h.usd / tvlUsd) * 100 : 0, 1)} %`}
              />
            ))}
            {active.length === 0 && <p className="text-sm text-muted">{ad.users.none}</p>}
            {active[0] && tvlUsd > 0 && active[0].usd / tvlUsd > 0.5 && (
              <p className="mt-2 text-xs font-semibold text-btc-ink">{ad.users.concentration}</p>
            )}
          </Box>
          <Box title={ad.users.daily}>
            <div className="flex h-32 items-end gap-1">
              {days.map((x) => (
                <div key={x.label} className="flex flex-1 flex-col items-center gap-1" title={`${x.label}: +${x.newWallets} · ${usd(x.inUsd)} / −${usd(x.outUsd)}`}>
                  <div className="flex h-24 w-full items-end justify-center gap-px">
                    <div className="w-1/2 rounded-t bg-good" style={{ height: `${(x.inUsd / maxDay) * 100}%` }} />
                    <div className="w-1/2 rounded-t bg-red-400" style={{ height: `${(x.outUsd / maxDay) * 100}%` }} />
                  </div>
                  <span className="num text-[9px] text-muted">{x.newWallets > 0 ? `+${x.newWallets}` : "·"}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{ad.users.dailyLegend}</p>
          </Box>
        </div>
      </Section>

      {/* TVL and limits */}
      <Section title={ad.tvl.title}>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ...vaults.map((v) => ({
              name: t.vaults[v.id].name,
              total: big(`${v.id}.totalAssets`),
              supply: big(`${v.id}.totalSupply`),
              cap: big(`${v.id}.depositCap`),
              perUser: big(`${v.id}.userDepositCap`),
              dec: v.decimals,
              sym: v.symbol,
            })),
            ...(turbo
              ? [{ name: t.turbo.title, total: big("turbo.totalAssets"), supply: big("turbo.totalAssets"), cap: big("turbo.depositCap"), perUser: 0n, dec: 18, sym: "ETH" }]
              : []),
          ].map((x) => {
            const used = x.cap > 0n ? Number(x.supply) / Number(x.cap) : 0;
            const f = (v: bigint) => num(Number(formatUnits(v, x.dec)), x.dec === 6 ? 2 : 5);
            return (
              <Box key={x.name} title={x.name}>
                <div className="num font-display text-xl font-extrabold">
                  {f(x.total)} {x.sym}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                  <div className={`h-full ${used >= 0.8 ? "bg-btc" : "bg-good"}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
                </div>
                <div className="num mt-1 text-xs text-muted">{ad.tvl.cap(f(x.supply), f(x.cap), x.sym, num(used * 100, 1))}</div>
                {x.perUser > 0n && <div className="num text-xs text-muted">{ad.tvl.perUser(f(x.perUser), x.sym)}</div>}
              </Box>
            );
          })}
        </div>
      </Section>

      {/* To do */}
      <Section title={ad.todo.title}>
        <div className="space-y-2">
          {todo.map((x) => (
            <Line key={x.text} tone={x.tone}>
              {x.text}
            </Line>
          ))}
          {s?.pendingOps.map((op) => (
            <Line key={op.id} tone="warn">
              {ad.todo.timelock(contractName(op.target), opName(op.target, op.data), op.readyAt <= now ? ad.todo.ready : date(op.readyAt))}
            </Line>
          ))}
          {s && s.pendingOps.length === 0 && <Line tone="good">{ad.todo.noTimelock(num(Number(big("timelock.delay")) / 3600))}</Line>}
        </div>
      </Section>

      {/* Health */}
      <Section title={ad.health.title} hint={ad.health.hint}>
        <div className="grid gap-2 md:grid-cols-2">
          {checks.map((c) => (
            <Line key={c.label} tone={c.tone}>
              <span className="font-semibold">{c.label}</span> <span className="text-muted">– {c.detail}</span>
            </Line>
          ))}
        </div>
      </Section>

      {/* Roles */}
      <Section title={ad.roles.title} hint={ad.roles.hint}>
        <div className="grid gap-3 md:grid-cols-2">
          {[...(s?.roles.entries() ?? [])].map(([contract, byRole]) => (
            <Box key={contract} title={contractName(contract)}>
              {[...byRole.entries()]
                .filter(([, holders]) => holders.size > 0)
                .map(([roleName, holders]) => (
                  <Row key={roleName} label={roleName} value={[...holders].map(accountName).join(", ")} />
                ))}
            </Box>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`num font-display mt-1 text-2xl font-extrabold ${accent ? "text-btc-ink" : ""}`}>{value}</div>
      {hint && <div className="num mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-2 text-sm font-bold">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${muted ? "text-muted" : ""}`}>
      <span>{label}</span>
      <span className="num text-right">{value}</span>
    </div>
  );
}

function Line({ tone, children }: { tone: Tone; children: ReactNode }) {
  const dot = { good: "bg-good", warn: "bg-btc", bad: "bg-red-500" }[tone];
  return (
    <div className="card flex items-start gap-3 px-4 py-3 text-sm">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span>{children}</span>
    </div>
  );
}
