import { GoogleGenAI, Type } from "@google/genai";
import { StockAnalysis } from "../types";

// 設定模型名稱
const MODEL_NAME = "gemini-3-flash-preview";

// 輔助函式：暫停 (Sleep)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 輔助函式：強韌的 JSON 解析器
const cleanAndParseJson = (text: string) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      let clean = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    } catch (e2) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
            return JSON.parse(text.substring(start, end + 1));
        } catch (e3) { return {}; }
      }
      return {};
    }
  }
};

// 獲取 AI 客戶端
const getAiClient = () => {
  const apiKey = 
    (import.meta as any).env?.VITE_API_KEY || 
    (import.meta as any).env?.API_KEY || 
    process.env.VITE_API_KEY || 
    process.env.API_KEY ||
    process.env.REACT_APP_API_KEY;
  
  if (!apiKey) {
    throw new Error("【設定錯誤】未偵測到 API Key。");
  }
  return new GoogleGenAI({ apiKey });
};

// --- 原子功能 ---

// 1. 嚴格獲取即時價格 (鎖定玩股網 Wantgoo)
export const fetchRealTimePrice = async (symbol: string): Promise<number | null> => {
    const ai = getAiClient();
    
    // 嚴格 Prompt：指定來源、禁止估算
    // 強制搜尋 "玩股網" 關鍵字，這通常會帶出結構化的 SEO 標題 (e.g., "台積電(2330) - 個股走勢 - 玩股網")
    const prompt = `
      任務：查詢台灣股票 ${symbol} 的「精確」價格。
      限制：必須使用 Google Search 搜尋 "玩股網 ${symbol}"。
      
      規則：
      1. 請閱讀搜尋結果中來自 wantgoo.com (玩股網) 的標題或摘要。
      2. 提取「成交價」或大字體的即時價格。
      3. **嚴格禁止估算**：如果搜尋結果沒有明確的數字，或者來源不是玩股網，請回傳 "NULL"。
      4. 輸出格式：只回傳一個純數字 (例如: 2330.00)，不要有任何文字、貨幣符號或說明。
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        
        const text = response.text?.trim() || "";
        
        // 如果 AI 回傳 NULL 或找不到數字
        if (text.includes("NULL")) return null;

        // 提取數字 (支援逗號如 1,000.00)
        // 使用更嚴格的 Regex，確保是獨立的數字，而不是日期 (如 2024)
        const match = text.match(/^[\d,]+\.?\d*$/); 
        
        if (match) {
            return parseFloat(match[0].replace(/,/g, ''));
        }
        
        // Fallback: 嘗試從簡單文字中提取，但排除日期格式 (YYYY-MM-DD)
        const looseMatch = text.match(/([\d,]+\.?\d*)/);
        if (looseMatch && !text.includes('-')) {
             return parseFloat(looseMatch[0].replace(/,/g, ''));
        }

        return null;
    } catch (e) {
        return null;
    }
};

// 2. 獲取市場趨勢 (不變)
const fetchMarketTrends = async (ai: GoogleGenAI): Promise<string> => {
    const prompt = `請搜尋並簡述：1. 台灣加權指數(TAIEX)今日走勢。 2. 影響台股的重大國際財經新聞 (如美股表現)。(總計 200 字內)`;
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return response.text || "無法取得資訊";
    } catch (e) { return "市場資訊連線失敗"; }
};

const analyzePortfolioStrategy = async (ai: GoogleGenAI, marketInfo: string, portfolioSummary: string, cash: number): Promise<string> => {
    const prompt = `
      市場：${marketInfo}
      持倉：${portfolioSummary}
      現金：NT$${cash}
      任務：擔任投資顧問，用繁體中文給出 3 點策略建議 (風險、操作、總結)。不需搜尋。
    `;
    const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
    return response.text || "分析生成失敗";
};

// --- 個股分析管線 ---

// 3. 獲取輔助資訊 (新聞、基本面、昨收) - 作為第二來源
const fetchStockSupportingData = async (ai: GoogleGenAI, symbol: string, knownPrice: number): Promise<{ text: string, urls: string[] }> => {
    // Prompt：已知現價，搜尋新聞與技術面
    const prompt = `
      目標股票：${symbol}
      基準現價：${knownPrice} (請以此價格為絕對基準進行分析，**不要**重新搜尋價格)
      
      任務：請搜尋以下「第二來源」資訊 (可搜尋新聞網站、Yahoo股市等)：
      1. 【昨收】(Previous Close)：確認昨日收盤價。
      2. 【基本面】：最新 EPS 與 本益比 (PE)。
      3. 【技術面】：根據基準現價 ${knownPrice}，搜尋相關新聞或分析，找出近期的「支撐位」與「壓力位」。
      4. 【新聞】：一則最新影響該股波動的重大消息。
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const urls = (groundingChunks as any[])
            .map((chunk: any) => chunk.web?.uri)
            .filter((uri: any): uri is string => typeof uri === "string");

        return { text: response.text || "", urls: Array.from(new Set(urls)) };
    } catch (e) {
        console.warn(`Supporting data search failed for ${symbol}`);
        return { text: "無法取得新聞與基本面資訊。", urls: [] };
    }
};

const transformDataToJson = async (ai: GoogleGenAI, symbol: string, rawData: string, confirmedPrice: number): Promise<any> => {
    const prompt = `
      基準現價：${confirmedPrice} (這是權威數據，請直接使用)
      
      輔助來源數據：
      ${rawData}

      任務：將數據整合為 JSON。
      
      規則：
      1. currentPrice 必須等於 ${confirmedPrice}。
      2. prevClose 請從輔助數據中提取，若找不到請填 0。
      3. aiPrediction.keyLevels 請根據新聞與技術面分析，推導出支撐與壓力區間。
      4. volatility 請根據新聞波動程度估算 (0.2 ~ 0.8)。
      
      JSON 結構 (純 JSON):
      {
        "symbol": "${symbol}",
        "companyName": "string",
        "marketCap": "string",
        "eps": "string",
        "pe": "string",
        "currentPrice": number,
        "prevClose": number,
        "volatility": 0.3,
        "advice": "50字內短評，針對現價 ${confirmedPrice} 給出建議",
        "aiPrediction": {
             "trendAnalysis": "string",
             "volatilityAnalysis": "string",
             "keyLevels": "string (格式: 支撐 xxx / 壓力 xxx)",
             "scenarios": { "optimistic": "string", "neutral": "string", "pessimistic": "string" },
             "conclusion": "string"
        }
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { } // 關閉 tools 以純文字推理
        });
        return cleanAndParseJson(response.text);
    } catch (e) {
        throw new Error("數據解析失敗");
    }
};

// 4. 主流程：先查價(嚴格)，再分析(輔助)
export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  try {
    // Step 1: 獲取嚴格現價
    const realTimePrice = await fetchRealTimePrice(symbol);
    
    if (realTimePrice === null || isNaN(realTimePrice)) {
        throw new Error(`無法從玩股網 (Wantgoo) 取得 ${symbol} 的精確報價。為確保投資安全，系統拒絕估算。`);
    }

    const ai = getAiClient();
    
    // Step 2: 獲取輔助資訊
    await sleep(1000); // 避免 Rate Limit
    const supportingData = await fetchStockSupportingData(ai, symbol, realTimePrice);
    
    // Step 3: 整合報告
    await sleep(500);
    const data = await transformDataToJson(ai, symbol, supportingData.text, realTimePrice);

    // 計算漲跌幅
    const changePercent = data.prevClose > 0 
        ? ((data.currentPrice - data.prevClose) / data.prevClose) * 100 
        : 0;

    return {
      symbol: data.symbol?.toUpperCase() || symbol,
      companyName: data.companyName || symbol,
      marketCap: data.marketCap || 'N/A',
      eps: data.eps || 'N/A',
      pe: data.pe || 'N/A',
      currentPrice: data.currentPrice, // 確保使用 Step 1 的價格
      prevClose: data.prevClose || 0,
      changePercent: changePercent,
      volatility: data.volatility || 0.3,
      history: [], 
      advice: data.advice || "暫無建議",
      aiPrediction: data.aiPrediction, 
      groundingUrls: supportingData.urls, 
      lastUpdated: Date.now(),
    };
  } catch (error: any) {
    console.error(`Analysis Error (${symbol}):`, error);
    throw error;
  }
};

export const getOverallPortfolioAdvice = async (
  portfolioItems: { symbol: string; shares: number; currentPrice: number }[],
  cashOnHand: number
): Promise<string> => {
    const ai = getAiClient();
    const summary = portfolioItems.length > 0 
      ? portfolioItems.map(p => `${p.symbol}: ${p.shares}股 ($${Math.round(p.currentPrice)})`).join(", ")
      : "無持倉";

    try {
        const marketTrends = await fetchMarketTrends(ai);
        await sleep(1000);
        return await analyzePortfolioStrategy(ai, marketTrends, summary, cashOnHand);
    } catch (e: any) {
        return "暫時無法生成整體建議";
    }
};