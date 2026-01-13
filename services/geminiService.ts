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

// 輕量級：只獲取即時價格 (用於 10秒更新)
export const fetchRealTimePrice = async (symbol: string): Promise<number | null> => {
    const ai = getAiClient();
    // 修改 Prompt：明確要求若休市則提供收盤價
    const prompt = `查詢 ${symbol} 的最新股價。如果是盤中，請給出即時成交價；如果是休市或收盤，請給出最後收盤價。只回傳一個數字，不要有文字。例如: 102.5`;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        const text = response.text || "";
        // 增強的正則表達式：支援逗號，並忽略前後文字
        const match = text.match(/([\d,]+\.?\d*)/);
        if (match) {
            return parseFloat(match[0].replace(/,/g, ''));
        }
        return null;
    } catch (e) {
        // 靜默失敗，不影響主流程
        return null;
    }
};

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

const fetchStockRawData = async (ai: GoogleGenAI, symbol: string): Promise<{ text: string, urls: string[] }> => {
    // 優化 Prompt：強制要求數據格式，並處理收盤情境
    const prompt = `
      [高優先級] 找出台灣股票 ${symbol} 的最新數據：
      1. 【價格】(Price)：如果是盤中請給即時價，休市請給收盤價。
      2. 【昨收】(Previous Close)：精確數字。
      3. 【基本面】：本益比 (PE)、EPS。
      4. 【關鍵價位】：找出近期的「支撐位」與「壓力位」價格。
      5. 【新聞】：一則最新影響股價的重大消息。
      
      請直接列出數據，若無精確數據請找最近似值。
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
        console.warn(`Search failed for ${symbol}`);
        return { text: "搜尋失敗，無法取得即時報價。", urls: [] };
    }
};

const transformDataToJson = async (ai: GoogleGenAI, symbol: string, rawData: string): Promise<any> => {
    const prompt = `
      來源數據：
      ${rawData}

      任務：將上述數據轉換為 JSON。
      要求：
      1. currentPrice 與 prevClose 務必提取數字。如果來源寫 "100元"，請轉為 100。**若完全找不到數字，請填 0**。
      2. aiPrediction.keyLevels 請依照「支撐: xxx / 壓力: xxx」的格式撰寫。
      3. aiPrediction.trendAnalysis 請結合 LSTM 概念描述趨勢。
      
      JSON 結構 (純 JSON，無 Markdown):
      {
        "symbol": "${symbol}",
        "companyName": "string",
        "marketCap": "string",
        "eps": "string",
        "pe": "string",
        "currentPrice": number,
        "prevClose": number,
        "volatility": 0.3,
        "advice": "50字內短評",
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

export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  try {
    const ai = getAiClient();
    const searchResult = await fetchStockRawData(ai, symbol);
    await sleep(1000); // 避免 429
    const data = await transformDataToJson(ai, symbol, searchResult.text);

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
      currentPrice: data.currentPrice || 0,
      prevClose: data.prevClose || 0,
      changePercent: changePercent,
      volatility: data.volatility || 0.3,
      history: [], 
      advice: data.advice || (data.currentPrice === 0 ? "無法取得報價，請稍後再試" : "暫無建議"),
      aiPrediction: data.aiPrediction, 
      groundingUrls: searchResult.urls, 
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