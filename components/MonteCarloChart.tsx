import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { SimulationPath } from '../types';

interface MonteCarloChartProps {
  simulations: SimulationPath[];
  currentPrice: number;
}

const MonteCarloChart: React.FC<MonteCarloChartProps> = ({ simulations, currentPrice }) => {
  if (simulations.length === 0) return null;

  // Transform data for Recharts: Array of objects where key is SimID
  const days = simulations[0].data.length;
  const chartData = [];

  for (let i = 0; i < days; i++) {
    const point: any = { step: i };
    simulations.forEach((sim, idx) => {
      point[`sim${idx}`] = sim.data[i].price;
    });
    chartData.push(point);
  }

  // Calculate Average End Price for reference
  const endPrices = simulations.map(s => s.data[s.data.length - 1].price);
  const avgEndPrice = endPrices.reduce((a, b) => a + b, 0) / endPrices.length;
  const isPositive = avgEndPrice > currentPrice;

  return (
    <div className="w-full h-64 bg-brand-800/50 rounded-lg p-2 border border-brand-700">
      <div className="flex justify-between items-center px-4 mb-2">
         <h4 className="text-sm font-semibold text-gray-400">蒙地卡羅預測 (6 個月)</h4>
         <span className={`text-xs font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            預估平均: NT${avgEndPrice.toFixed(2)}
         </span>
      </div>
     
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="step" 
            stroke="#94a3b8" 
            tick={{fontSize: 10}}
            // Approximate 21 trading days per month
            tickFormatter={(val) => `${Math.round(val / 21)}`}
            ticks={[0, 21, 42, 63, 84, 105, 126]}
            type="number"
            domain={[0, 'dataMax']}
            label={{ value: '月', position: 'insideBottomRight', offset: -5, fill: '#94a3b8' }} 
          />
          <YAxis 
            stroke="#94a3b8" 
            domain={['auto', 'auto']} 
            tick={{fontSize: 10}}
            width={40}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
            itemStyle={{ fontSize: '12px' }}
            formatter={(value: number) => [`NT$${value.toFixed(2)}`, '價格']}
            labelFormatter={(label) => `第 ${(label / 21).toFixed(1)} 個月`}
          />
          <ReferenceLine y={currentPrice} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: '目前價格', fill: '#fbbf24', fontSize: 10 }} />
          {simulations.map((sim, idx) => (
            <Line
              key={sim.name}
              type="monotone"
              dataKey={`sim${idx}`}
              stroke={idx % 2 === 0 ? "#60a5fa" : "#3b82f6"}
              strokeWidth={1}
              strokeOpacity={0.25} // Reduced opacity for cleaner look with 50 simulations
              dot={false}
              activeDot={false}
            />
          ))}
          <Line 
             type="monotone" 
             dataKey={() => avgEndPrice} 
             stroke="transparent" 
             activeDot={{r: 4, fill: isPositive ? '#4ade80' : '#f87171'}} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MonteCarloChart;