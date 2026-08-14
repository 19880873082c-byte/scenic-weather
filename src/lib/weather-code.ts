export function weatherLabel(code: number): string {
  if (code === 0) return "晴朗";
  if (code <= 2) return "晴间多云";
  if (code === 3) return "阴天";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "降雨";
  if (code >= 71 && code <= 77) return "降雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code >= 95) return "雷暴";
  return "天气变化";
}

export function weatherIcon(code: number): string {
  if (code === 0) return "sun";
  if (code <= 3) return "cloud-sun";
  if (code === 45 || code === 48) return "cloud-fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "cloud-rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snowflake";
  if (code >= 95) return "cloud-lightning";
  return "cloud";
}
