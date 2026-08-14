import type { Place, ScenicType } from "./types";

export type CatalogItem = Omit<Place, "id" | "source" | "quality" | "confidence" | "coordinatePrecision" | "sourceReference"> & { aliases?: string[] };

export const scenicCatalog: CatalogItem[] = [
  { name: "黄山风景区", aliases: ["黄山"], province: "安徽省", city: "黄山市", address: "黄山区汤口镇", latitude: 30.1339, longitude: 118.1665, elevation: 1660, type: "mountain" },
  { name: "泰山风景名胜区", aliases: ["泰山"], province: "山东省", city: "泰安市", address: "泰山区红门路", latitude: 36.255, longitude: 117.100, elevation: 1532, type: "mountain" },
  { name: "华山风景名胜区", aliases: ["华山"], province: "陕西省", city: "渭南市", address: "华阴市集灵路", latitude: 34.482, longitude: 110.084, elevation: 1850, type: "mountain" },
  { name: "峨眉山风景区", aliases: ["峨眉山"], province: "四川省", city: "乐山市", address: "峨眉山市黄湾镇", latitude: 29.525, longitude: 103.333, elevation: 2700, type: "mountain" },
  { name: "张家界国家森林公园", aliases: ["张家界"], province: "湖南省", city: "张家界市", address: "武陵源区金鞭路", latitude: 29.321, longitude: 110.434, elevation: 1000, type: "mountain" },
  { name: "鼓浪屿", province: "福建省", city: "厦门市", address: "思明区鼓浪屿街道", latitude: 24.449, longitude: 118.067, elevation: 30, type: "coast" },
  { name: "亚龙湾国家旅游度假区", aliases: ["亚龙湾"], province: "海南省", city: "三亚市", address: "吉阳区亚龙湾路", latitude: 18.229, longitude: 109.633, elevation: 8, type: "coast" },
  { name: "北戴河风景名胜区", aliases: ["北戴河"], province: "河北省", city: "秦皇岛市", address: "北戴河区东经路", latitude: 39.834, longitude: 119.492, elevation: 10, type: "coast" },
  { name: "平潭岛", aliases: ["平潭"], province: "福建省", city: "福州市", address: "平潭综合实验区", latitude: 25.503, longitude: 119.789, elevation: 15, type: "coast" },
  { name: "乌镇风景区", aliases: ["乌镇"], province: "浙江省", city: "嘉兴市", address: "桐乡市石佛南路", latitude: 30.746, longitude: 120.489, elevation: 5, type: "ancient-town" },
  { name: "周庄古镇景区", aliases: ["周庄"], province: "江苏省", city: "苏州市", address: "昆山市周庄镇全福路", latitude: 31.118, longitude: 120.847, elevation: 5, type: "ancient-town" },
  { name: "丽江古城", aliases: ["丽江"], province: "云南省", city: "丽江市", address: "古城区大研街道", latitude: 26.872, longitude: 100.236, elevation: 2410, type: "ancient-town" },
  { name: "西塘古镇景区", aliases: ["西塘"], province: "浙江省", city: "嘉兴市", address: "嘉善县西塘镇南苑路", latitude: 30.946, longitude: 120.892, elevation: 5, type: "ancient-town" },
  { name: "呼伦贝尔大草原", aliases: ["呼伦贝尔草原"], province: "内蒙古自治区", city: "呼伦贝尔市", address: "陈巴尔虎旗草原腹地", latitude: 49.217, longitude: 119.767, elevation: 650, type: "grassland" },
  { name: "那拉提旅游风景区", aliases: ["那拉提草原", "那拉提"], province: "新疆维吾尔自治区", city: "伊犁哈萨克自治州", address: "新源县那拉提镇", latitude: 43.243, longitude: 84.016, elevation: 1800, type: "grassland" },
  { name: "锡林郭勒草原", aliases: ["锡林郭勒"], province: "内蒙古自治区", city: "锡林郭勒盟", address: "锡林浩特市周边", latitude: 43.933, longitude: 116.083, elevation: 1000, type: "grassland" },
  { name: "鸣沙山月牙泉", aliases: ["鸣沙山", "月牙泉"], province: "甘肃省", city: "酒泉市", address: "敦煌市月牙泉镇", latitude: 40.088, longitude: 94.676, elevation: 1130, type: "desert" },
  { name: "沙坡头旅游景区", aliases: ["沙坡头"], province: "宁夏回族自治区", city: "中卫市", address: "沙坡头区迎水桥镇", latitude: 37.459, longitude: 104.984, elevation: 1240, type: "desert" },
  { name: "喀纳斯景区", aliases: ["喀纳斯湖", "喀纳斯"], province: "新疆维吾尔自治区", city: "阿勒泰地区", address: "布尔津县禾木哈纳斯乡", latitude: 48.702, longitude: 87.040, elevation: 1374, type: "lake-waterfall" },
  { name: "西湖风景名胜区", aliases: ["杭州西湖", "西湖"], province: "浙江省", city: "杭州市", address: "西湖区龙井路", latitude: 30.242, longitude: 120.143, elevation: 10, type: "lake-waterfall" },
  { name: "九寨沟风景名胜区", aliases: ["九寨沟"], province: "四川省", city: "阿坝藏族羌族自治州", address: "九寨沟县漳扎镇", latitude: 33.260, longitude: 103.918, elevation: 2500, type: "lake-waterfall" },
  { name: "黄果树瀑布景区", aliases: ["黄果树瀑布", "黄果树"], province: "贵州省", city: "安顺市", address: "镇宁布依族苗族自治县", latitude: 25.991, longitude: 105.667, elevation: 900, type: "lake-waterfall" },
  { name: "长白山景区", aliases: ["长白山", "天池"], province: "吉林省", city: "延边朝鲜族自治州", address: "安图县二道白河镇", latitude: 42.006, longitude: 128.057, elevation: 2200, type: "snow" },
  { name: "亚布力滑雪旅游度假区", aliases: ["亚布力滑雪场", "亚布力"], province: "黑龙江省", city: "哈尔滨市", address: "尚志市亚布力镇", latitude: 44.772, longitude: 128.450, elevation: 760, type: "snow" },
  { name: "阿勒泰将军山国际滑雪度假区", aliases: ["将军山滑雪场", "将军山"], province: "新疆维吾尔自治区", city: "阿勒泰地区", address: "阿勒泰市将军山路", latitude: 47.827, longitude: 88.122, elevation: 1300, type: "snow" },
  { name: "故宫博物院", aliases: ["北京故宫", "故宫"], province: "北京市", city: "北京市", address: "东城区景山前街4号", latitude: 39.917, longitude: 116.397, elevation: 45, type: "ancient-town" },
  { name: "八达岭长城", aliases: ["长城"], province: "北京市", city: "北京市", address: "延庆区军都山关沟古道", latitude: 40.359, longitude: 116.021, elevation: 780, type: "mountain" },
];

const typeKeywords: Record<ScenicType, string[]> = {
  mountain: ["山", "峰", "岭", "峡谷", "森林公园", "长城"],
  coast: ["海", "湾", "岛", "滨", "滩", "礁"],
  "ancient-town": ["古镇", "古城", "园林", "故宫", "寺", "村"],
  grassland: ["草原", "牧场", "湿地"],
  desert: ["沙漠", "沙山", "沙坡", "戈壁", "月牙泉"],
  "lake-waterfall": ["湖", "瀑布", "泉", "潭", "九寨沟"],
  snow: ["雪", "滑雪", "冰川", "天池", "长白山"],
  general: [],
};

export function inferScenicType(name: string): ScenicType {
  const catalog = scenicCatalog.find((item) => item.name.includes(name) || item.aliases?.some((alias) => name.includes(alias)));
  if (catalog) return catalog.type;
  for (const [type, keywords] of Object.entries(typeKeywords) as [ScenicType, string[]][]) {
    if (keywords.some((word) => name.includes(word))) return type;
  }
  return "general";
}

export function searchCatalog(query: string, limit = 8): Place[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return scenicCatalog
    .filter((item) => [item.name, ...(item.aliases ?? []), item.province, item.city].some((value) => value.toLowerCase().includes(normalized)))
    .sort((a, b) => {
      const aExact = a.name === query || a.aliases?.includes(query) ? 1 : 0;
      const bExact = b.name === query || b.aliases?.includes(query) ? 1 : 0;
      return bExact - aExact;
    })
    .slice(0, limit)
    .map((item) => ({
      name: item.name,
      province: item.province,
      city: item.city,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      elevation: item.elevation,
      type: item.type,
      id: `catalog:${item.longitude},${item.latitude}`,
      source: "catalog" as const,
    }));
}
