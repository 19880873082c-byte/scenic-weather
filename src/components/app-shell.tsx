"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, Bell, Bookmark, BookmarkCheck, CalendarDays, Camera, Check, ChevronRight, Clock3, CloudSun, Compass, Download, Gauge, Heart, History, Home, Info, Layers3, LoaderCircle, LocateFixed, MapPin, Menu, Navigation, Search, Settings, Share2, ShieldAlert, SlidersHorizontal, Sparkles, SunMedium, Thermometer, Trash2, Umbrella, Wind, X } from "lucide-react";
import type { DayWeather, ForecastResponse, OfficialWeatherAlert, Place, ScenicType } from "@/lib/types";
import { detectWeatherChanges, rankDaysForViewing, scoreLabel } from "@/lib/scoring";
import { weatherLabel } from "@/lib/weather-code";
import { addHistory, clearStoredClientData, defaultSettings, type HistoryItem, isPlace, readFavorites, readHistory, readLatestForecast, readSettings, STORE_KEYS, storeLatest, type UserSettings, writeLocal } from "@/lib/client-store";
import { WeatherIcon } from "./weather-icon";
import { ScoreRing } from "./score-ring";
import { HourlyExplorer } from "./hourly-explorer";

type View = "home" | "results" | "detail" | "date" | "compare" | "library" | "settings";
interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  services?: { weather?: string; officialAlerts?: string; placeSearch?: string; database?: string };
  configuration?: { problems?: string[]; qweather?: { configured?: boolean; authType?: string } };
}

const popular = ["黄山", "鼓浪屿", "乌镇", "呼伦贝尔草原", "鸣沙山", "长白山"];
const typeLabels: Record<ScenicType, string> = { mountain: "山岳", coast: "海滨", "ancient-town": "古镇园林", grassland: "草原", desert: "沙漠", "lake-waterfall": "湖泊瀑布", snow: "冰雪", general: "综合景区" };

export function AppShell() {
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [compareDates, setCompareDates] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Place[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const forecastRequest = useRef<AbortController | null>(null);
  const forecastDays = useRef<UserSettings["forecastDays"]>(defaultSettings.forecastDays);

  useEffect(() => {
    forecastDays.current = settings.forecastDays;
    if (hydrated) writeLocal(STORE_KEYS.settings, settings);
  }, [hydrated, settings]);

  const loadForecast = useCallback(async (place: Place, overrideDays?: 7 | 10 | 15, syncUrl = true) => {
    searchRequest.current?.abort();
    forecastRequest.current?.abort();
    const controller = new AbortController();
    forecastRequest.current = controller;
    setLoading(true); setError(""); setSelectedDate(null); setCompareDates([]);
    try {
      const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(place).map(([key, value]) => [key, String(value)])), days: String(overrideDays ?? forecastDays.current) });
      const response = await fetch(`/api/forecast?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "天气查询失败");
      const nextForecast = data as ForecastResponse;
      setForecast(nextForecast); storeLatest(nextForecast); setHistory(addHistory(place)); setView("detail");
      if (syncUrl) updateShareAddress(place);
    } catch (cause) {
      if (isAbortError(cause)) return;
      const latest = readLatestForecast();
      if (latest?.place.id === place.id) { setForecast({ ...latest, stale: true, cached: true }); setView("detail"); setNotice("网络不可用，已显示最近一次成功结果"); }
      else setError(cause instanceof Error ? cause.message : "天气查询失败");
    } finally {
      if (forecastRequest.current === controller) { forecastRequest.current = null; setLoading(false); }
    }
  }, []);

  const searchPlaces = useCallback(async (text: string, auto = false) => {
    const value = text.trim();
    searchRequest.current?.abort();
    if (!value) { setPlaces([]); setSearching(false); return; }
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true); setError("");
    try {
      const response = await fetch(`/api/places?q=${encodeURIComponent(value)}`, { signal: controller.signal }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "地点搜索失败");
      const next = data.places as Place[]; setPlaces(next);
      if (!auto) setView("results");
    } catch (cause) {
      if (isAbortError(cause)) return;
      setError(cause instanceof Error ? cause.message : "地点搜索失败"); if (!auto) setView("results");
    } finally {
      if (searchRequest.current === controller) { searchRequest.current = null; setSearching(false); }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedSettings = readSettings();
      forecastDays.current = storedSettings.forecastDays;
      setFavorites(readFavorites());
      setHistory(readHistory());
      setSettings(storedSettings);
      setHydrated(true);
      const latest = readLatestForecast();
      const shared = readSharedPlace();
      if (shared) {
        void loadForecast(shared, storedSettings.forecastDays, false);
      } else if (!navigator.onLine && latest) {
        setForecast({ ...latest, stale: true, cached: true }); setView("detail");
      }
    }, 0);
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      else navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister()))).catch(() => undefined);
    }
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    const restoreFromAddress = () => {
      const shared = readSharedPlace();
      if (shared) void loadForecast(shared, forecastDays.current, false);
      else { forecastRequest.current?.abort(); setLoading(false); setView("home"); }
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("popstate", restoreFromAddress);
    return () => {
      window.clearTimeout(timer);
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      searchRequest.current?.abort(); forecastRequest.current?.abort();
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("popstate", restoreFromAddress);
    };
    // Initialization intentionally runs once; callbacks use the stored day preference for shared links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onQuery = (value: string) => {
    setQuery(value); setPlaces([]); if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim()) searchTimer.current = setTimeout(() => void searchPlaces(value, true), 360); else setPlaces([]);
  };

  const runSearch = (event?: React.FormEvent) => { event?.preventDefault(); if (query.trim()) void searchPlaces(query); };

  const toggleFavorite = (place: Place) => {
    const next = favorites.some((item) => item.id === place.id) ? favorites.filter((item) => item.id !== place.id) : [place, ...favorites];
    setFavorites(next); writeLocal(STORE_KEYS.favorites, next); setNotice(next.some((item) => item.id === place.id) ? "已收藏景区" : "已取消收藏");
  };

  const toggleCompare = (date: string) => {
    if (compareDates.includes(date)) setCompareDates(compareDates.filter((item) => item !== date));
    else if (compareDates.length < 3) setCompareDates([...compareDates, date]);
    else setNotice("最多比较三个日期");
  };

  const openDate = (date: string) => { setSelectedDate(date); setView("date"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const share = async () => {
    if (!forecast) return;
    const url = shareUrl(forecast.place);
    const best = forecast.days.find((day) => day.date === forecast.bestDates[0]);
    try {
      if (navigator.share) await navigator.share({ title: `${forecast.place.name}最佳观景天气`, text: best ? `${forecast.place.name}推荐日期 ${formatShortDate(best.date)}，观景指数 ${best.score}/100` : `${forecast.place.name}未来观景指数`, url });
      else { await copyShareUrl(url); setNotice("分享链接已复制"); }
    } catch (cause) {
      if (!isAbortError(cause)) setNotice("无法自动分享，请复制浏览器地址栏中的链接");
    }
  };

  const clearAppData = async () => {
    if (!window.confirm("确定清除收藏、历史、设置和离线结果吗？此操作无法撤销。")) return;
    searchRequest.current?.abort(); forecastRequest.current?.abort();
    clearStoredClientData();
    if ("caches" in window) await caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => undefined);
    setFavorites([]); setHistory([]); setSettings({ ...defaultSettings }); setForecast(null); setPlaces([]); setQuery(""); setSelectedDate(null); setCompareDates([]); setError(""); setView("home");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setNotice("收藏、历史、设置和离线结果已清理");
  };

  const selectedDay = forecast?.days.find((day) => day.date === selectedDate) ?? null;
  const title = view === "home" ? "观景天气" : view === "results" ? "选择景区" : view === "date" ? "日期详情" : view === "compare" ? "日期对比" : view === "library" ? "收藏与历史" : view === "settings" ? "设置" : forecast?.place.name ?? "观景天气";

  return (
    <div className="app-shell">
      <Header title={title} view={view} setView={setView} mobileNav={mobileNav} setMobileNav={setMobileNav} />
      {mobileNav && <MobileMenu setView={(next) => { setView(next); setMobileNav(false); }} />}
      <main>
        {error && <div className="global-message error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => setError("")} aria-label="关闭"><X size={17} /></button></div>}
        {notice && <Toast text={notice} close={() => setNotice("")} />}
        {loading && <LoadingState />}
        {!loading && view === "home" && <HomeView query={query} onQuery={onQuery} runSearch={runSearch} directSearch={(text) => { setQuery(text); void searchPlaces(text); }} places={places} searching={searching} choose={loadForecast} favorites={favorites} history={history} locate={() => locateCurrent(loadForecast, setError)} hydrated={hydrated} />}
        {!loading && view === "results" && <ResultsView query={query} places={places} searching={searching} choose={loadForecast} retry={() => runSearch()} />}
        {!loading && forecast && view === "detail" && <DetailView forecast={forecast} settings={settings} favorites={favorites} toggleFavorite={toggleFavorite} openDate={openDate} compareDates={compareDates} toggleCompare={toggleCompare} openCompare={() => setView("compare")} share={share} notify={setNotice} />}
        {!loading && forecast && selectedDay && view === "date" && <DateView forecast={forecast} day={selectedDay} settings={settings} compareDates={compareDates} toggleCompare={toggleCompare} />}
        {!loading && forecast && view === "compare" && <CompareView forecast={forecast} dates={compareDates.length ? compareDates : forecast.bestDates} toggleCompare={toggleCompare} openDate={openDate} />}
        {!loading && view === "library" && <LibraryView favorites={favorites} history={history} choose={loadForecast} removeFavorite={toggleFavorite} clearHistory={() => { setHistory([]); writeLocal(STORE_KEYS.history, []); }} />}
        {!loading && view === "settings" && <SettingsView settings={settings} setSettings={setSettings} installPrompt={installPrompt} install={() => installPrompt?.prompt()} clearCache={() => void clearAppData()} />}
        {!loading && view !== "home" && ((view === "detail" || view === "date" || view === "compare") ? !forecast : false) && <EmptyState />}
      </main>
      <BottomNav view={view} setView={setView} hasForecast={Boolean(forecast)} />
    </div>
  );
}

function Header({ title, view, setView, mobileNav, setMobileNav }: { title: string; view: View; setView: (v: View) => void; mobileNav: boolean; setMobileNav: (v: boolean) => void }) {
  return <header className="topbar"><div className="topbar-inner">
    <button className="brand" onClick={() => setView("home")} aria-label="返回首页"><span className="brand-mark"><CloudSun size={23} /></span><span>景候</span></button>
    <div className="mobile-title">{view !== "home" && <button onClick={() => setView(view === "date" || view === "compare" ? "detail" : "home")}><ArrowLeft size={20} /></button>}<strong>{title}</strong></div>
    <nav className="desktop-nav" aria-label="主导航"><button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>搜索</button><button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>收藏与历史</button><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>设置</button></nav>
    <button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="打开菜单"><Menu size={22} /></button>
  </div></header>;
}

function MobileMenu({ setView }: { setView: (v: View) => void }) { return <div className="mobile-menu"><button onClick={() => setView("home")}><Search size={18} />搜索景区</button><button onClick={() => setView("library")}><Heart size={18} />收藏与历史</button><button onClick={() => setView("settings")}><Settings size={18} />设置与说明</button></div>; }

function SearchBox({ query, onQuery, runSearch, places, searching, choose, focus = false, hydrated = true }: { query: string; onQuery: (v: string) => void; runSearch: (e?: React.FormEvent) => void; places: Place[]; searching: boolean; choose: (p: Place) => void; focus?: boolean; hydrated?: boolean }) {
  return <div className="search-wrap"><form className="search-box" onSubmit={runSearch} aria-busy={searching}><Search size={23} /><input autoFocus={focus} disabled={!hydrated} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="输入景区、地址，或纬度,经度" aria-label="景区名称或坐标" autoComplete="off" /><button type="submit" disabled={!hydrated}>查询天气</button></form>
    {query.trim() && (places.length > 0 || searching) && <div className="suggestions" aria-live="polite">{searching && <div className="suggestion-loading"><LoaderCircle className="spin" size={18} />正在查找景区…</div>}{!searching && places.slice(0, 6).map((place) => <button key={place.id} onClick={() => choose(place)}><span className="place-pin"><MapPin size={18} /></span><span><strong>{place.name}</strong><small>{place.province} · {place.city} · {place.matchNote ?? place.address}</small></span><span className={`quality-pill ${place.quality ?? "provider"}`}>{qualityLabel(place)}</span></button>)}</div>}
    {!query.trim() && <div className="search-hint">搜索不到名称时，可输入“景区名 30.1339,118.1665”直接查询坐标点</div>}
  </div>;
}

function HomeView(props: { query: string; onQuery: (v: string) => void; runSearch: (e?: React.FormEvent) => void; directSearch: (text: string) => void; places: Place[]; searching: boolean; choose: (p: Place) => void; favorites: Place[]; history: HistoryItem[]; locate: () => void; hydrated: boolean }) {
  return <><section className="hero"><div className="hero-inner"><div className="eyebrow"><Sparkles size={15} /> Scenic Weather Intelligence</div><h1>天气不只晴雨，<br /><em>更关乎眼前的风景。</em></h1><p>查询中国景区未来 7–15 天真实天气，综合光线、能见度与舒适度，透明计算观景推荐指数。</p><SearchBox {...props} /><button className="location-link" onClick={props.locate}><LocateFixed size={16} />查询我当前位置</button>
    <div className="popular"><span>热门：</span>{popular.map((item) => <button key={item} onClick={() => props.directSearch(item)}>{item}</button>)}</div></div><WeatherLandscape /></section>
    <section className="home-content"><div className="section-heading"><div><span>快速回到熟悉的风景</span><h2>收藏与最近浏览</h2></div></div><div className="quick-grid">{props.favorites.slice(0, 3).map((place) => <PlaceQuickCard key={place.id} place={place} label="已收藏" onClick={() => props.choose(place)} />)}{props.history.filter((item) => !props.favorites.some((f) => f.id === item.place.id)).slice(0, 3).map((item) => <PlaceQuickCard key={item.place.id} place={item.place} label={relativeTime(item.viewedAt)} onClick={() => props.choose(item.place)} />)}{props.favorites.length === 0 && props.history.length === 0 && <div className="empty-quick"><Compass size={28} /><div><strong>还没有足迹</strong><p>搜索一次景区，这里会保留最近浏览。</p></div></div>}</div>
    <div className="feature-strip"><div><Gauge /><strong>动态评分</strong><span>按景区类型调整权重</span></div><div><Camera /><strong>黄金时刻</strong><span>日出日落拍摄窗口</span></div><div><ShieldAlert /><strong>安全优先</strong><span>极端天气覆盖推荐</span></div></div></section></>;
}

function WeatherLandscape() { return <div className="landscape" aria-hidden="true"><div className="sun-orb" /><div className="cloud-shape one" /><div className="cloud-shape two" /><div className="mountain far" /><div className="mountain near" /><div className="landscape-card"><SunMedium size={24} /><div><span>未来天气</span><strong>挑对一天再出发</strong></div></div></div>; }

function PlaceQuickCard({ place, label, onClick }: { place: Place; label: string; onClick: () => void }) { return <button className={`quick-card type-${place.type}`} onClick={onClick}><span className="quick-icon"><MapPin /></span><span><small>{label}</small><strong>{place.name}</strong><em>{place.province} · {typeLabels[place.type]}</em></span><ChevronRight size={19} /></button>; }

function ResultsView({ query, places, searching, choose, retry }: { query: string; places: Place[]; searching: boolean; choose: (p: Place) => void; retry: () => void }) {
  return <section className="page-section narrow"><div className="page-title"><span>搜索结果</span><h1>选择你要查询的“{query}”</h1><p>已按数据质量和匹配度排序；近似位置会明确标注。</p></div>{searching ? <LoadingRows /> : places.length ? <div className="result-list">{places.map((place) => <button key={place.id} className="result-card" onClick={() => choose(place)}><span className={`result-icon type-${place.type}`}><MapPin /></span><span className="result-main"><strong>{place.name}</strong><span>{place.province} · {place.city}</span><small>{place.matchNote ?? place.address}</small></span><span className="result-meta"><em>{qualityLabel(place)}</em><small>{place.confidence ?? 50}% 位置可信度</small></span><ChevronRight /></button>)}</div> : <div className="empty-panel"><Search size={34} /><h2>没有找到匹配地点</h2><p>可去掉“风景区”等后缀、增加所在区县，或返回后输入“名称 纬度,经度”查询任意中国境内坐标。</p><button className="primary-button" onClick={retry}>重新搜索</button></div>}</section>;
}

function DetailView({ forecast, settings, favorites, toggleFavorite, openDate, compareDates, toggleCompare, openCompare, share, notify }: { forecast: ForecastResponse; settings: UserSettings; favorites: Place[]; toggleFavorite: (p: Place) => void; openDate: (d: string) => void; compareDates: string[]; toggleCompare: (d: string) => void; openCompare: () => void; share: () => void; notify: (message: string) => void }) {
  const best = forecast.days.find((day) => day.date === forecast.bestDates[0]) ?? forecast.days[0];
  const ranked = rankDaysForViewing(forecast.days);
  const changes = settings.reminders ? detectWeatherChanges(forecast.days) : [];
  return <section className="detail-page"><div className="detail-heading"><div><span className="breadcrumb">首页 / {forecast.place.province} / {forecast.place.name}</span><h1>{forecast.place.name}</h1><p><MapPin size={15} />{forecast.place.province} · {forecast.place.city} · {typeLabels[forecast.place.type]} · <span className={`inline-quality ${forecast.place.quality ?? "provider"}`}>{qualityLabel(forecast.place)} {forecast.place.confidence ?? 50}%</span></p></div><div className="heading-actions"><button aria-label={favorites.some((item) => item.id === forecast.place.id) ? "已收藏" : "收藏"} onClick={() => toggleFavorite(forecast.place)}>{favorites.some((item) => item.id === forecast.place.id) ? <BookmarkCheck /> : <Bookmark />}<span>{favorites.some((item) => item.id === forecast.place.id) ? "已收藏" : "收藏"}</span></button><button aria-label="分享" onClick={share}><Share2 /><span>分享</span></button></div></div>
    {forecast.stale && <div className="stale-banner"><AlertTriangle size={18} /><span>当前显示离线缓存，数据更新于 {formatDateTime(forecast.fetchedAt)}。联网后请重新查询。</span></div>}
    {forecast.providerNotice && <div className="provider-banner"><Info size={18} /><span>{forecast.providerNotice}</span></div>}
    {(forecast.officialAlerts ?? []).map((alert) => <OfficialAlertBanner key={alert.id} alert={alert} />)}
    {changes.length > 0 && <div className="change-banner"><Bell size={20} /><div><strong>未来天气有明显变化</strong>{changes.map((change) => <p key={change}>{change}</p>)}</div></div>}
    {best.warnings.length > 0 && <SafetyBanner warnings={best.warnings} />}
    <div className="best-card"><div className="best-intro"><span className="best-badge"><Sparkles size={15} />未来最佳观景日</span><h2>{formatFullDate(best.date)}</h2><div className="best-weather"><WeatherIcon code={best.weatherCode} size={38} /><div><strong>{weatherLabel(best.weatherCode)}</strong><span>{Math.round(best.temperatureMin)}–{Math.round(best.temperatureMax)}°C · 降雨概率 {Math.round(best.precipitationProbability)}%</span></div></div><div className="confidence"><span>预报置信度</span><div><i style={{ width: `${best.confidence}%` }} /></div><strong>{best.confidence}%</strong></div></div><div className="best-score"><ScoreRing score={best.score} /><strong>{scoreLabel(best.score)}</strong><span>天气越远，置信度越低</span></div><div className="best-reasons"><h3>为什么推荐这一天</h3>{best.reasons.map((reason) => <p key={reason}><Check size={16} />{reason}</p>)}{best.concerns.map((reason) => <p className="concern" key={reason}><Info size={16} />{reason}</p>)}<button onClick={() => openDate(best.date)}>查看逐小时与评分明细 <ChevronRight size={16} /></button></div></div>
    <div className="overview-grid"><MetricCard icon={<Thermometer />} label="当前 / 体感" value={`${Math.round(forecast.current.temperature)}° / ${Math.round(forecast.current.apparentTemperature)}°`} note={weatherLabel(forecast.current.weatherCode)} /><MetricCard icon={<Navigation />} label="能见度" value={`${forecast.current.visibility.toFixed(1)} km`} note={forecast.current.visibility >= 15 ? "远眺条件良好" : "视野可能受限"} /><MetricCard icon={<Wind />} label="当前风速" value={`${Math.round(forecast.current.windSpeed)} km/h`} note={`阵风 ${Math.round(forecast.current.windGusts)} km/h`} /><MetricCard icon={<Clock3 />} label="数据更新时间" value={formatTime(forecast.fetchedAt)} note={forecast.cached ? "服务端缓存结果" : "实时获取"} /></div>
    <div className="section-row"><div><span>未来日期排行</span><h2>哪几天最值得出发</h2></div><button className="secondary-button" onClick={openCompare}><BarChart3 size={17} />对比已选 {compareDates.length || "日期"}</button></div>
    <div className="day-ranking">{ranked.map((day, index) => <article key={day.date} className={day.date === best.date ? "day-card best" : "day-card"}><button className="day-main" onClick={() => openDate(day.date)}><span className="rank">{index < 3 ? `TOP ${index + 1}` : `${index + 1}`}</span><span className="day-date"><strong>{formatShortDate(day.date)}</strong><small>{weekday(day.date)}</small></span><WeatherIcon code={day.weatherCode} size={27} /><span className="day-weather"><strong>{weatherLabel(day.weatherCode)}</strong><small>{Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)}°C</small></span><span className="day-metrics"><small>降雨 {Math.round(day.precipitationProbability)}%</small><small>能见度 {day.visibility.toFixed(0)}km</small></span><ScoreRing score={day.score} size="small" /><ChevronRight size={18} /></button><label className="compare-check"><input type="checkbox" checked={compareDates.includes(day.date)} onChange={() => toggleCompare(day.date)} /><span>加入对比</span></label></article>)}</div>
    <div className="data-note"><Info size={16} /><span>观景指数是基于数值预报的辅助建议，不是绝对准确的景观预测。数据：{forecast.providers.weather}、{forecast.providers.airQuality}{forecast.providers.alerts ? `、${forecast.providers.alerts}` : ""}；地点：{forecast.providers.location}。</span><button onClick={() => void submitCorrection(forecast.place, notify)}>位置有误？提交纠错</button></div><AttributionLinks items={forecast.attributions} /></section>;
}

function DateView({ forecast, day, settings, compareDates, toggleCompare }: { forecast: ForecastResponse; day: DayWeather; settings: UserSettings; compareDates: string[]; toggleCompare: (date: string) => void }) {
  const hours = forecast.hourly.filter((hour) => hour.time.startsWith(day.date));
  const officialAlerts = alertsForDate(forecast.officialAlerts ?? [], day.date);
  return <section className="detail-page"><div className="date-hero"><div><span>{forecast.place.name} · {weekday(day.date)}</span><h1>{formatFullDate(day.date)}</h1><div className="date-weather-line"><WeatherIcon code={day.weatherCode} size={30} /><strong>{weatherLabel(day.weatherCode)}</strong><span>{Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)}°C</span></div></div><ScoreRing score={day.score} /><button className="secondary-button" onClick={() => toggleCompare(day.date)}>{compareDates.includes(day.date) ? <Check size={17} /> : <Layers3 size={17} />}{compareDates.includes(day.date) ? "已加入对比" : "加入日期对比"}</button></div>
    {officialAlerts.map((alert) => <OfficialAlertBanner key={alert.id} alert={alert} />)}
    {day.warnings.length > 0 && <SafetyBanner warnings={day.warnings} />}
    <div className="content-grid"><div className="main-column"><section className="panel hourly-panel"><div className="panel-heading"><div><span>逐小时数据中心</span><h2>天气变化一项不落</h2></div><small>图表 + 明细</small></div><div className="hour-stat-grid"><span><i>平均湿度</i><strong>{Math.round(day.humidity)}%</strong></span><span><i>平均云量</i><strong>{Math.round(day.cloudCover)}%</strong></span><span><i>最大风速</i><strong>{Math.round(day.windSpeed)} km/h</strong></span><span><i>能见度</i><strong>{day.visibility.toFixed(1)} km</strong></span><span><i>紫外线</i><strong>{day.uvIndex.toFixed(1)}</strong></span><span><i>空气质量</i><strong>{day.aqi === null ? "远期暂缺" : `AQI ${Math.round(day.aqi)}`}</strong></span></div><HourlyExplorer hours={hours} compact={settings.compactCharts} weatherProvider={forecast.providers.weather} airQualityProvider={forecast.providers.airQuality} /></section>
    <section className="panel"><div className="panel-heading"><div><span>透明评分</span><h2>每一分从哪里来</h2></div><strong className="total-score">{day.score}/100</strong></div><div className="score-breakdown">{day.components.map((item) => <div key={item.key}><div className="score-label"><span>{item.label}<small>{item.reason}</small></span><strong>{item.score}<em>/ {item.max}</em></strong></div><div className="score-bar"><i style={{ width: `${(item.score / item.max) * 100}%` }} /></div></div>)}</div>{day.safetyAdjustment && <div className="safety-adjustment"><ShieldAlert size={17} /><span>官方预警安全调整 <strong>{day.safetyAdjustment} 分</strong>，安全风险优先于景观条件。</span></div>}<div className="confidence-note"><Gauge size={18} /><span>该日预报置信度 <strong>{day.confidence}%</strong>。时间越远，模型误差与天气突变可能性越高。</span></div></section></div>
    <aside className="side-column"><section className="panel golden-panel"><div className="panel-heading"><div><span>拍摄窗口</span><h2>黄金时刻</h2></div><Camera size={22} /></div><div className="golden-row"><span className="golden-icon morning"><SunMedium /></span><span><small>清晨</small><strong>{day.goldenMorning}</strong><em>日出 {day.sunrise.slice(11, 16)}</em></span></div><div className="golden-row"><span className="golden-icon evening"><SunMedium /></span><span><small>傍晚</small><strong>{day.goldenEvening}</strong><em>日落 {day.sunset.slice(11, 16)}</em></span></div><p>黄金时段按日出日落前后约一小时估算，实际光线会受地形、建筑和云层遮挡影响。</p></section>
    <section className="panel advice-panel"><div className="panel-heading"><div><span>出行准备</span><h2>今日建议</h2></div><Umbrella size={22} /></div>{day.advice.map((item) => <p key={item}><Check size={16} />{item}</p>)}</section>
    {day.concerns.length > 0 && <section className="panel concerns"><h3>需要留意</h3>{day.concerns.map((item) => <p key={item}><Info size={16} />{item}</p>)}</section>}</aside></div></section>;
}

function CompareView({ forecast, dates, toggleCompare, openDate }: { forecast: ForecastResponse; dates: string[]; toggleCompare: (d: string) => void; openDate: (d: string) => void }) {
  const days = dates.slice(0, 3).map((date) => forecast.days.find((day) => day.date === date)).filter(Boolean) as DayWeather[];
  return <section className="page-section"><div className="page-title"><span>{forecast.place.name}</span><h1>最多比较三个日期</h1><p>横向查看天气、评分和拍摄条件，选择更适合你的那一天。</p></div><div className="compare-grid">{days.map((day, index) => <article key={day.date} className="compare-card"><div className="compare-top"><span>{index === 0 ? "首选" : `方案 ${index + 1}`}</span><button onClick={() => toggleCompare(day.date)} aria-label="移出对比"><X size={17} /></button></div><h2>{formatShortDate(day.date)} <small>{weekday(day.date)}</small></h2><div className="compare-score"><ScoreRing score={day.score} /><div><WeatherIcon code={day.weatherCode} size={30} /><strong>{weatherLabel(day.weatherCode)}</strong><span>{Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)}°C</span></div></div><dl><div><dt>降雨概率</dt><dd>{Math.round(day.precipitationProbability)}%</dd></div><div><dt>平均云量</dt><dd>{Math.round(day.cloudCover)}%</dd></div><div><dt>能见度</dt><dd>{day.visibility.toFixed(1)} km</dd></div><div><dt>最大风速</dt><dd>{Math.round(day.windSpeed)} km/h</dd></div><div><dt>空气质量</dt><dd>{day.aqi === null ? "暂无" : Math.round(day.aqi)}</dd></div><div><dt>置信度</dt><dd>{day.confidence}%</dd></div></dl><div className="compare-bars">{day.components.map((item) => <div key={item.key}><span>{item.label}</span><i><em style={{ width: `${(item.score / item.max) * 100}%` }} /></i></div>)}</div><button className="primary-button full" onClick={() => openDate(day.date)}>查看详情</button></article>)}{days.length < 3 && <div className="compare-empty"><Layers3 size={30} /><strong>还可以添加 {3 - days.length} 天</strong><p>返回景区详情，在日期排行中勾选“加入对比”。</p></div>}</div></section>;
}

function LibraryView({ favorites, history, choose, removeFavorite, clearHistory }: { favorites: Place[]; history: HistoryItem[]; choose: (p: Place) => void; removeFavorite: (p: Place) => void; clearHistory: () => void }) {
  return <section className="page-section"><div className="page-title"><span>个人足迹</span><h1>收藏与历史</h1><p>数据只保存在当前浏览器中，不需要登录。</p></div><div className="library-section"><div className="section-row"><div><span>常看景区</span><h2>我的收藏</h2></div><small>{favorites.length} 个</small></div>{favorites.length ? <div className="library-grid">{favorites.map((place) => <div key={place.id} className="library-card"><button onClick={() => choose(place)}><span className={`result-icon type-${place.type}`}><Heart /></span><span><strong>{place.name}</strong><small>{place.province} · {place.city}</small><em>{typeLabels[place.type]}</em></span></button><button className="remove" onClick={() => removeFavorite(place)} aria-label="取消收藏"><Trash2 size={16} /></button></div>)}</div> : <div className="empty-panel small"><Heart size={30} /><h2>暂未收藏景区</h2><p>在景区详情页点击收藏，之后可以快速查询。</p></div>}</div>
    <div className="library-section"><div className="section-row"><div><span>最近查询</span><h2>浏览历史</h2></div>{history.length > 0 && <button className="text-button" onClick={clearHistory}><Trash2 size={15} />清空</button>}</div>{history.length ? <div className="history-list">{history.map((item) => <button key={`${item.place.id}:${item.viewedAt}`} onClick={() => choose(item.place)}><History size={18} /><span><strong>{item.place.name}</strong><small>{item.place.province} · {relativeTime(item.viewedAt)}</small></span><ChevronRight size={17} /></button>)}</div> : <div className="empty-panel small"><History size={30} /><h2>还没有查询记录</h2></div>}</div></section>;
}

function SettingsView({ settings, setSettings, installPrompt, install, clearCache }: { settings: UserSettings; setSettings: (s: UserSettings) => void; installPrompt: BeforeInstallPromptEvent | null; install: () => void; clearCache: () => void }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setHealth(data as HealthStatus); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return <section className="page-section narrow"><div className="page-title"><span>偏好与透明度</span><h1>设置</h1><p>配置预报范围、离线缓存和数据说明。</p></div><div className="settings-list"><section className="settings-card"><div className="settings-title"><CalendarDays /><div><h2>预报天数</h2><p>范围越远，置信度越低。</p></div></div><div className="segment-control">{([7, 10, 15] as const).map((days) => <button key={days} className={settings.forecastDays === days ? "active" : ""} onClick={() => setSettings({ ...settings, forecastDays: days })}>{days} 天</button>)}</div></section>
    <section className="settings-card"><div className="settings-title"><Bell /><div><h2>突变提醒</h2><p>在结果页优先显示极端天气与风险变化。</p></div></div><label className="switch"><input type="checkbox" checked={settings.reminders} onChange={(e) => setSettings({ ...settings, reminders: e.target.checked })} /><span /></label></section>
    <section className="settings-card"><div className="settings-title"><SlidersHorizontal /><div><h2>紧凑图表</h2><p>减少手机上的逐小时数据点。</p></div></div><label className="switch"><input type="checkbox" checked={settings.compactCharts} onChange={(e) => setSettings({ ...settings, compactCharts: e.target.checked })} /><span /></label></section>
    <section className="settings-card column"><div className="settings-title"><CloudSun /><div><h2>数据来源与运行状态</h2><p>服务端自动选择已配置的专业来源，并保留真实数据兜底。</p></div></div><dl className="source-list"><div><dt>天气预报</dt><dd>{health?.services?.weather ?? "正在检测…"}</dd></div><div><dt>官方预警</dt><dd>{health?.services?.officialAlerts ?? "正在检测…"}</dd></div><div><dt>地点搜索</dt><dd>{health?.services?.placeSearch ?? "景区维护库 + 坐标兜底"}</dd></div><div><dt>本地数据</dt><dd>{health?.services?.database ?? "正在检测…"}</dd></div></dl>{health?.configuration?.problems?.length ? <div className="provider-problems"><AlertTriangle size={17} /><div><strong>配置需要处理</strong>{health.configuration.problems.map((problem) => <p key={problem}>{problem}</p>)}</div></div> : health && <div className="provider-ok"><Check size={16} />配置格式检查通过，凭据会在查询时验证</div>}</section>
    <section className="settings-card column"><div className="settings-title"><Gauge /><div><h2>评分说明</h2><p>六项总分 100，按景区类型重新归一化权重。</p></div></div><div className="weight-list"><span>降雨与稳定度 <strong>25</strong></span><span>能见度与空气 <strong>20</strong></span><span>云量与光线 <strong>15</strong></span><span>温度与体感 <strong>15</strong></span><span>风力 <strong>10</strong></span><span>黄金拍摄条件 <strong>15</strong></span></div><p className="setting-note">山岳、海滨、古镇、草原、沙漠、冰雪和湖泊瀑布各有动态权重。极端天气会施加安全扣分，并优先显示警告。</p></section>
    <section className="settings-card"><div className="settings-title"><Download /><div><h2>安装到桌面</h2><p>PWA 可离线打开最近一次成功查询。</p></div></div><button className="secondary-button" disabled={!installPrompt} onClick={install}>{installPrompt ? "安装应用" : "浏览器菜单中安装"}</button></section>
    <section className="settings-card"><div className="settings-title"><Trash2 /><div><h2>清理本地数据</h2><p>删除收藏、历史、设置和离线结果。</p></div></div><button className="danger-button" onClick={clearCache}>清理</button></section>
    <div className="privacy-note"><ShieldAlert size={20} /><div><strong>隐私与密钥</strong><p>收藏和历史仅保存在浏览器；位置权限只用于当前查询。高德与和风凭据只从服务端环境变量读取，绝不下发到浏览器。</p></div></div></div></section>;
}

function BottomNav({ view, setView, hasForecast }: { view: View; setView: (v: View) => void; hasForecast: boolean }) { return <nav className="bottom-nav"><button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home />首页</button><button className={view === "detail" || view === "date" || view === "compare" ? "active" : ""} disabled={!hasForecast} onClick={() => setView("detail")}><CloudSun />预报</button><button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><Heart />收藏</button><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings />设置</button></nav>; }
function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) { return <div className="metric-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></div>; }
function SafetyBanner({ warnings }: { warnings: string[] }) { return <div className="safety-banner"><ShieldAlert size={25} /><div><strong>安全提醒优先</strong>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>; }
function OfficialAlertBanner({ alert }: { alert: OfficialWeatherAlert }) { return <article className={`official-alert severity-${alert.severity}`}><ShieldAlert size={26} /><div><div className="official-alert-meta"><strong>官方{severityLabel(alert.severity)}预警 · {alert.event}</strong><span>{alert.senderName}</span></div><h3>{alert.headline}</h3><p>{alert.description}</p>{alert.instruction && <p className="official-instruction">建议：{alert.instruction}</p>}<small>{alert.effectiveTime ? `生效 ${formatDateTime(alert.effectiveTime)}` : "当前生效"}{alert.expireTime ? ` · 预计解除 ${formatDateTime(alert.expireTime)}` : ""}，请以发布机构最新信息为准。</small></div></article>; }
function AttributionLinks({ items }: { items?: string[] }) { if (!items?.length) return null; return <div className="attribution-links"><strong>数据归因</strong>{items.map((item) => item.startsWith("http") ? <a key={item} href={item} target="_blank" rel="noreferrer">{attributionLabel(item)}</a> : <small key={item}>{item}</small>)}</div>; }
function attributionLabel(url: string): string { if (url === "https://www.qweather.com") return "天气服务由和风天气驱动"; if (url.includes("open-meteo.com")) return "Open‑Meteo 数据来源"; return url; }
function alertsForDate(alerts: OfficialWeatherAlert[], date: string): OfficialWeatherAlert[] { return alerts.filter((alert) => { const start = alert.effectiveTime ? chinaDate(alert.effectiveTime) : null; const end = alert.expireTime ? chinaDate(alert.expireTime) : null; return (!start || date >= start) && (!end || date <= end); }); }
function chinaDate(value: string): string { const date = new Date(value); if (!Number.isFinite(date.getTime())) return value.slice(0, 10); const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" }).formatToParts(date); const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00"; return `${part("year")}-${part("month")}-${part("day")}`; }
function severityLabel(severity: OfficialWeatherAlert["severity"]): string { return severity === "extreme" ? "极端" : severity === "severe" ? "严重" : severity === "moderate" ? "中度" : severity === "minor" ? "一般" : "天气"; }
function LoadingState() { return <div className="loading-state"><LoaderCircle className="spin" size={34} /><h2>正在连接天气服务</h2><p>获取真实预报并计算观景指数…</p></div>; }
function LoadingRows() { return <div className="loading-rows">{[1, 2, 3].map((i) => <div key={i}><i /><span><b /><b /></span></div>)}</div>; }
function EmptyState() { return <div className="empty-panel"><Compass size={34} /><h2>先搜索一个景区</h2></div>; }
function Toast({ text, close }: { text: string; close: () => void }) { useEffect(() => { const id = setTimeout(close, 3200); return () => clearTimeout(id); }, [close]); return <div className="toast" role="status" aria-live="polite"><Check size={17} />{text}</div>; }

function locateCurrent(loadForecast: (place: Place) => Promise<void>, setError: (v: string) => void) {
  if (!navigator.geolocation) { setError("当前浏览器不支持定位"); return; }
  navigator.geolocation.getCurrentPosition(async (position) => {
    const { latitude, longitude } = position.coords;
    await loadForecast({ id: `geolocation:${longitude.toFixed(5)},${latitude.toFixed(5)}`, name: "我的位置", province: "设备定位", city: "当前位置", address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude, type: "general", source: "geolocation", quality: "user", confidence: Math.max(70, Math.round(100 - Math.min(position.coords.accuracy, 300) / 10)), coordinatePrecision: "point", sourceReference: `browser-geolocation:${Math.round(position.coords.accuracy)}m` });
  }, () => setError("无法获取位置，请检查浏览器定位权限"), { timeout: 8000, maximumAge: 600_000 });
}

function shareUrl(place: Place): string {
  const url = new URL(window.location.href);
  url.hash = `place=${btoa(encodeURIComponent(JSON.stringify(place)))}`;
  return url.toString();
}

function updateShareAddress(place: Place): void {
  const url = shareUrl(place);
  if (window.location.href !== url) window.history.pushState({ scenicPlaceId: place.id }, "", url);
}

function readSharedPlace(): Place | null {
  if (!window.location.hash.startsWith("#place=")) return null;
  try {
    const decoded = JSON.parse(decodeURIComponent(atob(window.location.hash.slice(7)))) as unknown;
    return isPlace(decoded) ? decoded : null;
  } catch { return null; }
}

async function copyShareUrl(url: string): Promise<void> {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return; }
  const input = document.createElement("textarea");
  input.value = url; input.style.position = "fixed"; input.style.opacity = "0";
  document.body.appendChild(input); input.select();
  const copied = document.execCommand("copy"); input.remove();
  if (!copied) throw new Error("clipboard unavailable");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
function formatShortDate(date: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(`${date}T12:00:00+08:00`)); }
function formatFullDate(date: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date(`${date}T12:00:00+08:00`)); }
function weekday(date: string) { return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(`${date}T12:00:00+08:00`)); }
function formatTime(date: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(new Date(date)); }
function formatDateTime(date: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(new Date(date)); }
function relativeTime(date: string) { const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60_000); if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`; const hours = Math.round(minutes / 60); return hours < 24 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`; }

function qualityLabel(place: Place): string {
  const quality = place.quality ?? (place.source === "registry" || place.source === "catalog" ? "curated" : place.matchNote ? "approximate" : "provider");
  return { user: "精确坐标", verified: "已核验", curated: "人工整理", provider: "供应商位置", approximate: "行政区近似" }[quality];
}

async function submitCorrection(place: Place, notify: (message: string) => void) {
  const reason = window.prompt("请简要说明位置哪里不准确（至少4个字）。不会立即修改，审核后生效：");
  if (!reason) return;
  try {
    const response = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenicPlaceId: place.id.startsWith("registry:") ? place.id.slice(9) : undefined, submittedName: place.name, reason, proposed: {} }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    notify("纠错已提交，审核后才会更新正式数据");
  } catch (error) { notify(error instanceof Error ? error.message : "纠错提交失败"); }
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
