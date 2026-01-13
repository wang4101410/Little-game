import React, { useState, useEffect } from 'react';
import { Plus, Wallet, TrendingUp, Sparkles, LayoutDashboard, Eye, History, X, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import StockCard from './components/StockCard';
import WatchList from './components/WatchList';
import HistoryList from './components/HistoryList';
import SettingsModal from './components/SettingsModal';
import { PortfolioItem, StockAnalysis, WatchListItem, Transaction, AppSettings } from './types';
import { analyzeStockWithGemini, getOverallPortfolioAdvice } from './services/geminiService';

const App: React.FC = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'portfolio' | 'watchlist' | 'history'>('portfolio');
  
  // Settings & Cash
  const [settings, setSettings] = useState<AppSettings>(() => {
      const saved = localStorage.getItem('settings');
      return saved ? JSON.parse(saved) : { feeRate: 0.1425, cash: 100000 };
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Data
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(() => {
      const saved = localStorage.getItem('portfolio');
      return saved ? JSON.parse(saved) : [];
  });
  const [watchlist, setWatchlist] = useState<WatchListItem[]>(() => {
      const saved = localStorage.getItem('watchlist');
      return saved ? JSON.parse(saved) : [];
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
      const saved = localStorage.getItem('transactions');
      return saved ? JSON.parse(saved) : [];
  });

  // Analysis & Loading
  const [analyses, setAnalyses] = useState<Record<string, StockAnalysis>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [overallAdvice, setOverallAdvice] = useState<string>("");
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [isAdviceExpanded, setIsAdviceExpanded] = useState(false);

  // Forms
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newShares, setNewShares] = useState('');
  const [newPrice, setNewPrice] = useState(''); 
  const [newFee, setNewFee] = useState(''); 

  // Sell Modal
  const [sellItem, setSellItem] = useState<PortfolioItem | null>(null);
  const [sellShares, setSellShares] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellFee, setSellFee] = useState('');

  // --- EFFECTS ---
  useEffect(() => { localStorage.setItem('portfolio', JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem('watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('settings', JSON.stringify(settings)); }, [settings]);

  // Auto calculate fee when price/shares change in Add Form
  useEffect(() => {
      if (newShares && newPrice && settings.feeRate) {
          const amount = parseFloat(newShares) * parseFloat(newPrice);
          const estimatedFee = Math.round(amount * (settings.feeRate / 100));
          setNewFee(estimatedFee.toString());
      }
  }, [newShares, newPrice, settings.feeRate]);

  // Auto calculate fee when price/shares change in Sell Form
  useEffect(() => {
    if (sellItem && sellPrice && sellShares && settings.feeRate) {
        const amount = parseFloat(sellShares) * parseFloat(sellPrice);
        // Selling usually involves tax (0.3%) + fee. 
        // For simplicity, we stick to feeRate, but user can edit.
        // Let's assume standard fee for now.
        const estimatedFee = Math.round(amount * (settings.feeRate / 100));
        setSellFee(estimatedFee.toString());
    }
  }, [sellPrice, sellShares, sellItem, settings.feeRate]);

  // --- ACTIONS ---

  const handleAnalyze = async (symbol: string) => {
    if (loadingStates[symbol]) return;
    setLoadingStates(prev => ({ ...prev, [symbol]: true }));
    try {
      const analysis = await analyzeStockWithGemini(symbol);
      setAnalyses(prev => ({ ...prev, [symbol]: analysis }));
      
      setPortfolio(prev => prev.map(p => 
        p.symbol === symbol ? { ...p, name: analysis.companyName } : p
      ));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingStates(prev => ({ ...prev, [symbol]: false }));
    }
  };

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol || !newShares || !newPrice) return;

    const shares = parseFloat(newShares);
    const price = parseFloat(newPrice);
    const fee = newFee ? parseFloat(newFee) : 0;
    
    // Cost Basis: (Price * Shares + Fee) / Shares
    const totalCost = (price * shares) + fee;
    const avgCost = totalCost / shares;

    const newItem: PortfolioItem = {
      id: Date.now().toString(),
      symbol: newSymbol.toUpperCase(),
      name: analyses[newSymbol.toUpperCase()]?.companyName || newSymbol.toUpperCase(),
      shares: shares,
      avgCost: avgCost,
    };

    setPortfolio(prev => [...prev, newItem]);
    
    // Deduct from cash
    setSettings(prev => ({...prev, cash: prev.cash - totalCost}));

    // Reset Form
    setNewSymbol('');
    setNewShares('');
    setNewPrice('');
    setNewFee('');
    setIsAddFormOpen(false);
    
    handleAnalyze(newItem.symbol);
  };

  const openSellModal = (item: PortfolioItem) => {
      setSellItem(item);
      setSellShares(item.shares.toString());
      setSellPrice(analyses[item.symbol]?.currentPrice.toString() || '');
      setSellFee('');
  };

  const handleSellStock = (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellItem || !sellPrice || !sellShares) return;

      const price = parseFloat(sellPrice);
      const fee = sellFee ? parseFloat(sellFee) : 0;
      const sharesToSell = parseFloat(sellShares);

      if (sharesToSell <= 0 || sharesToSell > sellItem.shares) {
          alert("賣出股數無效");
          return;
      }

      const revenue = (price * sharesToSell) - fee;
      const cost = sellItem.avgCost * sharesToSell;
      const profit = revenue - cost;
      const returnRate = cost > 0 ? (profit / cost) * 100 : 0;

      const transaction: Transaction = {
          id: Date.now().toString(),
          symbol: sellItem.symbol,
          name: sellItem.name,
          type: 'SELL',
          shares: sharesToSell,
          price: price,
          fee: fee,
          date: new Date().toISOString(),
          realizedPl: profit,
          returnRate: returnRate
      };

      setTransactions(prev => [...prev, transaction]);
      setSettings(prev => ({...prev, cash: prev.cash + revenue}));
      
      if (sharesToSell === sellItem.shares) {
           // Sold all
           setPortfolio(prev => prev.filter(p => p.id !== sellItem.id));
      } else {
           // Partial sell
           setPortfolio(prev => prev.map(p => 
               p.id === sellItem.id ? { ...p, shares: p.shares - sharesToSell } : p
           ));
      }

      setSellItem(null);
      setSellPrice('');
      setSellShares('');
      setSellFee('');
  };

  const handleAddToWatchlist = (symbol: string) => {
      if (watchlist.some(w => w.symbol === symbol)) return;
      setWatchlist(prev => [...prev, { id: Date.now().toString(), symbol }]);
      // Switch to watchlist tab for feedback
      setActiveTab('watchlist');
      // If not analyzed, analyze
      if (!analyses[symbol]) {
          handleAnalyze(symbol);
      }
  };

  const handleRefreshAll = async () => {
      const allSymbols = new Set([
          ...portfolio.map(p => p.symbol),
          ...watchlist.map(w => w.symbol)
      ]);
      for(const symbol of allSymbols) {
          handleAnalyze(symbol);
      }
  };

  const handleGetPortfolioAdvice = async () => {
      setIsAdviceLoading(true);
      setIsAdviceExpanded(true); // Auto expand when generating new advice
      const itemsForAdvice = portfolio.map(item => {
          const analysis = analyses[item.symbol];
          return {
              symbol: item.symbol,
              shares: item.shares,
              currentPrice: analysis ? analysis.currentPrice : item.avgCost
          };
      });

      const advice = await getOverallPortfolioAdvice(itemsForAdvice, settings.cash);
      setOverallAdvice(advice);
      setIsAdviceLoading(false);
  };

  // Calculations
  const totalMarketValue = portfolio.reduce((acc, item) => {
      const price = analyses[item.symbol]?.currentPrice || 0;
      return acc + (price * item.shares);
  }, 0);
  
  const totalCostBasis = portfolio.reduce((acc, item) => acc + (item.avgCost * item.shares), 0);
  const unrealizedProfit = totalMarketValue - totalCostBasis;
  const isProfitable = unrealizedProfit >= 0;

  return (
    <div className="min-h-screen pb-12 bg-brand-900 text-slate-200">
      {/* Navbar */}
      <nav className="border-b border-brand-800 bg-brand-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-brand-500 p-1.5 rounded-lg">
                <TrendingUp className="text-white" size={24} />
              </div>
              <span className="text-xl font-bold tracking-tight text-white hidden md:block">Portfo<span className="text-brand-400">Prophet</span></span>
            </div>
            
            {/* Navigation Tabs */}
            <div className="flex bg-brand-800/50 rounded-lg p-1 gap-1">
                <button 
                    onClick={() => setActiveTab('portfolio')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'portfolio' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <LayoutDashboard size={16} /> 持倉
                </button>
                <button 
                    onClick={() => setActiveTab('watchlist')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'watchlist' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <Eye size={16} /> 關注
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <History size={16} /> 歷史
                </button>
            </div>

            <div className="flex items-center gap-3">
                <button 
                  onClick={handleGetPortfolioAdvice}
                  className="hidden md:flex items-center gap-2 text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors border border-brand-400/30 px-3 py-1.5 rounded-full hover:bg-brand-400/10"
                >
                  <Sparkles size={16} />
                  {isAdviceLoading ? "分析中..." : "AI 戰略"}
                </button>
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-brand-800 rounded-full transition-colors"
                >
                    <Settings size={20} />
                </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Top Stats Section */}
        <section className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="bg-brand-800 rounded-xl p-4 border border-brand-700 shadow-lg">
                <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider">總資產淨值</h3>
                <div className="mt-1 text-2xl font-bold text-white">
                    NT${(totalMarketValue + settings.cash).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                </div>
            </div>

            <div className="bg-brand-800 rounded-xl p-4 border border-brand-700 shadow-lg group relative cursor-pointer hover:border-brand-500 transition-colors" onClick={() => setIsSettingsOpen(true)}>
                 <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                    可用現金 <Wallet size={12} />
                 </h3>
                 <div className="flex items-center gap-2 mt-1">
                    <span className="text-xl font-bold text-green-300">
                         NT${settings.cash.toLocaleString()}
                    </span>
                 </div>
            </div>

            <div className="bg-brand-800 rounded-xl p-4 border border-brand-700 shadow-lg">
                <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider">持倉市值</h3>
                <div className="mt-1 text-2xl font-bold text-blue-200">
                    NT${totalMarketValue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>
            </div>

            <div className="bg-brand-800 rounded-xl p-4 border border-brand-700 shadow-lg">
                 <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider">未實現損益</h3>
                 <div className={`mt-1 text-2xl font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                    {isProfitable ? '+' : ''}NT${unrealizedProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                 </div>
                 <div className="text-[10px] text-slate-500">
                    {totalCostBasis > 0 ? ((unrealizedProfit / totalCostBasis) * 100).toFixed(2) : '0.00'}% 回報
                 </div>
            </div>
        </section>

        {/* Global Advice */}
        {overallAdvice && (
             <section className="mb-8 animate-fade-in">
                 <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/10">
                     <div 
                        className="bg-indigo-900/40 p-4 flex justify-between items-center cursor-pointer hover:bg-indigo-900/50 transition-colors"
                        onClick={() => setIsAdviceExpanded(!isAdviceExpanded)}
                     >
                         <h3 className="flex items-center gap-2 text-indigo-300 font-bold">
                            <Sparkles size={18} /> PortfoProphet AI 策略建議
                         </h3>
                         <div className="text-indigo-400">
                             {isAdviceExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                         </div>
                     </div>
                     
                     {isAdviceExpanded && (
                        <div className="p-6 relative">
                             <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                 <Sparkles size={100} />
                             </div>
                             <p className="text-indigo-100 leading-relaxed text-sm whitespace-pre-wrap relative z-10 animate-slide-down">
                                 {overallAdvice}
                             </p>
                        </div>
                     )}
                 </div>
             </section>
        )}

        {/* --- PORTFOLIO TAB --- */}
        {activeTab === 'portfolio' && (
            <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <LayoutDashboard size={20} className="text-brand-400" />
                        我的持倉
                    </h2>
                    <div className="flex gap-2">
                         <button 
                            onClick={() => setIsAddFormOpen(!isAddFormOpen)}
                            className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-1 shadow-lg shadow-brand-500/20"
                        >
                            <Plus size={16} /> 新增持倉
                        </button>
                        <button 
                            onClick={handleRefreshAll}
                            className="text-sm bg-brand-800 hover:bg-brand-700 text-slate-300 px-4 py-2 rounded-lg border border-brand-700 transition-colors"
                        >
                            刷新數據
                        </button>
                    </div>
                </div>

                {/* Add Stock Form */}
                {isAddFormOpen && (
                <section className="mb-8 bg-brand-800 p-6 rounded-xl border border-brand-600 animate-slide-down">
                    <h3 className="text-lg font-bold mb-4">新增投資項目</h3>
                    <form onSubmit={handleAddStock} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="w-full">
                            <label className="block text-xs text-slate-400 mb-1">股票代碼</label>
                            <input 
                                type="text" 
                                value={newSymbol}
                                onChange={e => setNewSymbol(e.target.value)}
                                className="w-full bg-brand-900 border border-brand-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 uppercase"
                                placeholder="2330"
                                required
                            />
                        </div>
                        <div className="w-full">
                            <label className="block text-xs text-slate-400 mb-1">股數</label>
                            <input 
                                type="number" 
                                step="any"
                                value={newShares}
                                onChange={e => setNewShares(e.target.value)}
                                className="w-full bg-brand-900 border border-brand-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500"
                                placeholder="1000"
                                required
                            />
                        </div>
                        <div className="w-full">
                            <label className="block text-xs text-slate-400 mb-1">成交單價 (TWD)</label>
                            <input 
                                type="number" 
                                step="any"
                                value={newPrice}
                                onChange={e => setNewPrice(e.target.value)}
                                className="w-full bg-brand-900 border border-brand-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500"
                                placeholder="1000.00"
                                required
                            />
                        </div>
                        <div className="w-full">
                            <label className="block text-xs text-slate-400 mb-1">手續費 ({settings.feeRate}%)</label>
                            <input 
                                type="number" 
                                step="any"
                                value={newFee}
                                onChange={e => setNewFee(e.target.value)}
                                className="w-full bg-brand-900 border border-brand-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500"
                                placeholder="自動計算..."
                            />
                        </div>
                        <button type="submit" className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            確認新增
                        </button>
                    </form>
                    <p className="text-[10px] text-slate-500 mt-2">* 系統已根據設定費率 ({settings.feeRate}%) 自動預估手續費，您可手動修正。</p>
                </section>
                )}

                {/* Stock Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {portfolio.map(item => (
                        <StockCard 
                            key={item.id} 
                            item={item} 
                            analysis={analyses[item.symbol]}
                            isLoading={loadingStates[item.symbol] || false}
                            onRemove={(id) => setPortfolio(prev => prev.filter(p => p.id !== id))}
                            onRefresh={handleAnalyze}
                            onSell={(item) => openSellModal(item)}
                            onWatch={handleAddToWatchlist}
                        />
                    ))}
                    {portfolio.length === 0 && (
                        <div className="col-span-full text-center py-20 bg-brand-800/30 rounded-xl border-2 border-dashed border-brand-800">
                            <p className="text-slate-500">您的投資組合是空的。新增股票以開始使用。</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- WATCHLIST TAB --- */}
        {activeTab === 'watchlist' && (
            <div className="animate-fade-in">
                <WatchList 
                    items={watchlist}
                    portfolio={portfolio}
                    analyses={analyses}
                    loadingStates={loadingStates}
                    onAdd={handleAddToWatchlist}
                    onRemove={(id) => setWatchlist(prev => prev.filter(w => w.id !== id))}
                    onRefresh={handleAnalyze}
                />
            </div>
        )}

        {/* --- HISTORY TAB --- */}
        {activeTab === 'history' && (
            <div className="animate-fade-in">
                <HistoryList transactions={transactions} />
            </div>
        )}

      </main>

      {/* Settings Modal */}
      <SettingsModal 
         isOpen={isSettingsOpen}
         onClose={() => setIsSettingsOpen(false)}
         settings={settings}
         onSave={setSettings}
      />

      {/* Sell Modal */}
      {sellItem && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
              <div className="bg-brand-800 border border-brand-600 p-6 rounded-xl w-full max-w-md shadow-2xl animate-scale-up">
                  <div className="flex justify-between items-center mb-4 border-b border-brand-700 pb-2">
                      <h3 className="text-xl font-bold text-white">賣出 {sellItem.symbol}</h3>
                      <button onClick={() => setSellItem(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                  </div>
                  <form onSubmit={handleSellStock}>
                      <div className="mb-4">
                          <p className="text-sm text-slate-400 mb-2">持有股數: <span className="text-white font-mono">{sellItem.shares}</span></p>
                          <p className="text-sm text-slate-400 mb-2">平均成本: <span className="text-white font-mono">NT${sellItem.avgCost.toFixed(2)}</span></p>
                      </div>
                      <div className="mb-4">
                          <label className="block text-sm text-slate-300 mb-1">賣出股數</label>
                          <input 
                              type="number" 
                              step="any"
                              value={sellShares}
                              onChange={e => setSellShares(e.target.value)}
                              className="w-full bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                              max={sellItem.shares}
                              required
                          />
                      </div>
                      <div className="mb-4">
                          <label className="block text-sm text-slate-300 mb-1">賣出單價 (TWD)</label>
                          <input 
                              type="number" 
                              step="any"
                              value={sellPrice}
                              onChange={e => setSellPrice(e.target.value)}
                              className="w-full bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none"
                              placeholder="目前市價..."
                              required
                              autoFocus
                          />
                      </div>
                      <div className="mb-6">
                          <label className="block text-sm text-slate-300 mb-1">交易手續費 ({settings.feeRate}%)</label>
                          <input 
                              type="number" 
                              step="any"
                              value={sellFee}
                              onChange={e => setSellFee(e.target.value)}
                              className="w-full bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                              placeholder="自動計算..."
                          />
                      </div>
                      <div className="flex gap-3">
                          <button type="button" onClick={() => setSellItem(null)} className="flex-1 py-2 bg-brand-700 hover:bg-brand-600 rounded-lg text-slate-200">取消</button>
                          <button type="submit" className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-bold">
                             {parseFloat(sellShares) === sellItem.shares ? "全部賣出" : "部分賣出"}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;