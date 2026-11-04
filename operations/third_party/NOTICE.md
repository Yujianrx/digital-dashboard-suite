# 3D地图相关来源

- Three.js 0.186.1：MIT，许可证见 three-MIT.txt，https://github.com/mrdoob/three.js。
- d3-geo 3.1.1：ISC，许可证见 d3-geo-ISC.txt，https://github.com/d3/d3-geo。
- 行政区投影、挤出、材质及纹理接入的设计参考 knight-L/sc-datav，核查提交 c1aebf1d9ceb6067d41cb6fd7440b00ec2d71f8e。对应Apache-2.0许可证保留在sc-datav-Apache-2.0.txt。本项目以原生Vue组件实现，业务数据由原有ClickHouse适配器提供。
- knight-L/sat-hunter是可选影像资源准备工具的参考，本轮没有引入其独立应用或下载第三方卫星瓦片。
- 地理数据来源、时间和校验值另见public/maps/preview/manifest.json。代码许可证不用于确认地图影像和边界数据的独立使用依据。

原看板的上游MIT许可证继续保留在根目录LICENSE。

运行时传递依赖d3-array和internmap的许可证另存为对应LICENSE.txt。
