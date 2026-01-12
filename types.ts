export interface PortfolioItem {
  id: string;
  symbol: string;
  name: string; // Company Name
  shares: number;
  avgCost: number; // calculated as (price * shares + buyFee) / shares
}

export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  fee: number;
  date: string;
  realizedPl: number; // Only for SELL
  returnRate: number; // Only for SELL
}

export interface WatchListItem {
  id: string;
  symbol: string;
}

export interface HistoricalPoint {
  date: string;
  price: number;
}

export interface SimulationPath {
  name: string; // e.g., "Sim 1"
  data: { step: number; price: number }[];
}

export interface AiPrediction {
  trendAnalysis: string; // LSTM-based trend description
  volatilityAnalysis: string; // GARCH-based volatility description
  keyLevels: string; // Price distribution probabilities
  scenarios: {
    optimistic: string;
    neutral: string;
    pessimistic: string;
  };
  conclusion: string; // Confidence and core rationale
}

export interface StockAnalysis {
  symbol: string;
  companyName: string;
  marketCap: string; // e.g. "2.5T"
  eps: number | string; // Earnings Per Share
  pe: number | string; // Price to Earnings Ratio
  currentPrice: number;
  prevClose: number;
  changePercent: number;
  volatility: number; 
  history: HistoricalPoint[]; 
  advice: string; 
  aiPrediction?: AiPrediction; // New advanced prediction data
  groundingUrls: string[]; 
  lastUpdated: number;
}

export interface MonteCarloConfig {
  days: number;
  simulations: number;
}

export interface AppSettings {
  feeRate: number; // Percentage, e.g. 0.1425
  cash: number;
}