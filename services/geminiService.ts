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

// 獲取 AI 客戶端 (Google API Key)
const getAiClient = () => {
  const apiKey = 
    (import.meta as any).env?.VITE_API_KEY || 
    (import.meta as any).env?.API_KEY || 
    process.env.VITE_API_KEY || 
    process.env.API_KEY ||
    process.env.REACT_APP_API_KEY;
  
  if (!apiKey) {
    throw new Error("【設定錯誤】未偵測到 Google API Key。");
  }
  return new GoogleGenAI({ apiKey });
};

// 獲取 FinMind Token
const getFinMindToken = () => {
  // 優先嘗試讀取環境變數，若讀不到則使用備用的寫死 Token (修復用戶問題)
  const envToken = (import.meta as any).env?.VITE_FINMIND_TOKEN || process.env.VITE_FINMIND_TOKEN;
  if (envToken) return envToken;

  // Fallback Token (User provided)
  return "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJkYXRlIjoiMjAyNi0wMS0xNCAwOTowNzoxOCIsInVzZXJfaWQiOiJhNDEwMTQxMCIsImVtYWlsIjoiYTQxMDE0MTBAZ21haWwuY29tIiwiaXAiOiIxMjUuMjI3LjE2Mi4yMTEifQ.fSiNBjlmL_UKHsz5pZH4ptjJUq7x8D4xF2x8ex51ksU";
};

// --- 原子功能 ---

// 1. FinMind API 獲取即時(或最新收盤)價格
export const fetchFinMindPrice = async (symbol: string): Promise<number | null> => {
    try {
        const token = getFinMindToken();
        // 設定開始日期為 7 天前，確保跨週末或連假時能抓到最近的交易日數據
        const date = new Date();
        date.setDate(date.getDate() - 7);
        const startDate = date.toISOString().split('T')[0];
        
        // FinMind API URL (TaiwanStockPrice)
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${startDate}&token=${token}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`FinMind Price API Error: ${response.status}`);
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
        console.error("FinMind Price API Exception:", e);
        return null;
    }
};

// 1.5 FinMind API 獲取相關新聞 (用於第二階段分析)
const fetchFinMindNews = async (symbol: string): Promise<string> => {
    try {
        const token = getFinMindToken();
        // 抓取過去 30 天的新聞，確保有足夠資料量來判斷趨勢
        const date = new Date();
        date.setDate(date.getDate() - 30);
        const startDate = date.toISOString().split('T')[0];

        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockNews&data_id=${symbol}&start_date=${startDate}&token=${token}`;

        const response = await fetch(url);
        if (!response.ok) return "FinMind 新聞 API 連線失敗";

        const json = await response.json();
        
        if (json.msg === "success" && Array.isArray(json.data) && json.data.length > 0) {
            // 取最新的 5-8 則新聞摘要，包含日期與標題
            const newsItems = json.data.reverse().slice(0, 8).map((item: any) => {
                return `• [${item.date}] ${item.title}`;
            });
            return newsItems.join("\n");
        }
        return "FinMind 資料庫中近期無該股新聞。";
    } catch (e) {
        console.warn("FinMind News API Exception:", e);
        return "取得新聞發生錯誤";
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

// 3. 獲取輔助資訊 (Step 2: AI 分析 - 結合 FinMind 新聞)
const fetchStockSupportingData = async (ai: GoogleGenAI, symbol: string, knownPrice: number): Promise<{ text: string, urls: string[] }> => {
    // 1. 先從 FinMind 取得新聞資料 (這是權威的第一手消息來源)
    const finMindNews = await fetchFinMindNews(symbol);

    // 2. 構建 Prompt：要求 AI 基於已知價格 + FinMind 新聞進行分析
    const prompt = `
      目標股票：${symbol}
      【權威現價】：${knownPrice} (API 實時數據，以此為準)
      
      【FinMind 提供的近期新聞彙整】：
      ${finMindNews}
      
      任務：請作為專業技術分析師，進行以下分析：
      1. 【新聞情緒解讀】：分析上述 FinMind 新聞是利多、利空還是中性？市場對此的反應可能為何？
      2. 【技術面推演】：**請嚴格根據「已知現價 ${knownPrice}」以及「新聞隱含的市場情緒」，推算出短期的「支撐位」與「壓力位」。** (例如：若新聞利多，支撐位可能上移至現價附近；若利空，壓力位可能在現價上方不遠處)。
      3. 【基本面補充】：請利用 Google Search 搜尋該股最新的 EPS 與 本益比 (PE) 數據。

      注意：
      - 不要重新搜尋股價。
      - 支撐與壓力位的推論邏輯必須與新聞情緒一致。
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
      
      輔助來源數據 (含 FinMind 新聞分析)：
      ${rawData}

      任務：將數據整合為 JSON。
      
      規則：
      1. currentPrice 必須等於 ${confirmedPrice}。
      2. prevClose 請從輔助數據中提取，若找不到請填 0。
      3. aiPrediction.keyLevels 請填寫從新聞分析中推導出的「支撐位」與「壓力位」具體數值與簡短理由。
      4. volatility 請根據新聞的波動程度與情緒強度估算 (0.2 ~ 0.8)。
      
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
             "keyLevels": "string (格式: 支撐 xxx / 壓力 xxx，含簡短理由)",
             "scenarios": { "optimistic": "string", "neutral": "string", "pessimistic": "string" },
             "conclusion": "string"
        }
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { }
        });
        return cleanAndParseJson(response.text);
    } catch (e) {
        throw new Error("數據解析失敗");
    }
};

// 4. 主流程：先查價 (FinMind)，再查新聞 (FinMind)，最後分析 (AI)
export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  try {
    // Step 1: 獲取 FinMind 精確現價
    const realTimePrice = await fetchFinMindPrice(symbol);
    
    // 嚴格檢查：若 API 無法回傳數字，直接報錯，不進行估算
    if (realTimePrice === null || isNaN(realTimePrice)) {
        throw new Error(`FinMind API 無法取得 ${symbol} 的報價。請確認 Token 是否正確。`);
    }

    const ai = getAiClient();
    
    // Step 2: 獲取輔助資訊
    await sleep(500); 
    const supportingData = await fetchStockSupportingData(ai, symbol, realTimePrice);
    
    // Step 3: 整合報告
    await sleep(200);
    const data = await transformDataToJson(ai, symbol, supportingData.text, realTimePrice);

    const changePercent = data.prevClose > 0 
        ? ((data.currentPrice - data.prevClose) / data.prevClose) * 100 
        : 0;

    return {
      symbol: data.symbol?.toUpperCase() || symbol,
      companyName: data.companyName || symbol,
      marketCap: data.marketCap || 'N/A',
      eps: data.eps || 'N/A',
      pe: data.pe || 'N/A',
      currentPrice: data.currentPrice,
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