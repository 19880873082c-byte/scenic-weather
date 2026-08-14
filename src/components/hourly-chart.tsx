"use client";

import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { HourWeather } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export type HourlyMetric = "temperature-rain" | "cloud-humidity" | "wind-visibility" | "air-uv";

function tooltipFormatter(params: unknown) {
  const rows = params as Array<{ axisValue?: string; marker?: string; seriesName?: string; value?: number | null }>;
  return `${rows[0]?.axisValue ?? ""}<br/>${rows
    .map((row) => `${row.marker ?? ""}${row.seriesName ?? ""} ${row.value === null || row.value === undefined ? "暂无" : row.value}`)
    .join("<br/>")}`;
}

function baseOption(hours: HourWeather[], compact: boolean): EChartsOption {
  return {
    animationDuration: 450,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#123f42",
      borderWidth: 0,
      textStyle: { color: "#fff" },
      formatter: tooltipFormatter,
    },
    grid: { left: 42, right: 22, top: 42, bottom: 30, containLabel: true },
    legend: { top: 0, right: 6, itemWidth: 10, itemHeight: 5, textStyle: { color: "#587074", fontSize: 11 } },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: hours.map((hour) => hour.time.slice(11, 16)),
      axisLine: { lineStyle: { color: "#d8e4e3" } },
      axisTick: { show: false },
      axisLabel: { color: "#708487", interval: compact ? 1 : 2 },
    },
  };
}

export function buildHourlyChartOption(hours: HourWeather[], metric: HourlyMetric, compact = false): EChartsOption {
  const selected = hours.filter((_, index) => compact ? index % 2 === 0 : true);
  const base = baseOption(selected, compact);

  if (metric === "cloud-humidity") {
    return {
      ...base,
      yAxis: [{ type: "value", name: "%", min: 0, max: 100, splitLine: { lineStyle: { color: "#edf2f1" } }, axisLabel: { color: "#708487" } }],
      series: [
        { name: "云量%", type: "line", data: selected.map((hour) => Math.round(hour.cloudCover)), smooth: true, symbol: "none", lineStyle: { width: 3, color: "#7897ad" }, areaStyle: { color: "rgba(120,151,173,.16)" } },
        { name: "湿度%", type: "line", data: selected.map((hour) => Math.round(hour.humidity)), smooth: true, symbol: "circle", symbolSize: 4, lineStyle: { width: 2, color: "#2e8a83" }, itemStyle: { color: "#2e8a83" } },
      ],
    };
  }

  if (metric === "wind-visibility") {
    return {
      ...base,
      yAxis: [
        { type: "value", name: "km/h", min: 0, splitLine: { lineStyle: { color: "#edf2f1" } }, axisLabel: { color: "#708487" } },
        { type: "value", name: "km", min: 0, splitLine: { show: false }, axisLabel: { color: "#708487" } },
      ],
      series: [
        { name: "风速 km/h", type: "line", data: selected.map((hour) => Math.round(hour.windSpeed)), smooth: true, symbol: "circle", symbolSize: 4, lineStyle: { width: 3, color: "#477d72" }, itemStyle: { color: "#477d72" } },
        { name: "阵风 km/h", type: "line", data: selected.map((hour) => Math.round(hour.windGusts)), smooth: true, symbol: "none", lineStyle: { width: 2, color: "#b1794c", type: "dashed" } },
        { name: "能见度 km", type: "line", yAxisIndex: 1, data: selected.map((hour) => Number(hour.visibility.toFixed(1))), smooth: true, symbol: "none", lineStyle: { width: 2, color: "#3f8da3" }, areaStyle: { color: "rgba(63,141,163,.1)" } },
      ],
    };
  }

  if (metric === "air-uv") {
    return {
      ...base,
      yAxis: [
        { type: "value", name: "AQI", min: 0, splitLine: { lineStyle: { color: "#edf2f1" } }, axisLabel: { color: "#708487" } },
        { type: "value", name: "UV", min: 0, max: 12, splitLine: { show: false }, axisLabel: { color: "#708487" } },
      ],
      series: [
        { name: "AQI", type: "line", connectNulls: false, data: selected.map((hour) => hour.aqi === null ? null : Math.round(hour.aqi)), smooth: true, symbol: "circle", symbolSize: 4, lineStyle: { width: 3, color: "#6e8b62" }, itemStyle: { color: "#6e8b62" }, areaStyle: { color: "rgba(110,139,98,.12)" } },
        { name: "PM2.5 μg/m³", type: "line", connectNulls: false, data: selected.map((hour) => hour.pm25 === null ? null : Math.round(hour.pm25)), smooth: true, symbol: "none", lineStyle: { width: 2, color: "#8b7270", type: "dashed" } },
        { name: "紫外线 UV", type: "line", yAxisIndex: 1, data: selected.map((hour) => Number(hour.uvIndex.toFixed(1))), smooth: true, symbol: "none", lineStyle: { width: 2, color: "#d79738" } },
      ],
    };
  }

  return {
    ...base,
    yAxis: [
      { type: "value", name: "°C", min: (value) => Math.floor(value.min - 2), max: (value) => Math.ceil(value.max + 2), splitLine: { lineStyle: { color: "#edf2f1" } }, axisLabel: { color: "#708487" } },
      { type: "value", name: "%", min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: "#708487" } },
    ],
    series: [
      { name: "温度 °C", type: "line", data: selected.map((hour) => Number(hour.temperature.toFixed(1))), smooth: true, symbol: "circle", symbolSize: 5, lineStyle: { width: 3, color: "#df8d3d" }, itemStyle: { color: "#df8d3d" }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(238,174,91,.28)" }, { offset: 1, color: "rgba(238,174,91,0)" }] } } },
      { name: "体感 °C", type: "line", data: selected.map((hour) => Number(hour.apparentTemperature.toFixed(1))), smooth: true, symbol: "none", lineStyle: { width: 2, color: "#b78b68", type: "dotted" } },
      { name: "降雨概率%", type: "line", yAxisIndex: 1, data: selected.map((hour) => Math.round(hour.precipitationProbability)), smooth: true, symbol: "none", lineStyle: { width: 2, color: "#3f8da3", type: "dashed" } },
    ],
  };
}

export function HourlyChart({ hours, metric, compact = false }: { hours: HourWeather[]; metric: HourlyMetric; compact?: boolean }) {
  const option = buildHourlyChartOption(hours, metric, compact);
  return <ReactECharts option={option} style={{ height: compact ? 255 : 315, width: "100%" }} notMerge lazyUpdate />;
}
