"use client";

import { type KeyboardEvent, useId, useState } from "react";
import type { HourWeather } from "@/lib/types";
import { weatherLabel } from "@/lib/weather-code";
import { HourlyChart, type HourlyMetric } from "./hourly-chart";
import { WeatherIcon } from "./weather-icon";

const metricTabs: Array<{ id: HourlyMetric; label: string; title: string; description: string }> = [
  { id: "temperature-rain", label: "温度与降雨", title: "温度、体感与降雨概率", description: "同时判断体感舒适度与雨势变化。" },
  { id: "cloud-humidity", label: "云量与湿度", title: "云量与湿度变化", description: "云层影响自然光，湿度影响通透感与体感。" },
  { id: "wind-visibility", label: "风与能见度", title: "风力与能见度变化", description: "阵风关系到登高安全，能见度决定远景层次。" },
  { id: "air-uv", label: "空气与紫外线", title: "空气质量与紫外线", description: "空气质量缺测时保留空值，绝不按 0 处理。" },
];

function number(value: number, digits = 0) {
  return value.toFixed(digits);
}

export function HourlyExplorer({
  hours,
  compact = false,
  weatherProvider,
  airQualityProvider,
}: {
  hours: HourWeather[];
  compact?: boolean;
  weatherProvider: string;
  airQualityProvider: string;
}) {
  const [metric, setMetric] = useState<HourlyMetric>("temperature-rain");
  const id = useId();
  const active = metricTabs.find((item) => item.id === metric) ?? metricTabs[0];
  const aqiHours = hours.filter((hour) => hour.aqi !== null).length;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % metricTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + metricTabs.length) % metricTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = metricTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setMetric(metricTabs[nextIndex].id);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs?.[nextIndex]?.focus();
  }

  if (hours.length === 0) {
    return <div className="hourly-empty" role="status"><strong>该日期暂无逐小时预报</strong><p>天气服务对远期日期只提供每日预报，请参考本页日汇总和评分；临近出发时再刷新可获得逐小时数据。</p></div>;
  }

  return <div className="hourly-explorer">
    <div className="hourly-tabs" role="tablist" aria-label="逐小时天气指标" aria-orientation="horizontal">
      {metricTabs.map((item, index) => <button
        key={item.id}
        id={`${id}-tab-${item.id}`}
        type="button"
        role="tab"
        aria-selected={metric === item.id}
        aria-controls={`${id}-panel-${item.id}`}
        tabIndex={metric === item.id ? 0 : -1}
        className={metric === item.id ? "active" : ""}
        onClick={() => setMetric(item.id)}
        onKeyDown={(event) => handleTabKeyDown(event, index)}
      >{item.label}</button>)}
    </div>

    <div
      id={`${id}-panel-${metric}`}
      role="tabpanel"
      aria-labelledby={`${id}-tab-${metric}`}
      className="hourly-tab-panel"
    >
      <div className="hourly-chart-heading"><div><h3>{active.title}</h3><p>{active.description}</p></div><span>北京时间 · {hours.length} 小时</span></div>
      <HourlyChart hours={hours} metric={metric} compact={compact} />
    </div>

    <div className="hourly-coverage" aria-live="polite">
      <span><i className="coverage-dot available" />气象数据 {hours.length}/{hours.length} 小时 · {weatherProvider}</span>
      <span><i className={aqiHours > 0 ? "coverage-dot available" : "coverage-dot missing"} />空气质量 {aqiHours}/{hours.length} 小时 · {airQualityProvider}</span>
    </div>

    <div className="hourly-table-heading"><div><span>完整明细</span><h3>逐小时天气数据</h3></div><small>横向滑动可查看全部指标</small></div>
    <div className="hourly-table-scroll" tabIndex={0} aria-label="逐小时天气明细，可横向滚动">
      <table className="hourly-table">
        <caption className="sr-only">逐小时温度、降雨、云量、湿度、风力、能见度、紫外线和空气质量</caption>
        <thead><tr><th scope="col">时刻</th><th scope="col">天气</th><th scope="col">气温 / 体感</th><th scope="col">降雨</th><th scope="col">云量</th><th scope="col">湿度</th><th scope="col">风 / 阵风</th><th scope="col">能见度</th><th scope="col">紫外线</th><th scope="col">空气质量</th></tr></thead>
        <tbody>{hours.map((hour) => <tr key={hour.time}>
          <th scope="row">{hour.time.slice(11, 16)}</th>
          <td><span className="weather-cell"><WeatherIcon code={hour.weatherCode} size={18} /><span>{weatherLabel(hour.weatherCode)}</span></span></td>
          <td><strong>{number(hour.temperature, 1)}°</strong><small>体感 {number(hour.apparentTemperature, 1)}°</small></td>
          <td><strong>{number(hour.precipitationProbability)}%</strong><small>{number(hour.precipitation, 1)} mm</small></td>
          <td>{number(hour.cloudCover)}%</td>
          <td>{number(hour.humidity)}%</td>
          <td><strong>{number(hour.windSpeed)} km/h</strong><small>阵风 {number(hour.windGusts)} km/h</small></td>
          <td>{number(hour.visibility, 1)} km</td>
          <td>{number(hour.uvIndex, 1)}</td>
          <td>{hour.aqi === null ? <span className="missing-value">暂无</span> : <><strong>AQI {number(hour.aqi)}</strong><small>{hour.pm25 === null ? "PM2.5 暂无" : `PM2.5 ${number(hour.pm25)}`}</small></>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
