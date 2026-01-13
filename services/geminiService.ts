import { GoogleGenAI, Type } from "@google/genai";
import { StockAnalysis } from "../types";

// 設定模型名稱
const MODEL_NAME = "gemini-3-flash-preview";

// 獲取 AI 客戶端
// 安全性說明與修復：
// 1. 在靜態網站部署 (如 Vercel, Netlify) 中，環境變數通常不會自動暴露給瀏覽器，除非變數名稱有特定前綴 (如 VITE_)。
// 2. 為了確保您的 API Key 能被讀取，我們增加了對 VITE_API_KEY 的檢查。
// 3. 請在您的部署平台設定環境變數：Key 為 "VITE_API_KEY"，Value 為您的 Gemini API Key。
const getAiClient = () => {
  // 嘗試多種來源讀取 API Key，以相容不同的構建工具 (Vite, CRA, Webpack)
  // 使用 (import.meta as any).env 避免 TypeScript 在某些配置下的類型錯誤
  const apiKey = 
    (import.meta as any).env?.VITE_API_KEY || 
    (import.meta as any).env?.API_KEY || 
    process.env.VITE_API_KEY || 
    process.env.API_KEY ||
    process.env.REACT_APP_API_KEY;
  
  if (!apiKey) {
    throw new Error("【設定錯誤】未偵測到 API Key。\n請前往您的部署平台 (Vercel/Netlify/Cloudflare) 的後台設定：\n1. 找到 Environment Variables (環境變數)。\n2. 新增變數名稱為 'VITE_API_KEY'。\n3. 填入您的 API Key 並重新部署。");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  try {
    const ai = getAiClient();
    const prompt = `
      請針對台灣股票代碼：${symbol} 進行深度財務分析與未來價格路徑預測 (以台幣 TWD 為基準)。
      
      **重要指令：所有分析內容、建議、趨勢描述與結論，請務必使用「繁體中文」回答。**

      第一部分：基礎數據獲取 (使用 Google Search)
      1. 公司完整名稱。
      2. 目前市值 (Market Cap)。
      3. 目前股價 (Current Price) 與 前一日收盤價 (Prev Close)。
      4. **EPS (每股盈餘)** 與 **P/E (本益比)** (若無最新數據請估算或找最近一季)。
      5. 過去 14 天收盤價趨勢。
      6. 年化波動率 (Volatility)。

      第二部分：混合模型預測指令 (Hybrid Model Prediction)
      請模擬執行以下分析並提供結果 (請用繁體中文撰寫內容)：
      
      1. **核心預測與趨勢修正 (LSTM邏輯)**：
         - 分析歷史價格序列，捕捉非線性趨勢和週期模式 (看漲/看跌/震盪)。
         - 結合技術指標 (RSI, MACD) 判斷短期超買/超賣狀態。
      
      2. **波動率錨定 (GARCH邏輯)**：
         - 評估未來波動率，是否處於波動集聚期 (大漲大跌後)。
      
      3. **基本面與情緒錨定**：
         - 掃描近期新聞、財報、社群討論的情緒傾向 (積極/消極/中性)。
         - 提取財報關鍵意外數據 (如營收超預期、毛利率變化)。
         - 指出當前市場最大共識敘事 (例如："AI伺服器供應商"、"庫存去化結束")。

      4. **風險模擬 (情境層)**：
         - 設定 [樂觀、中性、悲觀] 三種情景。
         - 為每種情景提供核心驅動邏輯和可能的價格區間。

      請嚴格按照此 JSON 模式返回數據。
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                symbol: { type: Type.STRING },
                companyName: { type: Type.STRING },
                marketCap: { type: Type.STRING },
                eps: { type: Type.STRING, description: "e.g. 12.5 or 'N/A'" },
                pe: { type: Type.STRING, description: "e.g. 20.5 or 'N/A'" },
                currentPrice: { type: Type.NUMBER },
                prevClose: { type: Type.NUMBER },
                volatility: { type: Type.NUMBER },
                history: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            date: { type: Type.STRING },
                            price: { type: Type.NUMBER }
                        }
                    }
                },
                advice: { type: Type.STRING, description: "簡短的投資建議總結 (繁體中文)" },
                aiPrediction: {
                    type: Type.OBJECT,
                    description: "Advanced Hybrid Model Results in Traditional Chinese",
                    properties: {
                        trendAnalysis: { type: Type.STRING, description: "LSTM 趨勢與技術指標分析 (繁體中文)" },
                        volatilityAnalysis: { type: Type.STRING, description: "GARCH 波動率與市場情緒分析 (繁體中文)" },
                        keyLevels: { type: Type.STRING, description: "目標日期機率分佈 (e.g. 5%, 50%, 95% 分位數)" },
                        scenarios: {
                            type: Type.OBJECT,
                            properties: {
                                optimistic: { type: Type.STRING, description: "樂觀情境的邏輯與價格區間 (繁體中文)" },
                                neutral: { type: Type.STRING, description: "中性情境的邏輯與價格區間 (繁體中文)" },
                                pessimistic: { type: Type.STRING, description: "悲觀情境的邏輯與價格區間 (繁體中文)" }
                            }
                        },
                        conclusion: { type: Type.STRING, description: "最高機率情境與置信度結論 (繁體中文)" }
                    }
                }
            },
            required: ["symbol", "companyName", "currentPrice", "prevClose", "eps", "pe", "advice", "aiPrediction"]
        }
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const urls = (groundingChunks as any[])
      .map((chunk: any) => chunk.web?.uri)
      .filter((uri: any): uri is string => typeof uri === "string");

    const uniqueUrls = Array.from(new Set(urls));
    const changePercent = ((data.currentPrice - data.prevClose) / data.prevClose) * 100;

    return {
      symbol: data.symbol.toUpperCase(),
      companyName: data.companyName,
      marketCap: data.marketCap || 'N/A',
      eps: data.eps,
      pe: data.pe,
      currentPrice: data.currentPrice,
      prevClose: data.prevClose,
      changePercent: changePercent,
      volatility: data.volatility || 0.3, // default if missing
      history: data.history || [],
      advice: data.advice,
      aiPrediction: data.aiPrediction,
      groundingUrls: uniqueUrls,
      lastUpdated: Date.now(),
    };

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    // 直接拋出錯誤，讓 App.tsx 捕捉並顯示給使用者
    throw new Error(error.message || "分析過程中發生未知錯誤");
  }
};

export const getOverallPortfolioAdvice = async (
  portfolioItems: { symbol: string; shares: number; currentPrice: number }[],
  cashOnHand: number
): Promise<string> => {
    
    const summary = portfolioItems.length > 0 
      ? portfolioItems.map(p => `${p.symbol}: ${p.shares} 股 @ NT$${p.currentPrice}`).join(", ")
      : "目前沒有持倉";
    
    const prompt = `
      我有以下的台灣股市投資組合狀況：
      1. 持倉列表: [${summary}]。
      2. 目前手頭可用現金 (新台幣 TWD): NT$${cashOnHand}。

      請擔任我的投資顧問，根據目前的台灣股市與國際總體市場狀況（如果需要，請進行快速搜尋），用繁體中文回答：
      1. 分析目前持倉的風險。
      2. 針對我手頭的現金，給出具體的運用建議（例如：應該加碼目前的哪些股票？還是保留現金？或是尋找其他台股機會？）。
      3. 請給出一段綜合的戰略建議。
    `;

    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        return response.text || "無法生成投資組合建議。";
    } catch (e: any) {
        console.error(e);
        // 重要更新：不再隱藏錯誤訊息，直接回傳 Google API 的原始錯誤
        // 這樣您在畫面上就能看到是 403 (Key錯誤), 429 (配額滿), 還是 400 (區域限制)
        return `⚠️ 建議生成失敗: ${e.message || "未知錯誤，請檢查 API Key 設定"}`;
    }
};