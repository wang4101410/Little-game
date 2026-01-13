import React, { useState, useMemo } from 'react';
import { StockAnalysis, WatchListItem, PortfolioItem } from '../types';
import { calculateProfit, runMonteCarloSimulation } from '../utils/math';
import MonteCarloChart from './MonteCarloChart';
import { Trash2, RefreshCw, Plus, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';

interface WatchListProps {
  items: WatchListItem[];
  portfolio: PortfolioItem[];
  analyses: Record<string, StockAnalysis>;
  loadingStates: Record<string, boolean>;
  onAdd: (symbol: string) => void;
  onRemove: (id: string) => void;
  onRefresh: (symbol: string) => void;
  onBuy: (symbol: string) => void; // New prop for buying
}

const WatchListRow: React.FC<{
  item: WatchListItem;
  portfolio: PortfolioItem[];
  analysis: StockAnalysis | undefined;
  isLoading: boolean;
  onRemove: (id: string) => void;
  onRefresh: (symbol: string) => void;
  onBuy: (symbol: string) => void;
}> = ({ item, portfolio, analysis, isLoading, onRemove, onRefresh, onBuy }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Calculate profit if user owns this stock in portfolio
    const ownedItem = portfolio.find(p => p.symbol === item.symbol);
    const profitData = ownedItem && analysis 
        ? calculateProfit(analysis.currentPrice, ownedItem.avgCost, ownedItem.shares) 
        : null;

    const simulations = useMemo(() => {
        if (!isExpanded || !analysis) return [];
        return runMonteCarloSimulation(analysis.currentPrice, analysis.volatility, 126, 50);
    }, [analysis, isExpanded]);

    const isUp = analysis && analysis.changePercent >= 0;

    return (
        <React.Fragment>
            <tr 
                className={`hover:bg-brand-700/30 transition-colors cursor-pointer ${isExpanded ? 'bg-brand-700/20' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <td className="px-4 py-4">
                    <div className="font-bold text-white flex items-center gap-2">
                        {item.symbol}
                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                        {ownedItem && <span className="text-[10px] bg-brand-700 text-brand-300 px-1.5 py-0.5 rounded border border-brand-600">已持倉</span>}
                    </div>
                    <div className="text-xs text-slate-500">{analysis?.companyName || '---'}</div>
                    {profitData && (
                        <div className="mt-1 text-xs flex items-center gap-1">
                            <span className="text-slate-500">損益:</span>
                            <span className={`font-mono ${profitData.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {profitData.profit >= 0 ? '+' : ''}{profitData.profit.toFixed(0)} ({profitData.profitPercent.toFixed(1)}%)
                            </span>
                        </div>
                    )}
                </td>
                <td className="px-4 py-4 font-mono text-white">
                    {analysis ? `NT$${analysis.currentPrice.toFixed(2)}` : '---'}
                </td>
                <td className={`px-4 py-4 font-mono font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                    {analysis ? `${isUp ? '+' : ''}${analysis.changePercent.toFixed(2)}%` : '---'}
                </td>
                <td className="px-4 py-4 text-slate-300 font-mono text-xs">
                    <div className="flex flex-col">
                        <span>EPS: <span className="text-white">{analysis?.eps || '-'}</span></span>
                        <span>P/E: <span className="text-white">{analysis?.pe || '-'}</span></span>
                    </div>
                </td>
                <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => onBuy(item.symbol)}
                            className="text-green-400 hover:text-white p-1 rounded hover:bg-green-600 transition-colors"
                            title="購入"
                        >
                            <ShoppingCart size={16} />
                        </button>
                        <button 
                            onClick={() => onRefresh(item.symbol)}
                            disabled={isLoading}
                            className="text-brand-400 hover:text-white p-1 rounded hover:bg-brand-600"
                            title="更新數據"
                        >
                            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                        </button>
                        <button 
                            onClick={() => onRemove(item.id)}
                            className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-brand-600"
                            title="刪除"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-brand-800/20 animate-slide-down">
                    <td colSpan={5} className="px-4 py-3">
                        <div className="bg-blue-900/10 border border-blue-500/10 rounded-lg p-4">
                            {analysis ? (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-bold text-blue-400 mb-1">AI 建議:</p>
                                        <p className="text-sm text-slate-200 leading-relaxed mb-3">
                                            {analysis.advice}
                                        </p>
                                        {analysis.aiPrediction && (
                                            <p className="text-xs text-slate-400 italic border-l-2 border-brand-600 pl-2">
                                                {analysis.aiPrediction.conclusion}
                                            </p>
                                        )}
                                        {/* Key Levels Display */}
                                        {analysis.aiPrediction?.keyLevels && (
                                            <div className="mt-2 text-xs font-mono text-yellow-500 bg-yellow-900/20 inline-block px-2 py-1 rounded border border-yellow-700/30">
                                                {analysis.aiPrediction.keyLevels}
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-brand-900/50 p-2 rounded-lg border border-brand-800">
                                         <MonteCarloChart simulations={simulations} currentPrice={analysis.currentPrice} />
                                    </div>

                                    {analysis.aiPrediction && (
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-brand-900 p-2 rounded text-[10px] border border-brand-800">
                                                <span className="text-green-400 block mb-1 font-bold">樂觀</span>
                                                <span className="text-slate-400 leading-tight block">{analysis.aiPrediction.scenarios.optimistic}</span>
                                            </div>
                                            <div className="bg-brand-900 p-2 rounded text-[10px] border border-brand-800">
                                                <span className="text-slate-400 block mb-1 font-bold">中性</span>
                                                <span className="text-slate-400 leading-tight block">{analysis.aiPrediction.scenarios.neutral}</span>
                                            </div>
                                            <div className="bg-brand-900 p-2 rounded text-[10px] border border-brand-800">
                                                <span className="text-red-400 block mb-1 font-bold">悲觀</span>
                                                <span className="text-slate-400 leading-tight block">{analysis.aiPrediction.scenarios.pessimistic}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-slate-500 text-sm">
                                    尚無分析數據，請點擊更新按鈕。
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

const WatchList: React.FC<WatchListProps> = ({ items, portfolio, analyses, loadingStates, onAdd, onRemove, onRefresh, onBuy }) => {
  const [inputSymbol, setInputSymbol] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputSymbol) {
      onAdd(inputSymbol);
      setInputSymbol('');
    }
  };

  return (
    <div className="bg-brand-800/50 rounded-xl border border-brand-700 overflow-hidden">
      <div className="p-4 border-b border-brand-700 flex justify-between items-center bg-brand-800">
        <h3 className="font-bold text-white flex items-center gap-2">關注清單</h3>
        <form onSubmit={handleAdd} className="flex gap-2">
            <input 
                type="text" 
                value={inputSymbol}
                onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
                placeholder="代號 (e.g. 2330)"
                className="bg-brand-900 border border-brand-600 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-brand-500 w-32"
            />
            <button type="submit" className="bg-brand-600 hover:bg-brand-500 text-white p-1.5 rounded-lg">
                <Plus size={16} />
            </button>
        </form>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="bg-brand-900 text-slate-200 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">代號 / 名稱</th>
              <th className="px-4 py-3">現價 (TWD)</th>
              <th className="px-4 py-3">漲跌幅</th>
              <th className="px-4 py-3">EPS / 本益比</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-700">
            {items.length === 0 ? (
                <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        尚無關注股票，請新增代號。
                    </td>
                </tr>
            ) : (
                items.map(item => (
                    <WatchListRow 
                        key={item.id}
                        item={item}
                        portfolio={portfolio}
                        analysis={analyses[item.symbol]}
                        isLoading={loadingStates[item.symbol] || false}
                        onRefresh={onRefresh}
                        onRemove={onRemove}
                        onBuy={onBuy}
                    />
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WatchList;