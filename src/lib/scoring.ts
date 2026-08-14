import type { DayWeather, ScenicType, ScoreComponent } from "./types";
import { clamp, dateDistance, round } from "./utils";
import { weatherLabel } from "./weather-code";

export const BASE_WEIGHTS = {
  stability: 25,
  clarity: 20,
  light: 15,
  comfort: 15,
  wind: 10,
  golden: 15,
} as const;

type ScoreKey = keyof typeof BASE_WEIGHTS;
type ScoreInput = Omit<DayWeather, "score" | "confidence" | "components" | "reasons" | "concerns" | "advice" | "warnings">;

const typeWeightFactors: Record<ScenicType, Record<ScoreKey, number>> = {
  mountain: { stability: 1.18, clarity: 1.30, light: 0.92, comfort: 0.82, wind: 1.28, golden: 0.92 },
  coast: { stability: 1.03, clarity: 0.90, light: 1.22, comfort: 1.13, wind: 1.24, golden: 0.96 },
  "ancient-town": { stability: 1.16, clarity: 0.85, light: 1.18, comfort: 1.25, wind: 0.72, golden: 0.95 },
  grassland: { stability: 0.92, clarity: 1.05, light: 1.00, comfort: 1.02, wind: 1.45, golden: 1.10 },
  desert: { stability: 0.92, clarity: 1.04, light: 0.98, comfort: 1.18, wind: 1.46, golden: 1.12 },
  "lake-waterfall": { stability: 1.08, clarity: 1.13, light: 1.13, comfort: 0.88, wind: 0.72, golden: 1.06 },
  snow: { stability: 1.22, clarity: 0.92, light: 0.92, comfort: 1.30, wind: 1.25, golden: 0.73 },
  general: { stability: 1, clarity: 1, light: 1, comfort: 1, wind: 1, golden: 1 },
};

const labels: Record<ScoreKey, string> = {
  stability: "降雨与稳定度",
  clarity: "能见度与空气",
  light: "云量与自然光",
  comfort: "温度与体感",
  wind: "风力条件",
  golden: "黄金拍摄条件",
};

export function getWeights(type: ScenicType): Record<ScoreKey, number> {
  const raw = Object.fromEntries(
    (Object.keys(BASE_WEIGHTS) as ScoreKey[]).map((key) => [key, BASE_WEIGHTS[key] * typeWeightFactors[type][key]]),
  ) as Record<ScoreKey, number>;
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, (value / total) * 100])) as Record<ScoreKey, number>;
}

function calculateRatios(day: ScoreInput, type: ScenicType): Record<ScoreKey, { ratio: number; reason: string }> {
  const aqi = day.aqi ?? Math.min(150, (day.pm25 ?? 25) * 2.2);
  const stability = clamp(1 - day.precipitationProbability / 130 - day.precipitationSum / 35, 0, 1);
  const visibilityTarget = type === "mountain" ? 25 : 18;
  const clarity = clamp((day.visibility / visibilityTarget) * 0.72 + (1 - aqi / 180) * 0.28, 0, 1);
  const idealCloud = type === "ancient-town" ? 55 : type === "lake-waterfall" ? 42 : 30;
  const light = clamp(1 - Math.abs(day.cloudCover - idealCloud) / 85, 0, 1);
  const meanTemp = (day.apparentMax + day.apparentMin) / 2;
  let comfort = clamp(1 - Math.abs(meanTemp - 21) / 22, 0, 1);
  if (type === "snow") comfort = clamp(1 - Math.abs(meanTemp + 4) / 24, 0, 1);
  if ((type === "grassland" || type === "desert") && day.temperatureMax - day.temperatureMin > 16) comfort *= 0.76;
  const windLimit = type === "coast" ? 25 : type === "mountain" || type === "desert" || type === "grassland" ? 20 : 28;
  const wind = clamp(1 - Math.max(0, day.windSpeed - 5) / windLimit - Math.max(0, day.windGusts - 35) / 65, 0, 1);
  const golden = clamp((1 - Math.abs(day.cloudCover - 28) / 78) * 0.62 + stability * 0.38, 0, 1);

  return {
    stability: { ratio: stability, reason: `降水概率 ${round(day.precipitationProbability)}%，预计 ${round(day.precipitationSum, 1)} mm` },
    clarity: { ratio: clarity, reason: `平均能见度 ${round(day.visibility, 1)} km${day.aqi !== null ? `，AQI 约 ${round(day.aqi)}` : "，空气质量远期数据暂缺"}` },
    light: { ratio: light, reason: `平均云量 ${round(day.cloudCover)}%，${day.cloudCover < 15 ? "光线偏硬" : day.cloudCover <= 60 ? "有层次感" : "遮光较明显"}` },
    comfort: { ratio: comfort, reason: `体感 ${round(day.apparentMin)}–${round(day.apparentMax)}°C，温差 ${round(day.temperatureMax - day.temperatureMin)}°C` },
    wind: { ratio: wind, reason: `最大持续风 ${round(day.windSpeed)} km/h，阵风 ${round(day.windGusts)} km/h` },
    golden: { ratio: golden, reason: `日出 ${day.sunrise.slice(11, 16)}、日落 ${day.sunset.slice(11, 16)}，结合云雨评估` },
  };
}

function buildWarnings(day: ScoreInput, type: ScenicType): string[] {
  const warnings: string[] = [];
  if (day.weatherCode >= 95) warnings.push("可能出现雷暴，请避开开阔地、山脊和水边");
  if (day.windGusts >= 62) warnings.push("阵风较强，高处、海边和索道行程需特别谨慎");
  if (day.precipitationSum >= 30) warnings.push("降雨量较大，警惕积水、山洪和地质灾害风险");
  if (day.temperatureMax >= 35) warnings.push("可能出现高温，避免正午长时间户外活动");
  if (day.apparentMin <= -15) warnings.push("存在严寒和冻伤风险，注意道路结冰");
  if (day.visibility < 1.5) warnings.push("能见度很低，不适合登高远眺或长距离驾驶");
  if ((type === "desert" || type === "grassland") && day.windSpeed >= 28) warnings.push("风力可能扬沙，注意护目与呼吸防护");
  return warnings;
}

function buildAdvice(day: ScoreInput, type: ScenicType): string[] {
  const advice: string[] = [];
  if (day.precipitationProbability >= 35) advice.push("随身带折叠伞或轻量雨衣");
  if (day.uvIndex >= 6) advice.push("使用 SPF30+ 防晒，并佩戴帽子和太阳镜");
  if (day.temperatureMin < 10 || day.temperatureMax - day.temperatureMin >= 12) advice.push("采用分层穿衣，早晚加一件防风保暖层");
  else if (day.temperatureMax >= 30) advice.push("穿透气速干衣，补水并避开午后高温");
  else advice.push("轻便衣物即可，久留户外可备薄外套");
  if (type === "mountain") advice.push("携带防滑鞋和镜头防潮袋，出发前复核景区索道公告");
  if (type === "coast") advice.push("留意潮汐、离岸流与临时封滩通知");
  if (type === "snow") advice.push("准备冰爪、防水手套和备用电池，驾驶前查道路结冰信息");
  if (type === "desert" || type === "grassland") advice.push("保护相机进沙，备足饮水并防范大风");
  advice.push(`拍摄优先安排在 ${day.goldenMorning} 或 ${day.goldenEvening} 附近`);
  return advice;
}

export function scoreDay(day: ScoreInput, type: ScenicType, baseDate = new Date()): Pick<DayWeather, "score" | "confidence" | "components" | "reasons" | "concerns" | "advice" | "warnings"> {
  const weights = getWeights(type);
  const ratios = calculateRatios(day, type);
  const components: ScoreComponent[] = (Object.keys(weights) as ScoreKey[]).map((key) => ({
    key,
    label: labels[key],
    max: round(weights[key], 1),
    score: round(weights[key] * ratios[key].ratio, 1),
    reason: ratios[key].reason,
  }));
  const rawScore = components.reduce((sum, component) => sum + component.score, 0);
  const warnings = buildWarnings(day, type);
  const safetyPenalty = Math.min(35, warnings.length * 12);
  const score = round(clamp(rawScore - safetyPenalty, 0, 100));
  const distance = dateDistance(day.date, baseDate);
  const confidence = round(clamp(96 - distance * 3.2 - (day.aqi === null ? 4 : 0), 48, 96));
  const strengths = [...components].sort((a, b) => b.score / b.max - a.score / a.max).slice(0, 2);
  const weaknesses = [...components].sort((a, b) => a.score / a.max - b.score / b.max).slice(0, 2);
  const reasons = strengths.map((item) => `${item.label}表现较好：${item.reason}`);
  const concerns = weaknesses.filter((item) => item.score / item.max < 0.75).map((item) => `${item.label}有折损：${item.reason}`);
  if (warnings.length) concerns.unshift("安全风险优先于景观得分，请先确认景区公告");
  return { score, confidence, components, reasons, concerns, advice: buildAdvice(day, type), warnings };
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "非常推荐";
  if (score >= 75) return "值得出发";
  if (score >= 65) return "可以游玩";
  if (score >= 50) return "条件一般";
  return "不太推荐";
}

export function summarizeDay(day: DayWeather): string {
  return `${weatherLabel(day.weatherCode)}，${round(day.temperatureMin)}–${round(day.temperatureMax)}°C，观景指数 ${day.score}`;
}

export function detectWeatherChanges(days: DayWeather[]): string[] {
  const alerts: string[] = [];
  for (let index = 1; index < days.length; index += 1) {
    const previous = days[index - 1]; const current = days[index];
    const label = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(`${current.date}T12:00:00+08:00`));
    if (current.precipitationProbability - previous.precipitationProbability >= 45) alerts.push(`${label} 降雨概率较前一天上升 ${round(current.precipitationProbability - previous.precipitationProbability)} 个百分点`);
    if (Math.abs(current.temperatureMax - previous.temperatureMax) >= 8) alerts.push(`${label} 最高温较前一天${current.temperatureMax > previous.temperatureMax ? "升高" : "下降"} ${round(Math.abs(current.temperatureMax - previous.temperatureMax))}°C`);
    if (current.windGusts - previous.windGusts >= 25) alerts.push(`${label} 阵风明显增强至 ${round(current.windGusts)} km/h`);
    if (previous.score - current.score >= 20) alerts.push(`${label} 观景指数较前一天下降 ${previous.score - current.score} 分`);
  }
  return [...new Set(alerts)].slice(0, 4);
}
