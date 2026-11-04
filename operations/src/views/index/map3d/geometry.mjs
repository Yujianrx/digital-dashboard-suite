import { geoMercator } from "d3-geo";
import { Box2, Vector2, Shape, Path, ShapeUtils } from "three";

export function buildMapGeometry(geo) {
  if (geo?.type !== "FeatureCollection" || !geo.features?.length)
    throw Error("地图须包含非空行政区多边形");
  const projection = geoMercator().scale(1).translate([0, 0]);
  const bounds = new Box2();
  let vertices = 0;
  const toRaw = (coord) => {
    if (
      !Array.isArray(coord) ||
      coord.length < 2 ||
      !coord.slice(0, 2).every(Number.isFinite) ||
      Math.abs(coord[0]) > 180 ||
      Math.abs(coord[1]) >= 89.9
    )
      throw Error("地图含无效经纬度");
    const p = projection(coord);
    return new Vector2(p[0], -p[1]);
  };
  const parsed = geo.features.map((feature, index) => {
    const geometry = feature.geometry;
    const polygons =
      geometry?.type === "Polygon"
        ? [geometry.coordinates]
        : geometry?.type === "MultiPolygon"
          ? geometry.coordinates
          : null;
    if (!polygons?.length) throw Error("地图只支持 Polygon / MultiPolygon");
    const rings = polygons.map((polygon) => {
      if (!Array.isArray(polygon) || !polygon.length)
        throw Error("地图多边形为空");
      return polygon.map((ring) => {
        if (!Array.isArray(ring) || ring.length < 4)
          throw Error("地图轮廓点数不足");
        const result = ring.map((coord) => {
          vertices++;
          const p = toRaw(coord);
          bounds.expandByPoint(p);
          return p;
        });
        if (!result[0].equals(result.at(-1))) throw Error("地图轮廓未闭合");
        return result;
      });
    });
    return { feature, index, rings };
  });
  if (vertices > 250000)
    throw Error("地图精度过高，请先准备适合大屏的几何资源");
  const size = bounds.getSize(new Vector2()),
    origin = bounds.getCenter(new Vector2());
  if (!size.x || !size.y) throw Error("地图范围无效");
  const scale = 100 / size.x;
  const transform = (p) => p.clone().sub(origin).multiplyScalar(scale);
  const project = (coord) => transform(toRaw(coord));
  const regions = parsed.map(({ feature, index, rings }) => {
    const local = new Box2();
    const shapes = rings.map((polygon) => {
      const projected = polygon.map((ring) =>
        ring.map((p) => {
          const v = transform(p);
          local.expandByPoint(v);
          return v;
        }),
      );
      const outer = projected[0];
      if (!ShapeUtils.isClockWise(outer)) outer.reverse();
      const shape = new Shape(outer);
      for (const ring of projected.slice(1)) {
        if (ShapeUtils.isClockWise(ring)) ring.reverse();
        shape.holes.push(new Path(ring));
      }
      return shape;
    });
    const properties = feature.properties || {};
    const centerCoord = properties.centroid || properties.center;
    const center =
      Array.isArray(centerCoord) && centerCoord.length >= 2
        ? project(centerCoord)
        : local.getCenter(new Vector2());
    return {
      id: String(properties.adcode ?? properties.name ?? index),
      name: properties.name || "",
      shapes,
      center,
      boundaryOnly: !properties.name,
    };
  });
  return {
    regions,
    bounds: { width: 100, height: size.y * scale },
    project,
    vertices,
  };
}
