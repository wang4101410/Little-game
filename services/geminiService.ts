import { GoogleGenAI, Type } from "@google/genai";
import { StockAnalysis } from "../types";

// 設定模型名稱
const MODEL_NAME = "gemini-3-flash-preview";

// 輔助函式：暫停 (Sleep)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

// --- 原子功能 (Atomic Functions) ---

/**
 * 階段一：市場偵察 (The Scout) - 用於大盤
 */
const fetchMarketTrends = async (ai: GoogleGenAI): Promise<string> => {
    const prompt = `
      請執行 Google Search，用繁體中文簡要總結以下兩點目前的狀況 (總字數控制在 300 字以內)：
      1. 台灣股市 (TAIEX) 近期的大盤趨勢 (多頭/空頭/震盪)。
      2. 近期影響全球科技股的重大國際財經新聞 (如 Fed 利率、NVidia/Apple 動態)。
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return response.text || "目前無法取得市場資訊。";
    } catch (e) {
        console.warn("市場偵察失敗:", e);
        return "市場資訊獲取失敗。";
    }
};

/**
 * 階段二：策略推理 (The Analyst) - 用於大盤
 */
const analyzePortfolioStrategy = async (
    ai: GoogleGenAI, 
    marketInfo: string, 
    portfolioSummary: string, 
    cash: number
): Promise<string> => {
    const prompt = `
      你現在是投資顧問。請根據提供的【市場背景】與【用戶持倉】，進行策略分析。
      
      【市場背景】：
      ${marketInfo}

      【用戶持倉】：
      ${portfolioSummary}
      
      【可用現金】：
      NT$${cash}

      請用繁體中文回答以下問題 (純文字分析，不需要搜尋)：
      1. **風險評估**：目前的持倉組合在上述市場背景下，最大的風險是什麼？
      2. **資金操作**：建議保留現金還是加碼？為什麼？
      3. **行動指引**：一句話的戰略總結。
    `;

    const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {} // 關閉工具
    });
    return response.text || "無法生成分析。";
};

// --- 個股分析專用的兩階段管線 ---

/**
 * 個股階段一：數據獵人 (The Hunter)
 * 任務：只負責搜尋硬數據，不負責格式化。
 */
const fetchStockRawData = async (ai: GoogleGenAI, symbol: string): Promise<{ text: string, urls: string[] }> => {
    const prompt = `
      針對台灣股票代碼：${symbol}，請使用 Google Search 搜尋最新詳細數據。
      我需要一段包含以下資訊的詳細摘要 (若無精確數據請找最近似值)：
      1. 公司全名。
      2. 目前股價 (Price)、前一日收盤價 (Previous Close)。
      3. 基本面：本益比 (PE Ratio)、每股盈餘 (EPS)、市值 (Market Cap)。
      4. 歷史走勢：過去 5-10 天的股價大概走勢 (上漲/下跌/持平)。
      5. 波動性：近期的股價波動程度 (高/低)。
      6. 近期該公司相關的重大新聞標題 (1-2 則)。
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] } // 開啟搜尋
        });

        // 提取引用來源
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const urls = (groundingChunks as any[])
            .map((chunk: any) => chunk.web?.uri)
            .filter((uri: any): uri is string => typeof uri === "string");
        const uniqueUrls = Array.from(new Set(urls));

        return { 
            text: response.text || `無法搜尋到 ${symbol} 的數據`, 
            urls: uniqueUrls 
        };
    } catch (e) {
        console.warn(`[Stage 1] Search failed for ${symbol}`, e);
        throw new Error("無法連接 Google Search 獲取股價數據");
    }
};

/**
 * 個股階段二：數據煉金術師 (The Alchemist)
 * 任務：將雜亂的搜尋文字轉換為嚴格的 JSON，並生成 AI 預測。
 */
const transformDataToJson = async (ai: GoogleGenAI, symbol: string, rawData: string): Promise<any> => {
    const prompt = `
      你是一個資料處理與金融分析引擎。
      
      任務來源數據：
      ${rawData}

      任務目標：
      1. 從來源數據中提取財務欄位 (Price, EPS, PE, etc.)。
      2. 基於來源數據中的新聞與走勢，生成 "aiPrediction" (模擬 LSTM/GARCH 觀點)。
      3. 嚴格輸出為 JSON 格式。

      Schema 定義：
      - currentPrice, prevClose 必須為數字。若來源數據中找不到，請根據上下文估算或填 0。
      - volatility 若未知，預設填 0.3。
      - advice 請用繁體中文給出 50 字以內的短評。
      - aiPrediction 內的所有文字欄位必須使用繁體中文。

      JSON 結構要求 (請只回傳 JSON):
      {
        "symbol": "${symbol}",
        "companyName": "string",
        "marketCap": "string",
        "eps": "string (e.g. '12.5' or 'N/A')",
        "pe": "string (e.g. '20.1' or 'N/A')",
        "currentPrice": number,
        "prevClose": number,
        "volatility": number,
        "advice": "string",
        "aiPrediction": {
             "trendAnalysis": "string (基於技術面觀點)",
             "volatilityAnalysis": "string (基於波動率觀點)",
             "keyLevels": "string (e.g. '支撐 xxx / 壓力 xxx')",
             "scenarios": {
                 "optimistic": "string",
                 "neutral": "string",
                 "pessimistic": "string"
             },
             "conclusion": "string"
        }
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                // 這裡不放 tools，純推理，速度快且穩定
            }
        });
        
        const text = response.text || "{}";
        return JSON.parse(text);
    } catch (e) {
        console.error(`[Stage 2] JSON Generation failed for ${symbol}`, e);
        throw new Error("AI 數據解析失敗");
    }
};

// --- 主要導出函式 ---

export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  try {
    const ai = getAiClient();

    // 1. 執行階段一：搜尋 (Search)
    // 這裡可能會花 2-5 秒
    const searchResult = await fetchStockRawData(ai, symbol);

    // 2. 緩衝 (Sleep)
    // 避免瞬間發起第二個請求導致 Rate Limit (雖然 Stage 2 不用 Search，但預防萬一)
    await sleep(800);

    // 3. 執行階段二：推理與格式化 (Reasoning)
    // 這裡會產生乾淨的 JSON
    const data = await transformDataToJson(ai, symbol, searchResult.text);

    // 4. 資料合併與計算
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
      history: [], // 簡化：歷史數據若搜尋不到，留空交由前端圖表處理或後續優化
      advice: data.advice || "暫無建議",
      aiPrediction: data.aiPrediction, // 這裡現在應該能穩定產出了
      groundingUrls: searchResult.urls, // 使用 Stage 1 找到的連結
      lastUpdated: Date.now(),
    };

  } catch (error: any) {
    console.error(`Gemini Pipeline Error (${symbol}):`, error);
    // 傳遞具體錯誤訊息給 UI
    throw error;
  }
};

export const getOverallPortfolioAdvice = async (
  portfolioItems: { symbol: string; shares: number; currentPrice: number }[],
  cashOnHand: number
): Promise<string> => {
    const ai = getAiClient();
    const summary = portfolioItems.length > 0 
      ? portfolioItems.map(p => `${p.symbol}: ${p.shares} 股 (約 NT$${Math.round(p.currentPrice * p.shares)})`).join(", ")
      : "目前沒有持倉";

    try {
        const marketTrends = await fetchMarketTrends(ai);
        await sleep(1000);
        const finalAdvice = await analyzePortfolioStrategy(ai, marketTrends, summary, cashOnHand);
        return finalAdvice;
    } catch (e: any) {
        if (e.message?.includes("429")) {
            return "⚠️ AI 思考負載過高。請稍等 1 分鐘後再試。";
        }
        return `⚠️ 建議生成失敗: ${e.message}`;
    }
};