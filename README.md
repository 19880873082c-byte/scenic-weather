# 景候 · 中国景区最佳观景天气

一个可真实查询、透明评分、支持离线缓存的响应式 PWA。用户搜索中国景区后，可查看未来 7–15 天预报、逐小时天气、空气质量、日出日落、拍摄黄金时刻、出行建议和安全提醒，并比较最多三个日期。

## 已实现

- 景区模糊搜索、自动补全、同名省市地址区分
- 任意中国境内坐标查询：支持“名称 纬度,经度”、反向经纬度顺序和浏览器当前位置，不依赖地图密钥
- SQLite / PostgreSQL 双后端景区位置库，支持标准名、别名、来源、坐标精度、可信度和位置纠错工单
- 双天气适配器：可选和风天气 1 公里坐标预报，Open‑Meteo 免密钥运行与自动故障降级
- 和风前 10 天 + Open‑Meteo 第 11–15 天的透明混合模式；逐小时温度/体感/降雨/云量/湿度/风/能见度/UV
- 和风 / Open‑Meteo 空气质量按可用时段合并；更远日期明确显示暂无，不用模拟值冒充
- 和风实时官方天气预警，按严重程度执行安全扣分；预警不可用时仍保留基于预报值的本地风险识别
- 山岳、海滨、古镇园林、草原、沙漠、湖泊瀑布、冰雪和综合景区类型识别
- 六项透明评分、类型动态权重、远期置信度、安全风险优先扣分
- 最佳日期和第二、第三备选，自然语言推荐与不推荐理由
- 穿衣、防晒、雨具、保暖、摄影与类型化安全建议
- 收藏、历史、日期对比、Web Share / 复制链接、设置
- PWA 安装、应用壳缓存、最近一次成功预报离线回退
- 服务端 SQLite 缓存、限流、超时、重试、上游异常和过期缓存回退
- `/api/health` 运行健康检查、全站安全响应头、开发环境自动清理旧 Service Worker
- 生产构建中预留 `DATABASE_URL`，便于替换 PostgreSQL/Redis 缓存
- 分享链接可恢复对应景区，浏览器前进/后退可恢复查询页面
- 过期搜索与天气请求自动取消，避免慢响应覆盖新结果
- 浏览器缓存损坏时自动过滤无效数据，清理操作无需刷新即可生效
- GitHub Actions 自动执行代码规范、类型、单元测试与生产构建

## 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

默认无需 API Key，打开 <http://localhost:3000> 即可使用。局域网手机可打开终端显示的 Network 地址。配置和风后会自动优先使用和风，任何一个上游短暂失败时由另一个真实数据源兜底。

如果免密钥地名库找不到某个偏远景点，可直接输入精确坐标，例如：

```text
梅里雪山机位 28.4365,98.7071
```

系统会把它识别为用户提供的精确位置、自动推断景区类型并查询真实预报。也可在首页点击“查询我当前位置”。

## 数据服务与授权核验

核验日期：2026-08-14。上线前仍应再次核对官方条款和控制台实际套餐。

- [Open‑Meteo Forecast API 文档](https://open-meteo.com/en/docs)：支持最多 16 天预报及本项目所用温度、降水、云量、风、能见度、UV、日出日落字段。免费开放接口主要面向非商业使用并要求注明来源；商业或有 SLA 的场景应订阅其商业计划。
- [Open‑Meteo Air Quality API 文档](https://open-meteo.com/en/docs/air-quality-api)：本应用按服务限制只请求最多 7 天 AQI/PM2.5，远期不填造数据。
- [Open‑Meteo Terms](https://open-meteo.com/en/terms)：生产和商业使用应依据最新条款选择授权方案，并保留数据来源标注。
- [高德 Web 服务地点搜索文档](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)：生产可配置高德 Web 服务 Key 获取更完整 POI；应遵守控制台配额、平台服务协议、坐标与展示规范。
- [和风天气坐标预报文档](https://dev.qweather.com/docs/api/weather/weather-daily-forecast/)：当前推荐 v1 接口为 1 公里坐标预报，每日最多 10 天、逐小时最多 240 小时；本项目没有依赖即将弃用的城市 WebAPI v7。
- [和风天气官方预警文档](https://dev.qweather.com/docs/api/warning/weather-alert/)：返回指定坐标当前生效的官方预警；应用完整保留服务返回的预警归因信息，并提示以发布机构最新消息为准。
- [和风身份认证](https://dev.qweather.com/docs/configuration/authentication/)：支持 JWT 和 API Key；JWT 为官方推荐方式。凭据只存放在服务端环境变量中。
- [和风按量计费](https://dev.qweather.com/docs/finance/pricing/)：截至核验日采用按量阶梯计费，天气和基础服务前 50,000 次/月单价为 0，超出后按最新价目计费；上线前需在控制台设置费用与配额告警。
- [和风注明来源与使用限制](https://dev.qweather.com/docs/terms/attribution/)：产品必须清晰展示和风名称和链接，空气质量、预警还需展示接口返回的归因内容；本项目在每次结果底部单独显示这些信息。
- [OpenStreetMap Nominatim 使用政策](https://operations.osmfoundation.org/policies/nominatim/)：公共端点限流且禁止客户端自动补全，因此本项目没有把公共 Nominatim 作为默认自动补全服务。

内置的首批景区位置记录通过不可变数据库迁移导入，并明确标记为“维护数据 / 中心点坐标”，用于补足通用地名库对中国景区 POI 语义的不足。它们不会伪装成官方认证入口坐标；用户可以在详情页提交位置纠错。天气和空气质量始终来自在线 API，不会把目录或模拟数据伪装成预报。

## 高德地点搜索配置

在 `.env.local` 中配置：

```dotenv
PLACE_PROVIDER=amap
AMAP_API_KEY=你的高德Web服务Key
```

`PLACE_PROVIDER=amap` 可省略：检测到 `AMAP_API_KEY` 后会自动启用高德；只有显式设置 `PLACE_PROVIDER=open-meteo` 才会强制使用免密钥地名库。不要给密钥加 `NEXT_PUBLIC_` 前缀。所有地图密钥只由服务端 Route Handler 读取，浏览器不会收到密钥。

## 和风天气配置

先在和风控制台创建项目，复制控制台为该项目分配的 API Host，再创建 JWT 或 API Key。推荐 JWT；开发阶段也可先用 API Key：

```dotenv
WEATHER_PROVIDER=auto
QWEATHER_API_HOST=abcxyz.qweatherapi.com
QWEATHER_API_KEY=你的服务端APIKey
```

如使用 JWT：

```dotenv
QWEATHER_JWT=你的服务端JWT
```

不要把凭据发到聊天、提交到 Git，也不要使用 `NEXT_PUBLIC_` 前缀。`WEATHER_PROVIDER=auto` 会在配置完整时优先和风并保留 Open‑Meteo 兜底；`open-meteo` 可强制免密钥来源。保存 `.env.local` 后必须重启开发服务器。打开 <http://localhost:3000/api/health> 可检查配置是否完整，该接口不会返回密钥内容。

## 测试与验证

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

单元测试覆盖评分、日期置信度、缓存、上游重试/异常、和风字段归一化、官方预警安全扣分、配置脱敏、景区识别、坐标解析、数据库迁移幂等性、别名检索和纠错写入；算法固定验证黄山（山岳）、鼓浪屿（海滨）、乌镇（古镇）、呼伦贝尔（草原）和长白山（冰雪）。Playwright 同时验证桌面与 Pixel 5 视口的真实搜索、任意坐标预报、健康检查、预报详情、收藏历史、对比、设置、控制台错误与横向溢出。

## 部署

### Node.js 服务器

```bash
npm ci
npm run build
npm run start
```

挂载可持久化目录并设置 `SQLITE_PATH=/data/scenic-weather.sqlite`。反向代理应转发真实客户端 IP，便于限流。

### Serverless / 多实例

项目能部署到 Vercel 等 Next.js 平台，但 SQLite 文件不适合多实例和临时文件系统。Vercel 部署必须设置 `DATABASE_URL`；缺少时 `/api/health` 会明确返回不健康状态，避免把无法持久化的实例误认为可上线。设置后，缓存与景区位置库都会自动切换到 PostgreSQL，并在首次启动时执行带校验和与并发锁的迁移。本地或挂载持久磁盘的单机环境仍可使用 SQLite。地点缓存为 24 小时，天气缓存为 30 分钟。

建议额外配置：HTTPS、受控 CORS、安全响应头、集中式限流、日志/告警、商业天气服务 SLA，以及高德/天气服务控制台配额告警。

部署后的探活地址为 `/api/health`。数据库迁移采用前向、不可变迁移并校验 checksum；升级前应备份 SQLite 文件或 PostgreSQL 数据库，回滚应用版本时保留已经应用的兼容表结构。

## 目录

- `src/lib/adapters/`：可替换地点和天气适配器
- `src/lib/db/`：景区位置库、SQLite/PostgreSQL 迁移与纠错记录
- `src/lib/scoring.ts`：透明动态评分算法
- `src/app/api/`：服务端查询、验证、限流与异常响应
- `src/components/app-shell.tsx`：完整页面状态与交互
- `public/sw.js`：PWA 应用壳缓存
- `tests/e2e/`：桌面与移动端 E2E
