import { GoogleGenAI, Type } from "@google/genai";
import { StockAnalysis } from "../types";

// 設定模型名稱
const MODEL_NAME = "gemini-3-flash-preview";
// FinMind API Token
const FINMIND_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJkYXRlIjoiMjAyNi0wMS0xNCAwOTowNzoxOCIsInVzZXJfaWQiOiJhNDEwMTQxMCIsImVtYWlsIjoiYTQxMDE0MTBAZ21haWwuY29tIiwiaXAiOiIxMjUuMjI3LjE2Mi4yMTEifQ.fSiNBjlmL_UKHsz5pZH4ptjJUq7x8D4xF2x8ex51ksU";

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

// 1. FinMind API 獲取即時(或最新收盤)價格
export const fetchFinMindPrice = async (symbol: string): Promise<number | null> => {
    try {
        // 設定開始日期為 7 天前，確保跨週末或連假時能抓到最近的交易日數據
        const date = new Date();
        date.setDate(date.getDate() - 7);
        const startDate = date.toISOString().split('T')[0];
        
        // FinMind API URL (TaiwanStockPrice)
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${startDate}&token=${FINMIND_TOKEN}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`FinMind API Error: ${response.status}`);
            return null;
        }
        
        const json = await response.json();
        
        if (json.msg === "success" && Array.isArray(json.data) && json.data.length > 0) {
            // 取最後一筆 (最新日期) 的資料
            const latestData = json.data[json.data.length - 1];
            const price = parseFloat(latestData.close);
            
            // 嚴格檢查：必須是有效數字且大於 0
            if (!isNaN(price) && price > 0) {
                return price;
            }
        }
        return null;
    } catch (e) {
        console.error("FinMind API Exception:", e);
        return null;
    }
};

// 為了維持 App.tsx 接口一致，將 fetchRealTimePrice 指向 FinMind 實作
export const fetchRealTimePrice = fetchFinMindPrice;

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

// 3. 獲取輔助資訊 (Step 2: AI 分析)
const fetchStockSupportingData = async (ai: GoogleGenAI, symbol: string, knownPrice: number): Promise<{ text: string, urls: string[] }> => {
    // Prompt 更新：明確指出已知現價，要求搜尋新聞與壓力支撐
    const prompt = `
      目標股票：${symbol}
      【已知權威現價】：${knownPrice} (此為 API 提供的精確價格，請以此為準)
      
      任務：請作為專業分析師，搜尋 Web 上的「第二來源」資訊 (玩股網、Yahoo 股市、鉅亨網等)，重點分析以下項目：
      1. 【昨收檢查】：驗證 ${knownPrice} 相對於昨日收盤的漲跌狀況 (若無確切昨收，可略過)。
      2. 【基本面】：最新 EPS 與 本益比 (PE)。
      3. 【技術面壓力/支撐】：基於現價 ${knownPrice}，搜尋近期的技術分析文章或討論，找出上方的壓力位與下方的支撐位。
      4. 【重大新聞】：一則最新影響該股波動的重大消息。

      注意：**不要** 嘗試重新搜尋「現價」，因為搜尋結果可能會有延遲或錯誤，請直接信任並使用 ${knownPrice} 進行分析。
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
      基準現價：${confirmedPrice} (API 數據，不可更改)
      
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

// 4. 主流程：先查價 (FinMind)，再分析 (AI)
export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  try {
    // Step 1: 獲取 FinMind 精確現價
    const realTimePrice = await fetchFinMindPrice(symbol);
    
    // 嚴格檢查：若 API 無法回傳數字，直接報錯，不進行估算
    if (realTimePrice === null || isNaN(realTimePrice)) {
        throw new Error(`FinMind API 無法取得 ${symbol} 的報價。請確認代號正確或 API 配額。`);
    }

    const ai = getAiClient();
    
    // Step 2: 獲取輔助資訊
    await sleep(500); 
    const supportingData = await fetchStockSupportingData(ai, symbol, realTimePrice);
    
    // Step 3: 整合報告
    await sleep(200);
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