import React, { useState, useMemo } from 'react';
import { PortfolioItem, StockAnalysis } from '../types';
import { runMonteCarloSimulation, calculateProfit } from '../utils/math';
import MonteCarloChart from './MonteCarloChart';
import { Trash2, ExternalLink, RefreshCw, BrainCircuit, Wand2, DollarSign, Eye, Activity, Target, AlertTriangle } from 'lucide-react';

interface StockCardProps {
  item: PortfolioItem;
  analysis: StockAnalysis | undefined;
  isLoading: boolean;
  onRemove: (id: string) => void;
  onRefresh: (symbol: string) => void;
  onSell: (item: PortfolioItem) => void;
  onWatch: (symbol: string) => void;
}

const StockCard: React.FC<StockCardProps> = ({ item, analysis, isLoading, onRemove, onRefresh, onSell, onWatch }) => {
  const [showSim, setShowSim] = useState(false);

  // Generate Simulations on the fly if analysis exists
  const simulations = useMemo(() => {
    if (!analysis) return [];
    // 6 months forecast (approx 126 trading days), 50 simulations for better density
    return runMonteCarloSimulation(analysis.currentPrice, analysis.volatility, 126, 50);
  }, [analysis]);

  const profitInfo = analysis 
    ? calculateProfit(analysis.currentPrice, item.avgCost, item.shares)
    : { marketValue: 0, profit: 0, profitPercent: 0 };

  return (
    <div className="bg-brand-800 border border-brand-700 rounded-xl p-5 shadow-lg transition-all hover:border-brand-500 flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            {item.symbol}
            <span className="text-xs font-normal text-slate-400 bg-brand-900 px-2 py-1 rounded-full border border-brand-700">
                {analysis?.companyName || item.name || 'Loading...'}
            </span>
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            {item.shares} 股 @ NT${item.avgCost.toFixed(2)} (均價)
          </p>
        </div>
        <div className="flex gap-2">
           {/* Watch Button */}
           <button 
            onClick={() => onWatch(item.symbol)}
            className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-brand-700 rounded-lg transition-colors border border-transparent hover:border-yellow-900"
            title="加入關注清單"
          >
            <Eye size={18} />
          </button>
           {/* Sell Button */}
           <button 
            onClick={() => onSell(item)}
            className="p-2 text-slate-400 hover:text-green-400 hover:bg-brand-700 rounded-lg transition-colors border border-transparent hover:border-green-900"
            title="出倉/賣出"
          >
            <DollarSign size={18} />
          </button>
          <button 
            onClick={() => onRefresh(item.symbol)}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
            title="重新分析"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button 
            onClick={() => onRemove(item.id)}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-brand-700 rounded-lg transition-colors"
            title="刪除紀錄 (不計入損益)"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Main Data Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-brand-900/50 p-3 rounded-lg">
          <div className="flex justify-between items-end mb-1">
             <p className="text-slate-500 text-xs uppercase tracking-wider">EPS / PE</p>
             <span className="text-[10px] text-brand-400">{analysis?.eps || '-'} / {analysis?.pe || '-'}</span>
          </div>
           <p className="text-slate-500 text-xs uppercase tracking-wider mt-2 mb-1">現價</p>
           <p className="text-xl font-mono text-white">
             {analysis ? `NT$${analysis.currentPrice.toFixed(2)}` : '---'}
           </p>
        </div>
        <div className="bg-brand-900/50 p-3 rounded-lg flex flex-col justify-center">
          <p className="text-slate-500 text-xs uppercase tracking-wider">未實現損益</p>
          <div className={`flex flex-col ${profitInfo.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
             <span className="text-xl font-mono font-bold">
               {analysis ? (profitInfo.profit >= 0 ? '+' : '') : ''}
               {analysis ? profitInfo.profit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '---'}
             </span>
             {analysis && <span className="text-xs">({profitInfo.profitPercent.toFixed(2)}%)</span>}
          </div>
        </div>
      </div>

      {/* AI Analysis Section */}
      {analysis ? (
        <div className="space-y-4 animate-fade-in flex-grow">
            {/* Advice Bubble */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 relative">
                <div className="absolute -top-2.5 left-3 bg-brand-800 px-1 text-blue-400 text-xs font-bold flex items-center gap-1">
                    <BrainCircuit size={12} /> AI 總結
                </div>
                <p className="text-sm text-blue-100 leading-relaxed mt-1">
                    {analysis.advice}
                </p>
            </div>

             {/* Grounding Sources (Compact) */}
             {analysis.groundingUrls.length > 0 && (
                <div className="flex gap-2 overflow-hidden">
                     {analysis.groundingUrls.slice(0, 2).map((url, idx) => (
                         <a key={idx} href={url} target="_blank" rel="noreferrer" className="text-[10px] text-brand-500 hover:text-brand-300 flex items-center gap-1">
                             <ExternalLink size={8} /> 來源 {idx + 1}
                         </a>
                     ))}
                </div>
            )}

            {/* Prediction Toggle */}
            <button 
                onClick={() => setShowSim(!showSim)}
                className="w-full mt-2 py-2 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-900/50 to-brand-900/50 hover:from-purple-900 hover:to-brand-900 text-purple-200 text-sm rounded-lg transition-all border border-purple-500/30 hover:border-purple-500/60 shadow-lg"
            >
                <Wand2 size={14} />
                {showSim ? "隱藏混合模型分析" : "AI 混合模型預測 (LSTM + GARCH)"}
            </button>

            {/* Prediction Content */}
            {showSim && analysis.aiPrediction && (
                <div className="mt-4 animate-slide-down bg-brand-900 p-4 rounded-lg border border-brand-700">
                   
                   {/* Monte Carlo Visual */}
                   <div className="mb-4 pb-4 border-b border-brand-800">
                        <p className="text-xs text-slate-500 mb-2 font-bold">蒙地卡羅基礎模擬 (6 個月)</p>
                        <MonteCarloChart simulations={simulations} currentPrice={analysis.currentPrice} />
                   </div>

                   {/* AI Advanced Text */}
                   <div className="space-y-4 text-sm">
                       {/* Trend & Volatility */}
                       <div className="grid grid-cols-2 gap-3">
                           <div className="bg-brand-800 p-2 rounded border border-brand-700">
                               <h5 className="text-xs text-brand-400 flex items-center gap-1 mb-1"><Activity size={10}/> 趨勢修正 (LSTM)</h5>
                               <p className="text-xs text-slate-300 leading-snug">{analysis.aiPrediction.trendAnalysis}</p>
                           </div>
                           <div className="bg-brand-800 p-2 rounded border border-brand-700">
                               <h5 className="text-xs text-brand-400 flex items-center gap-1 mb-1"><AlertTriangle size={10}/> 波動率錨定 (GARCH)</h5>
                               <p className="text-xs text-slate-300 leading-snug">{analysis.aiPrediction.volatilityAnalysis}</p>
                           </div>
                       </div>

                       {/* Scenario Table */}
                       <div className="overflow-hidden rounded border border-brand-700">
                           <table className="w-full text-xs">
                               <thead>
                                   <tr className="bg-brand-800 text-slate-400">
                                       <th className="p-2 text-left">情境</th>
                                       <th className="p-2 text-left">邏輯與區間</th>
                                   </tr>
                               </thead>
                               <tbody className="divide-y divide-brand-700">
                                   <tr>
                                       <td className="p-2 text-green-400 font-bold bg-brand-900">樂觀</td>
                                       <td className="p-2 text-slate-300 bg-brand-900">{analysis.aiPrediction.scenarios.optimistic}</td>
                                   </tr>
                                   <tr>
                                       <td className="p-2 text-slate-400 font-bold bg-brand-900">中性</td>
                                       <td className="p-2 text-slate-300 bg-brand-900">{analysis.aiPrediction.scenarios.neutral}</td>
                                   </tr>
                                   <tr>
                                       <td className="p-2 text-red-400 font-bold bg-brand-900">悲觀</td>
                                       <td className="p-2 text-slate-300 bg-brand-900">{analysis.aiPrediction.scenarios.pessimistic}</td>
                                   </tr>
                               </tbody>
                           </table>
                       </div>
                       
                       {/* Conclusion */}
                       <div className="bg-purple-900/20 p-3 rounded border border-purple-500/30">
                           <h5 className="text-xs font-bold text-purple-300 mb-1 flex items-center gap-1"><Target size={12}/> 綜合結論 & 置信度</h5>
                           <p className="text-slate-200 leading-relaxed">{analysis.aiPrediction.conclusion}</p>
                           <p className="text-[10px] text-slate-500 mt-2 border-t border-purple-500/10 pt-1">
                               關鍵區間: {analysis.aiPrediction.keyLevels}
                           </p>
                       </div>
                   </div>
                </div>
            )}
        </div>
      ) : (
        <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-slate-600 border border-dashed border-brand-700 rounded-lg">
           {isLoading ? (
               <>
                 <RefreshCw className="animate-spin mb-2" />
                 <span className="text-sm">AI 正在進行混合模型分析...</span>
               </>
           ) : (
               <span className="text-sm">等待數據...</span>
           )}
        </div>
      )}
    </div>
  );
};

export default StockCard;