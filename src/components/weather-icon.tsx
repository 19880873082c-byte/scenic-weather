import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from "lucide-react";
import { weatherIcon } from "@/lib/weather-code";

export function WeatherIcon({ code, size = 24, className = "" }: { code: number; size?: number; className?: string }) {
  const props = { size, strokeWidth: 1.8, className, "aria-hidden": true };
  switch (weatherIcon(code)) {
    case "sun": return <Sun {...props} />;
    case "cloud-sun": return <CloudSun {...props} />;
    case "cloud-fog": return <CloudFog {...props} />;
    case "cloud-rain": return <CloudRain {...props} />;
    case "snowflake": return <Snowflake {...props} />;
    case "cloud-lightning": return <CloudLightning {...props} />;
    default: return <Cloud {...props} />;
  }
}
