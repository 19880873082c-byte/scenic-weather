export type ScenicType =
  | "mountain"
  | "coast"
  | "ancient-town"
  | "grassland"
  | "desert"
  | "lake-waterfall"
  | "snow"
  | "general";

export interface Place {
  id: string;
  name: string;
  province: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  type: ScenicType;
  source: "registry" | "catalog" | "open-meteo" | "amap" | "coordinates" | "geolocation";
  matchNote?: string;
  quality?: "verified" | "curated" | "provider" | "approximate" | "user";
  confidence?: number;
  coordinatePrecision?: "entrance" | "center" | "administrative" | "point";
  sourceReference?: string;
}

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  cloudCover: number;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  visibility: number;
}

export interface HourWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  cloudCover: number;
  humidity: number;
  windSpeed: number;
  windGusts: number;
  visibility: number;
  uvIndex: number;
  pm25: number | null;
  aqi: number | null;
}

export interface ScoreComponent {
  key: "stability" | "clarity" | "light" | "comfort" | "wind" | "golden";
  label: string;
  score: number;
  max: number;
  reason: string;
}

export interface DayWeather {
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  apparentMax: number;
  apparentMin: number;
  precipitationSum: number;
  precipitationProbability: number;
  cloudCover: number;
  humidity: number;
  windSpeed: number;
  windGusts: number;
  visibility: number;
  uvIndex: number;
  pm25: number | null;
  aqi: number | null;
  sunrise: string;
  sunset: string;
  goldenMorning: string;
  goldenEvening: string;
  daylightDuration: number;
  score: number;
  confidence: number;
  components: ScoreComponent[];
  reasons: string[];
  concerns: string[];
  advice: string[];
  warnings: string[];
  safetyAdjustment?: number;
}

export interface OfficialWeatherAlert {
  id: string;
  senderName: string;
  event: string;
  severity: "extreme" | "severe" | "moderate" | "minor" | "unknown";
  urgency: string;
  headline: string;
  description: string;
  instruction?: string;
  effectiveTime?: string;
  expireTime?: string;
  color?: string;
}

export interface ForecastResponse {
  place: Place;
  current: CurrentWeather;
  days: DayWeather[];
  hourly: HourWeather[];
  bestDates: string[];
  fetchedAt: string;
  timezone: string;
  providers: { weather: string; airQuality: string; location: string; alerts?: string };
  officialAlerts?: OfficialWeatherAlert[];
  attributions?: string[];
  providerNotice?: string;
  cached: boolean;
  stale?: boolean;
}
