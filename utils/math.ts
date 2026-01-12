import { SimulationPath } from '../types';

// Box-Muller transform for generating normally distributed random numbers
function  randn_bm(): number {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

export const runMonteCarloSimulation = (
  startPrice: number,
  volatility: number, // Annualized volatility (e.g. 0.30 for 30%)
  days: number,
  numSimulations: number
): SimulationPath[] => {
  const dt = 1 / 252; // Time step (1 trading day)
  const drift = 0.08; // Assumed annual market drift (8%)
  
  const simulations: SimulationPath[] = [];

  for (let i = 0; i < numSimulations; i++) {
    const path: { step: number; price: number }[] = [];
    let currentPrice = startPrice;
    
    path.push({ step: 0, price: currentPrice });

    for (let day = 1; day <= days; day++) {
      // Geometric Brownian Motion: S_t = S_{t-1} * exp((mu - 0.5 * sigma^2)dt + sigma * sqrt(dt) * Z)
      const shock = volatility * Math.sqrt(dt) * randn_bm();
      const driftComponent = (drift - 0.5 * Math.pow(volatility, 2)) * dt;
      
      currentPrice = currentPrice * Math.exp(driftComponent + shock);
      path.push({ step: day, price: currentPrice });
    }
    simulations.push({ name: `Sim ${i + 1}`, data: path });
  }

  return simulations;
};

export const calculateProfit = (currentPrice: number, avgCost: number, shares: number) => {
  const marketValue = currentPrice * shares;
  const totalCost = avgCost * shares;
  const profit = marketValue - totalCost;
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  return { marketValue, profit, profitPercent };
};