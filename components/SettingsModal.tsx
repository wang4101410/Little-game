import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);

  useEffect(() => {
    setFormData(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[110] backdrop-blur-sm p-4">
      <div className="bg-brand-800 border border-brand-600 p-6 rounded-xl w-full max-w-md shadow-2xl animate-scale-up">
        <div className="flex justify-between items-center mb-6 border-b border-brand-700 pb-2">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
             設定
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20}/></button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              可用現金 (TWD)
            </label>
            <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500">NT$</span>
                <input 
                  type="number"
                  step="any" 
                  value={formData.cash}
                  onChange={(e) => setFormData({...formData, cash: parseFloat(e.target.value) || 0})}
                  className="w-full bg-brand-900 border border-brand-600 rounded-lg pl-10 pr-4 py-2 text-white focus:border-brand-500 focus:outline-none"
                />
            </div>
            <p className="text-xs text-slate-500 mt-1">此金額將用於 AI 建議的資產配置參考。</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              預設交易手續費率 (%)
            </label>
            <input 
              type="number" 
              step="0.0001"
              value={formData.feeRate}
              onChange={(e) => setFormData({...formData, feeRate: parseFloat(e.target.value) || 0})}
              className="w-full bg-brand-900 border border-brand-600 rounded-lg px-4 py-2 text-white focus:border-brand-500 focus:outline-none"
              placeholder="0.1425"
            />
             <p className="text-xs text-slate-500 mt-1">例如: 0.1425% (一般券商預設)。系統將在新增或賣出時自動帶入預估費用。</p>
          </div>

          <div className="pt-4 flex gap-3">
             <button type="button" onClick={onClose} className="flex-1 py-2 bg-brand-700 hover:bg-brand-600 rounded-lg text-slate-300">取消</button>
             <button type="submit" className="flex-1 py-2 bg-brand-500 hover:bg-brand-400 rounded-lg text-white font-bold flex items-center justify-center gap-2">
                <Save size={16} /> 儲存設定
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;