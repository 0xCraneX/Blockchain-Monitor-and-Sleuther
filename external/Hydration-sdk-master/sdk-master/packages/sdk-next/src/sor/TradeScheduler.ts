import {
  DEFAULT_BLOCK_TIME,
  DEFAULT_MIN_BUDGET,
  ORDER_MIN_BLOCK_PERIOD,
  TWAP_BLOCK_PERIOD,
  TWAP_MAX_PRICE_IMPACT,
  TWAP_MAX_DURATION,
} from './const';
import {
  TradeDcaOrder,
  TradeOrder,
  TradeOrderError,
  TradeOrderType,
} from './types';

import { TradeRouter } from './TradeRouter';
import { TradeRouteBuilder } from './TradeRouteBuilder';

import { SYSTEM_ASSET_DECIMALS, SYSTEM_ASSET_ID } from '../consts';
import { big } from '../utils';

export type TradeSchedulerOptions = {
  blockTime?: number;
  minBudgetInNative?: bigint;
};

export class TradeScheduler {
  private readonly schedulerOptions: TradeSchedulerOptions;
  protected readonly router: TradeRouter;

  constructor(router: TradeRouter, options: TradeSchedulerOptions = {}) {
    this.router = router;
    this.schedulerOptions = Object.freeze({
      blockTime: options.blockTime ?? DEFAULT_BLOCK_TIME,
      minBudgetInNative: options.minBudgetInNative ?? DEFAULT_MIN_BUDGET,
    });
  }

  get blockTime(): number {
    return this.schedulerOptions.blockTime!;
  }

  get minOrderBudget(): bigint {
    return this.schedulerOptions.minBudgetInNative!;
  }

  /**
   * Build a DCA (Dollar Cost Averaging) order
   *
   * @param assetIn - storage key of assetIn
   * @param assetOut - storage key of assetOut
   * @param amountInTotal - order budget
   * @param duration - order duration in ms
   * @param frequency - order frequency in ms (opts)
   * @returns - dca trade order
   */
  async getDcaOrder(
    assetIn: number,
    assetOut: number,
    amountInTotal: string,
    duration: number,
    frequency?: number
  ): Promise<TradeDcaOrder> {
    const [amountInMin, trade] = await Promise.all([
      this.getMinimumOrderBudget(assetIn),
      this.router.getBestSell(assetIn, assetOut, amountInTotal),
    ]);

    const { amountIn, swaps, priceImpactPct } = trade;

    const firstSwap = swaps[0];
    const lastSwap = swaps[swaps.length - 1];

    const { assetInDecimals } = firstSwap;
    const { assetOutDecimals } = lastSwap;

    const priceImpact = Math.abs(priceImpactPct);

    const minTradeCount = this.getMinimumTradeCount(amountIn, amountInMin);
    const optTradeCount = this.getOptimalTradeCount(priceImpact);
    const tradeCount = frequency
      ? Math.round(duration / frequency)
      : optTradeCount;

    const minFreq = Math.ceil(duration / minTradeCount);
    const optFreq = Math.round(duration / optTradeCount);
    const freq = Math.round(duration / tradeCount);

    const amountInPerTrade = amountIn / BigInt(tradeCount);

    const dca = await this.router.getBestSell(
      assetIn,
      assetOut,
      amountInPerTrade
    );

    const isLessThanMinimalAmount = amountIn < amountInMin;

    const errors: TradeOrderError[] = [];
    if (isLessThanMinimalAmount) {
      errors.push(TradeOrderError.OrderTooSmall);
    }

    const amountOut = dca.amountOut * BigInt(tradeCount);
    const tradePeriod = this.toBlockPeriod(freq);
    const tradeFee = dca.tradeFee * BigInt(tradeCount);
    const tradeRoute = TradeRouteBuilder.build(swaps);

    const order = {
      assetIn: assetIn,
      assetOut: assetOut,
      errors: errors,
      frequencyMin: minFreq,
      frequencyOpt: optFreq,
      frequency: freq,
      tradeCount: tradeCount,
      tradeFee: tradeFee,
      tradeImpactPct: dca.priceImpactPct,
      tradePeriod: tradePeriod,
      tradeRoute: tradeRoute,
      type: TradeOrderType.Dca,
    } as Partial<TradeDcaOrder>;

    return {
      ...order,
      amountIn: amountIn,
      amountOut: amountOut,
      tradeAmountIn: dca.amountIn,
      tradeAmountOut: dca.amountOut,
      toHuman() {
        return {
          ...order,
          amountIn: big.toDecimal(amountIn, assetInDecimals),
          amountOut: big.toDecimal(amountOut, assetOutDecimals),
          tradeAmountIn: big.toDecimal(dca.amountIn, assetInDecimals),
          tradeAmountOut: big.toDecimal(dca.amountOut, assetOutDecimals),
        };
      },
    } as TradeDcaOrder;
  }

  /**
   * Calculate minimum order budget (amountIn) required for order
   * execution.
   *
   * @param asset - assetIn id
   * @returns minimum order budget
   */
  async getMinimumOrderBudget(asset: number): Promise<bigint> {
    if (SYSTEM_ASSET_ID === asset) {
      return this.minOrderBudget;
    }

    const spot = await this.router.getSpotPrice(SYSTEM_ASSET_ID, asset);
    const scale = 10n ** BigInt(SYSTEM_ASSET_DECIMALS);
    if (spot) {
      return (this.minOrderBudget * spot.amount) / scale;
    }
    throw new Error('Unable to calculate order budget');
  }

  /**
   * Calculate minimum number of trades for order execution.
   *
   * Single trade execution amount must be at least 20% of
   * minimum order budget.
   *
   * @param amountIn - entering / given budget
   * @param amountInMin - minimal budget to schedule an order
   * @returns minimum number of trades to execute the order
   */
  private getMinimumTradeCount(amountIn: bigint, amountInMin: bigint): number {
    const minAmountIn = (amountInMin * 2n) / 10n;

    if (minAmountIn === 0n) return 0;

    const result = amountIn + minAmountIn / 2n;
    return Number(result / minAmountIn);
  }

  /**
   * Calculate optimal number of trades for order execution.
   *
   * We aim to achieve price impact 0.1% per single execution
   * with at least 3 trades.
   *
   * @param priceImpact - price impact of swap execution (single trade)
   * @returns optimal number of trades to execute the order
   */
  private getOptimalTradeCount(priceImpact: number): number {
    const estTradeCount = Math.round(priceImpact * 10) || 1;
    return Math.max(estTradeCount, 3);
  }

  /**
   * Build a TWAP (Time-Weighted Average Price) sell order
   *
   * @param assetIn - assetIn id
   * @param assetOut - assetOut id
   * @param amountInTotal - order budget
   * @returns twap trade order
   */
  async getTwapSellOrder(
    assetIn: number,
    assetOut: number,
    amountInTotal: string
  ): Promise<TradeOrder> {
    const [amountInMin, sell] = await Promise.all([
      this.getMinimumOrderBudget(assetIn),
      this.router.getBestSell(assetIn, assetOut, amountInTotal),
    ]);

    const { amountIn, swaps, priceImpactPct } = sell;

    const firstSwap = swaps[0];
    const lastSwap = swaps[swaps.length - 1];

    const { assetInDecimals } = firstSwap;
    const { assetOutDecimals } = lastSwap;

    const priceImpact = Math.abs(priceImpactPct);
    const tradeCount = this.getTwapTradeCount(priceImpact);

    const amountInPerTrade = amountIn / BigInt(tradeCount);

    const twap = await this.router.getBestSell(
      firstSwap.assetIn,
      lastSwap.assetOut,
      amountInPerTrade
    );

    const isSingleTrade = tradeCount === 1;
    const isLessThanMinimalAmount = amountIn < amountInMin;
    const isOrderImpactTooBig = twap.priceImpactPct < TWAP_MAX_PRICE_IMPACT;

    const errors: TradeOrderError[] = [];
    if (isLessThanMinimalAmount || isSingleTrade) {
      errors.push(TradeOrderError.OrderTooSmall);
    } else if (isOrderImpactTooBig) {
      errors.push(TradeOrderError.OrderImpactTooBig);
    }

    const amountOut = twap.amountOut * BigInt(tradeCount);
    const tradeFee = twap.tradeFee * BigInt(tradeCount);
    const tradeRoute = TradeRouteBuilder.build(swaps);

    const order = {
      assetIn: assetIn,
      assetOut: assetOut,
      errors: errors,
      tradeCount: tradeCount,
      tradeImpactPct: twap.priceImpactPct,
      tradePeriod: TWAP_BLOCK_PERIOD,
      tradeRoute: tradeRoute,
      type: TradeOrderType.TwapSell,
    } as Partial<TradeOrder>;

    return {
      ...order,
      amountIn: amountIn,
      amountOut: amountOut,
      tradeAmountIn: twap.amountIn,
      tradeAmountOut: twap.amountOut,
      tradeFee: tradeFee,
      toHuman() {
        return {
          ...order,
          amountIn: big.toDecimal(amountIn, assetInDecimals),
          amountOut: big.toDecimal(amountOut, assetOutDecimals),
          tradeAmountIn: big.toDecimal(twap.amountIn, assetInDecimals),
          tradeAmountOut: big.toDecimal(twap.amountOut, assetOutDecimals),
          tradeFee: big.toDecimal(tradeFee, assetOutDecimals),
        };
      },
    } as TradeOrder;
  }

  /**
   * Build a TWAP (Time-Weighted Average Price) buy order
   *
   * @param assetIn - assetIn id
   * @param assetOut - assetOut id
   * @param amountInTotal - order budget
   * @returns twap trade order
   */
  async getTwapBuyOrder(
    assetIn: number,
    assetOut: number,
    amountInTotal: string
  ): Promise<TradeOrder> {
    const [amountInMin, buy] = await Promise.all([
      this.getMinimumOrderBudget(assetIn),
      this.router.getBestBuy(assetIn, assetOut, amountInTotal),
    ]);

    const { amountOut, swaps, priceImpactPct } = buy;

    const firstSwap = swaps[0];
    const lastSwap = swaps[swaps.length - 1];

    const { assetInDecimals } = firstSwap;
    const { assetOutDecimals } = lastSwap;

    const priceImpact = Math.abs(priceImpactPct);
    const tradeCount = this.getTwapTradeCount(priceImpact);

    const amountOutPerTrade = amountOut / BigInt(tradeCount);

    const twap = await this.router.getBestBuy(
      firstSwap.assetIn,
      lastSwap.assetOut,
      amountOutPerTrade
    );

    const amountIn = twap.amountIn * BigInt(tradeCount);

    const isSingleTrade = tradeCount === 1;
    const isLessThanMinimalAmount = amountIn < amountInMin;
    const isOrderImpactTooBig = twap.priceImpactPct < TWAP_MAX_PRICE_IMPACT;

    const errors: TradeOrderError[] = [];
    if (isLessThanMinimalAmount || isSingleTrade) {
      errors.push(TradeOrderError.OrderTooSmall);
    } else if (isOrderImpactTooBig) {
      errors.push(TradeOrderError.OrderImpactTooBig);
    }

    const tradeFee = twap.tradeFee * BigInt(tradeCount);
    const tradeRoute = TradeRouteBuilder.build(swaps);

    const order = {
      assetIn: assetIn,
      assetOut: assetOut,
      errors: errors,
      tradeCount: tradeCount,
      tradeImpactPct: twap.priceImpactPct,
      tradePeriod: TWAP_BLOCK_PERIOD,
      tradeRoute: tradeRoute,
      type: TradeOrderType.TwapBuy,
    } as Partial<TradeOrder>;

    return {
      ...order,
      amountIn: amountIn,
      amountOut: amountOut,
      tradeAmountIn: twap.amountIn,
      tradeAmountOut: twap.amountOut,
      tradeFee: tradeFee,
      toHuman() {
        return {
          ...order,
          amountIn: big.toDecimal(amountIn, assetInDecimals),
          amountOut: big.toDecimal(amountOut, assetOutDecimals),
          tradeAmountIn: big.toDecimal(twap.amountIn, assetInDecimals),
          tradeAmountOut: big.toDecimal(twap.amountOut, assetOutDecimals),
          tradeFee: big.toDecimal(tradeFee, assetInDecimals),
        };
      },
    } as TradeOrder;
  }

  /**
   * Calculate number of trades for twap order execution.
   *
   * We aim to achieve price impact 0.1% per single execution
   * with max execution time 6 hours.
   *
   * @param priceImpact - price impact of swap execution (via single trade)
   * @returns optimal number of trades to execute the order
   */
  getTwapTradeCount(priceImpact: number): number {
    const optTradeCount = this.getOptimalTradeCount(priceImpact);
    const executionTime = this.getTwapExecutionTime(optTradeCount);

    if (executionTime > TWAP_MAX_DURATION) {
      const maxTradeCount =
        TWAP_MAX_DURATION / (this.blockTime * TWAP_BLOCK_PERIOD);
      return Math.round(maxTradeCount);
    }
    return optTradeCount;
  }

  /**
   * Calculate approx. execution time for twap order.
   *
   * @param tradeCount - number of trades per order
   * @returns unix representation of execution time
   */
  getTwapExecutionTime(tradeCount: number): number {
    return tradeCount * TWAP_BLOCK_PERIOD * this.blockTime;
  }

  /**
   * Convert unix execution period to block period
   *
   * @param periodMsec - period in miliseconds
   * @returns block execution period
   */
  private toBlockPeriod(periodMsec: number): number {
    const noOfBlocks = periodMsec / this.blockTime;
    const estPeriod = Math.round(noOfBlocks);
    return Math.max(estPeriod, ORDER_MIN_BLOCK_PERIOD);
  }
}
