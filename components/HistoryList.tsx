import React from 'react';
import { Transaction } from '../types';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface HistoryListProps {
  transactions: Transaction[];
}

const HistoryList: React.FC<HistoryListProps> = ({ transactions }) => {
  // Sort by date desc
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const totalRealized = sorted.reduce((acc, curr) => acc + curr.realizedPl, 0);

  return (
    <div className="space-y-6">
        {/* Summary Card */}
        <div className="bg-brand-800 rounded-xl p-6 border border-brand-700 flex justify-between items-center">
            <div>
                <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">總已實現損益 (Realized P/L)</h3>
                <div className={`mt-2 text-3xl font-bold ${totalRealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalRealized >= 0 ? '+' : ''}NT${totalRealized.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>
            </div>
            <div className="text-right text-sm text-slate-500">
                共 {transactions.length} 筆交易
            </div>
        </div>

        {/* List */}
        <div className="bg-brand-900/50 rounded-xl border border-brand-800 overflow-hidden">
             <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-brand-800 text-slate-200 uppercase text-xs">
                    <tr>
                        <th className="px-4 py-3">日期</th>
                        <th className="px-4 py-3">代號</th>
                        <th className="px-4 py-3">類型</th>
                        <th className="px-4 py-3 text-right">成交價/股數</th>
                        <th className="px-4 py-3 text-right">手續費</th>
                        <th className="px-4 py-3 text-right">損益額</th>
                        <th className="px-4 py-3 text-right">報酬率</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-brand-800">
                    {sorted.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-600">
                                暫無交易歷史
                            </td>
                        </tr>
                    ) : (
                        sorted.map(tx => (
                            <tr key={tx.id} className="hover:bg-brand-800/50">
                                <td className="px-4 py-3 text-xs">{new Date(tx.date).toLocaleDateString()}</td>
                                <td className="px-4 py-3 font-bold text-white">{tx.symbol}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-xs ${tx.type === 'SELL' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                        {tx.type === 'SELL' ? '賣出' : '買入'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div>NT${tx.price.toFixed(2)}</div>
                                    <div className="text-xs text-slate-500">{tx.shares} 股</div>
                                </td>
                                <td className="px-4 py-3 text-right text-xs">
                                    -NT${tx.fee.toFixed(2)}
                                </td>
                                <td className={`px-4 py-3 text-right font-bold ${tx.realizedPl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {tx.realizedPl >= 0 ? '+' : ''}{tx.realizedPl.toFixed(2)}
                                </td>
                                <td className={`px-4 py-3 text-right ${tx.returnRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {tx.returnRate.toFixed(2)}%
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
             </table>
        </div>
    </div>
  );
};

export default HistoryList;