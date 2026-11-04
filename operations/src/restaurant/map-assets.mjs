export const requiredChinaNames = [
  "北京市",
  "天津市",
  "河北省",
  "山西省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "四川省",
  "贵州省",
  "云南省",
  "西藏自治区",
  "陕西省",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
  "台湾省",
  "香港特别行政区",
  "澳门特别行政区",
];
export function validateMapAsset(asset, geo) {
  if (
    !asset.verified ||
    !asset.fullExtentConfirmed ||
    !asset.source ||
    !asset.license ||
    !asset.reviewNumber
  )
    throw Error("地图来源、授权、审图信息和完整性须先确认");
  return validateMapGeometry(asset, geo);
}
// Structural validation is also used by explicitly marked local development previews.
// It never confirms a resource's geographic approval or licensing status.
export function validateMapGeometry(asset, geo) {
  if (
    geo?.type !== "FeatureCollection" ||
    !Array.isArray(geo.features) ||
    !geo.features.length ||
    geo.features.some(
      (f) =>
        !["Polygon", "MultiPolygon"].includes(f.geometry?.type) ||
        !Array.isArray(f.geometry.coordinates) ||
        !f.geometry.coordinates.length,
    )
  )
    throw Error("地图须为有效GeoJSON FeatureCollection，含非空多边形");
  const names = new Set(geo.features.map((f) => f.properties?.name)),
    required =
      asset.key === "china" ? requiredChinaNames : asset.expectedNames || [];
  if (required.some((n) => !names.has(n)))
    throw Error("地图缺少已配置的必要行政区，不予展示");
  return true;
}
