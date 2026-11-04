# 地图资源

本项目区分业务数据与地理边界。`public/maps/` 只保存地理资源及来源清单，不包含门店坐标、营收或会员数据。

开发预览资源的来源、获取时间及 SHA-256 清单位于 `public/maps/preview/manifest.json`。资源来自 DataV GeoAtlas，保留完整性检查和“开发预览”提示。代码参考与第三方许可见 `third_party/NOTICE.md`。

正式地图通过 `public/maps/manifest.json` 配置，需要来源、使用依据、审图信息、覆盖范围及几何完整性验收。缺少已验收资源时回退到业务网络视图。

不得用代码的 MIT/Apache/ISC 许可证替代对地理资源独立使用条件的核查。
