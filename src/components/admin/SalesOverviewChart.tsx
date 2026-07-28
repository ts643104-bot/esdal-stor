import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function SalesOverviewChart({
  totalRevenue,
  totalExpenses,
  netProfit,
}: {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}) {
  const data = [
    { name: "الإيرادات", value: totalRevenue, fill: "#16a34a" },
    { name: "المصروفات", value: totalExpenses, fill: "#dc2626" },
    { name: "صافي الربح", value: netProfit, fill: "#2563eb" },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip formatter={(value) => `${value} ج.م`} cursor={{ fill: "transparent" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
