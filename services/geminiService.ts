import { GoogleGenAI, Type } from "@google/genai";
import { StockAnalysis } from "../types";

// 設定模型名稱
const MODEL_NAME = "gemini-3-flash-preview";

// 輔助函式：暫停 (Sleep) - 用於步驟之間的緩衝
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

// --- 拆解後的原子功能 (Atomic Functions) ---

/**
 * 階段一：市場偵察 (The Scout)
 * 目的：只獲取外部市場資訊，不處理個人持倉。
 * 優點：Token 少，專注於搜尋，不會混淆模型。
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
            config: {
                tools: [{ googleSearch: {} }], // 只有這一步驟開啟搜尋
            }
        });
        return response.text || "目前無法取得市場資訊。";
    } catch (e) {
        console.warn("市場偵察失敗:", e);
        return "市場資訊獲取失敗，將基於一般邏輯分析。";
    }
};

/**
 * 階段二：策略推理 (The Analyst)
 * 目的：結合市場資訊與個人持倉進行邏輯分析。
 * 優點：關閉搜尋工具，純文字推理，極難觸發 429 限制。
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
        config: {
            // 關鍵：這裡完全不設定 tools，強制使用純推理模式
            // 這能大幅降低系統負載，避免 Resource Exhausted
        }
    });
    return response.text || "無法生成分析。";
};


// --- 主要導出函式 ---

export const analyzeStockWithGemini = async (symbol: string): Promise<StockAnalysis> => {
  // 個股分析仍保持單一請求，但我們移除不必要的複雜指令以減輕負載
  try {
    const ai = getAiClient();
    const prompt = `
      針對台股 ${symbol}，請用 Google Search 查詢最新數據並回傳 JSON。
      需要：公司名、市值、現價、昨收、EPS、PE、14天歷史價、波動率(預估)。
      並提供簡短投資建議與趨勢預測(LSTM/GARCH概念)。
      請確保回傳為標準 JSON 格式。
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
                eps: { type: Type.STRING },
                pe: { type: Type.STRING },
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
                advice: { type: Type.STRING },
                aiPrediction: {
                    type: Type.OBJECT,
                    properties: {
                        trendAnalysis: { type: Type.STRING },
                        volatilityAnalysis: { type: Type.STRING },
                        keyLevels: { type: Type.STRING },
                        scenarios: {
                            type: Type.OBJECT,
                            properties: {
                                optimistic: { type: Type.STRING },
                                neutral: { type: Type.STRING },
                                pessimistic: { type: Type.STRING }
                            }
                        },
                        conclusion: { type: Type.STRING }
                    }
                }
            },
            required: ["symbol", "companyName", "currentPrice", "prevClose"]
        }
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);

    // 資料處理邏輯保持不變
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const urls = (groundingChunks as any[])
      .map((chunk: any) => chunk.web?.uri)
      .filter((uri: any): uri is string => typeof uri === "string");
    const uniqueUrls = Array.from(new Set(urls));
    const changePercent = ((data.currentPrice - data.prevClose) / data.prevClose) * 100;

    return {
      symbol: data.symbol?.toUpperCase() || symbol,
      companyName: data.companyName || symbol,
      marketCap: data.marketCap || 'N/A',
      eps: data.eps || 'N/A',
      pe: data.pe || 'N/A',
      currentPrice: data.currentPrice || 0,
      prevClose: data.prevClose || 0,
      changePercent: changePercent || 0,
      volatility: data.volatility || 0.3,
      history: data.history || [],
      advice: data.advice || "暫無建議",
      aiPrediction: data.aiPrediction,
      groundingUrls: uniqueUrls,
      lastUpdated: Date.now(),
    };

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    // 這裡我們保留原始錯誤拋出，讓 UI 層決定是否重試
    throw error;
  }
};

export const getOverallPortfolioAdvice = async (
  portfolioItems: { symbol: string; shares: number; currentPrice: number }[],
  cashOnHand: number
): Promise<string> => {
    const ai = getAiClient();
    
    // 步驟拆解 1: 準備持倉摘要字串
    const summary = portfolioItems.length > 0 
      ? portfolioItems.map(p => `${p.symbol}: ${p.shares} 股 (約 NT$${Math.round(p.currentPrice * p.shares)})`).join(", ")
      : "目前沒有持倉";

    try {
        // 步驟拆解 2: 執行「階段一：市場偵察」
        // 這一步會消耗 Search 配額
        const marketTrends = await fetchMarketTrends(ai);
        
        // 緩衝：在兩個 API 呼叫之間稍微休息一下 (1秒)，讓 Server 喘口氣
        await sleep(1000);

        // 步驟拆解 3: 執行「階段二：策略推理」
        // 這一步完全不使用 Search，只消耗文字生成配額
        const finalAdvice = await analyzePortfolioStrategy(ai, marketTrends, summary, cashOnHand);

        return finalAdvice;

    } catch (e: any) {
        console.error("Portfolio Advice Error:", e);
        // 如果是配額錯誤，回傳友善提示
        if (e.message?.includes("429")) {
            return "⚠️ AI 思考負載過高。請稍等 1 分鐘後再試 (系統正在自動調節請求頻率)。";
        }
        return `⚠️ 建議生成失敗: ${e.message}`;
    }
};