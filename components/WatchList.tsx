import React, { useState } from 'react';
import { StockAnalysis, WatchListItem } from '../types';
import { Trash2, RefreshCw, Plus, ChevronDown, ChevronUp } from 'lucide-react';

interface WatchListProps {
  items: WatchListItem[];
  analyses: Record<string, StockAnalysis>;
  loadingStates: Record<string, boolean>;
  onAdd: (symbol: string) => void;
  onRemove: (id: string) => void;
  onRefresh: (symbol: string) => void;
}

const WatchList: React.FC<WatchListProps> = ({ items, analyses, loadingStates, onAdd, onRemove, onRefresh }) => {
  const [inputSymbol, setInputSymbol] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputSymbol) {
      onAdd(inputSymbol);
      setInputSymbol('');
    }
  };

  const toggleExpand = (id: string) => {
      setExpandedId(prev => prev === id ? null : id);
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
                items.map(item => {
                    const analysis = analyses[item.symbol];
                    const isLoading = loadingStates[item.symbol];
                    const isUp = analysis && analysis.changePercent >= 0;
                    const isExpanded = expandedId === item.id;

                    return (
                        <React.Fragment key={item.id}>
                            <tr 
                                className={`hover:bg-brand-700/30 transition-colors cursor-pointer ${isExpanded ? 'bg-brand-700/20' : ''}`}
                                onClick={() => toggleExpand(item.id)}
                            >
                                <td className="px-4 py-4">
                                    <div className="font-bold text-white flex items-center gap-2">
                                        {item.symbol}
                                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                    </div>
                                    <div className="text-xs text-slate-500">{analysis?.companyName || '---'}</div>
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
                            {/* Expandable Section for Full Advice */}
                            {isExpanded && (
                                <tr className="bg-brand-800/20">
                                    <td colSpan={5} className="px-4 py-3">
                                        <div className="bg-blue-900/20 border border-blue-500/10 rounded-lg p-4">
                                            {analysis?.aiPrediction ? (
                                                <div className="space-y-2">
                                                     <p className="text-xs font-bold text-blue-400">AI 混合模型結論:</p>
                                                     <p className="text-sm text-slate-200 leading-relaxed">{analysis.aiPrediction.conclusion}</p>
                                                     <div className="grid grid-cols-3 gap-2 mt-2">
                                                         <div className="bg-brand-900 p-2 rounded text-xs">
                                                             <span className="text-green-400 block mb-1">樂觀情境</span>
                                                             <span className="text-slate-400">{analysis.aiPrediction.scenarios.optimistic}</span>
                                                         </div>
                                                         <div className="bg-brand-900 p-2 rounded text-xs">
                                                              <span className="text-slate-400 block mb-1">中性情境</span>
                                                              <span className="text-slate-400">{analysis.aiPrediction.scenarios.neutral}</span>
                                                         </div>
                                                         <div className="bg-brand-900 p-2 rounded text-xs">
                                                              <span className="text-red-400 block mb-1">悲觀情境</span>
                                                              <span className="text-slate-400">{analysis.aiPrediction.scenarios.pessimistic}</span>
                                                         </div>
                                                     </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-xs font-bold text-blue-400 mb-1">AI 建議:</p>
                                                    <p className="text-sm text-slate-300 leading-relaxed">
                                                        {analysis ? analysis.advice : "尚無分析數據，請點擊更新按鈕。"}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    );
                })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WatchList;