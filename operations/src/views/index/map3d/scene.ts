import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildMapGeometry, type GeoCollection } from "./geometry.mjs";
import { coordinateCoverage, type MapRow, type RankingRow } from "./data.mjs";
import { createRevenueBatch, mergeOutlines } from "./batches.mjs";

export interface SceneLabel {
  id: string;
  name: string;
  revenue: number | null;
  x: number;
  y: number;
  selectionType: string;
  selectionId: string | null;
  anchorX: number;
  anchorY: number;
}
export interface SceneStats {
  fps: number;
  regions: number;
  vertices: number;
  triangles: number;
  calls: number;
  renderMs: number;
  frameIntervalMs: number;
  benchmarkState?: string;
  benchmarkFps?: number;
  benchmarkFrames?: number;
}
export interface SceneHover {
  name: string;
  revenue: number | null;
  orders: number | null;
  storeCount: number;
  selectionId: string | null;
  ambiguous?: boolean;
}
interface Options {
  hover: (row: SceneHover | null) => void;
  select: (type: string, id: string) => void;
  labels: (labels: SceneLabel[]) => void;
  stats: (stats: SceneStats) => void;
  failure: (message: string) => void;
}
type RegionView = {
  group: THREE.Group;
  mesh: THREE.Mesh;
  edge: THREE.BufferGeometry;
  center: THREE.Vector2;
  boundaryOnly: boolean;
};

export function createMapScene(
  container: HTMLElement,
  geo: GeoCollection,
  options: Options,
) {
  const geometry = buildMapGeometry(geo);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-label", "可交互的三维省市经营地图");
  renderer.domElement.style.cssText =
    "display:block;width:100%;height:100%;touch-action:pan-y;";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-70, 70, 45, -45, 0.1, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.25;
  controls.minZoom = 0.65;
  controls.maxZoom = 2.4;
  controls.zoomSpeed = 0.45;
  controls.rotateSpeed = 0.4;
  const map = new THREE.Group();
  map.rotation.x = -Math.PI / 2;
  scene.add(map);
  const grid = new THREE.GridHelper(180, 30, 0x1a5363, 0x102d40);
  grid.position.y = -0.6;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.3;
  scene.add(grid);
  const views = new Map<string, RegionView>();
  const picks: THREE.Object3D[] = [];
  const depth = 1.8;
  const edgeGeometries: THREE.BufferGeometry[] = [];
  for (const region of geometry.regions) {
    const group = new THREE.Group();
    map.add(group);
    const extruded = new THREE.ExtrudeGeometry(region.shapes, {
      depth: region.boundaryOnly ? 0.22 : depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    extruded.clearGroups();
    extruded.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(extruded.attributes.position.count * 3),
        3,
      ),
    );
    const top = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(extruded, top);
    mesh.userData.mapId = region.id;
    group.add(mesh);
    picks.push(mesh);
    const edge = new THREE.EdgesGeometry(extruded, 25);
    edgeGeometries.push(edge);
    views.set(region.id, {
      group,
      mesh,
      edge,
      center: region.center,
      boundaryOnly: region.boundaryOnly,
    });
  }
  const outline = new THREE.LineSegments(
    mergeOutlines(edgeGeometries),
    new THREE.LineBasicMaterial({
      color: 0x67b9ec,
      transparent: true,
      opacity: 0.7,
    }),
  );
  map.add(outline);
  const hoverGeometry = new THREE.BufferGeometry();
  const hoverOutline = new THREE.LineSegments(
    hoverGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffc765,
      transparent: true,
      opacity: 0.95,
    }),
  );
  hoverOutline.visible = false;
  map.add(hoverOutline);
  const revenueBatch = createRevenueBatch(geometry.regions, depth);
  map.add(revenueBatch.mesh);
  picks.push(revenueBatch.mesh);
  const stores = new THREE.Group();
  map.add(stores);
  let storeMeshes: THREE.Mesh[] = [];
  const pointGeometry = new THREE.SphereGeometry(0.6, 10, 8);
  const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xffcb79 });
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let metrics = new Map<string, MapRow>(),
    ranked: MapRow[] = [],
    shopRows = new Map<string, RankingRow>();
  let hoverId = "",
    disposed = false,
    failed = false,
    width = 1,
    height = 1;
  let lastDown = { x: 0, y: 0 },
    animation = 0,
    lastDraw = 0,
    lastLabels = 0,
    sampleStart = performance.now(),
    frames = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const world = new THREE.Vector3();
  let renderTotal = 0,
    intervalTotal = 0,
    intervalSamples = 0;
  let latestPointer: Pick<PointerEvent, "clientX" | "clientY"> | undefined,
    isDown = false,
    hoverKey = "",
    labelsDirty = true;
  let benchmarkState = "idle",
    benchmarkStart = 0,
    benchmarkEnd = 0,
    benchmarkStopped = 0,
    benchmarkFrames = 0;
  function fail(message: string) {
    if (!failed && !disposed) {
      failed = true;
      options.failure(message);
    }
  }
  function resetView() {
    labelsDirty = true;
    camera.position.set(0, 115, 125);
    camera.zoom = 1;
    controls.target.set(0, 1, 0);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
  }
  function resize() {
    labelsDirty = true;
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    const viewHeight = Math.max(
      geometry.bounds.height * 0.75 + 15,
      108 / (width / height),
    );
    camera.left = (-viewHeight * (width / height)) / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
  }
  function hit(event: Pick<PointerEvent, "clientX" | "clientY">) {
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      (-(event.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const found = raycaster
      .intersectObjects([...picks, ...storeMeshes], false)
      .find((r) => r.object.visible);
    if (!found) return undefined;
    return {
      mapId:
        found.object === revenueBatch.mesh && found.instanceId !== undefined
          ? revenueBatch.idAt(found.instanceId)
          : found.object.userData.mapId,
      storeId: found.object.userData.storeId,
    };
  }
  function applyHover(event: Pick<PointerEvent, "clientX" | "clientY">) {
    const object = hit(event),
      id = object?.mapId || "",
      key = object?.storeId ? "store:" + object.storeId : id;
    if (key === hoverKey) return;
    hoverKey = key;
    hoverId = id;
    labelsDirty = true;
    const view = views.get(id);
    hoverOutline.visible = !!view;
    if (view) hoverOutline.geometry = view.edge;
    if (object?.storeId) {
      const row = shopRows.get(object.storeId)!;
      options.hover({
        name: row.name || row.id,
        revenue: row.revenue,
        orders: row.orders,
        storeCount: 1,
        selectionId: row.id,
      });
      renderer.domElement.style.cursor = "pointer";
      return;
    }
    const row = metrics.get(id);
    options.hover(row?.name ? row : null);
    renderer.domElement.style.cursor = row?.selectionId ? "pointer" : "grab";
  }
  function move(event: PointerEvent) {
    if (!isDown)
      latestPointer = { clientX: event.clientX, clientY: event.clientY };
  }
  function leave() {
    hoverId = "";
    hoverKey = "";
    latestPointer = undefined;
    hoverOutline.visible = false;
    options.hover(null);
    renderer.domElement.style.cursor = "grab";
  }
  function down(event: PointerEvent) {
    isDown = true;
    latestPointer = undefined;
    lastDown = { x: event.clientX, y: event.clientY };
  }
  function up(event: PointerEvent) {
    isDown = false;
    latestPointer = { clientX: event.clientX, clientY: event.clientY };
    if (Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) > 5)
      return;
    const object = hit(event);
    if (object?.storeId) {
      options.select("storeId", object.storeId);
      return;
    }
    const row = metrics.get(object?.mapId);
    if (row?.selectionId) options.select(row.selectionType, row.selectionId);
  }
  function cancel() {
    isDown = false;
    leave();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    fail("三维图形上下文已中断，已切换到业务网络");
  }
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerleave", leave);
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", cancel);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  function setMetrics(rows: MapRow[], ranking: RankingRow[]) {
    metrics = new Map(rows.map((row) => [row.id, row]));
    ranked = rows
      .filter((r) => r.revenue !== null && r.storeCount > 0)
      .sort((a, b) => Math.abs(b.revenue!) - Math.abs(a.revenue!));
    const maximum = Math.max(1, ...ranked.map((r) => Math.abs(r.revenue!)));
    for (const [id, view] of views) {
      const row = metrics.get(id),
        known = row?.revenue !== null && row?.revenue !== undefined;
      const strength = known ? Math.abs(row!.revenue!) / maximum : 0;
      const color = !known
        ? new THREE.Color(0x153349)
        : row!.revenue! < 0
          ? new THREE.Color(0xa57842)
          : new THREE.Color(0x1b527d).lerp(new THREE.Color(0x69bdf5), strength);
      const colors = view.mesh.geometry.attributes
        .color as THREE.BufferAttribute;
      const normals = view.mesh.geometry.attributes.normal;
      const side = new THREE.Color(0x0e344e);
      for (let i = 0; i < colors.count; i++) {
        const face = normals.getZ(i) > 0.5 ? color : side;
        const shade =
          normals.getZ(i) > 0.5 ? 1 : 0.65 + 0.35 * Math.abs(normals.getX(i));
        colors.setXYZ(i, face.r * shade, face.g * shade, face.b * shade);
      }
      colors.needsUpdate = true;
    }
    revenueBatch.update(rows);

    for (const mesh of storeMeshes) {
      stores.remove(mesh);
      mesh.geometry.dispose();
    }
    storeMeshes = [];
    shopRows = new Map(ranking.map((row) => [row.id, row]));
    for (const row of coordinateCoverage(ranking).located) {
      const p = geometry.project([row.lon!, row.lat!]);
      const mesh = new THREE.Mesh(pointGeometry.clone(), pointMaterial);
      mesh.position.set(p.x, p.y, depth + 1);
      mesh.userData.storeId = row.id;
      stores.add(mesh);
      storeMeshes.push(mesh);
    }
    hoverId = "";
    hoverKey = "";
    hoverOutline.visible = false;
    labelsDirty = true;
    options.hover(null);
    lastLabels = 0;
  }
  function tick(now: number) {
    if (disposed) return;
    animation = requestAnimationFrame(tick);
    if (document.hidden || failed) return;
    if (lastDraw) {
      intervalTotal += now - lastDraw;
      intervalSamples++;
    }
    lastDraw = now;
    try {
      const changed = controls.update();
      if (changed) labelsDirty = true;
      if (latestPointer && !isDown) {
        applyHover(latestPointer);
        latestPointer = undefined;
      }
      for (const [id, view] of views) {
        const target = id === hoverId ? 1.16 : 1;
        view.group.scale.z = reduced
          ? target
          : THREE.MathUtils.lerp(view.group.scale.z, target, 0.15);
      }
      if (hoverId)
        hoverOutline.scale.z = views.get(hoverId)?.group.scale.z || 1;
      const renderStart = performance.now();
      renderer.render(scene, camera);
      renderTotal += performance.now() - renderStart;
      frames++;
      if (benchmarkState === "running") {
        benchmarkFrames++;
        if (now >= benchmarkEnd) {
          benchmarkStopped = now;
          benchmarkState = "complete";
          controls.autoRotate = false;
        }
      }
      if (labelsDirty && now - lastLabels > 50) {
        labelsDirty = false;
        lastLabels = now;
        const candidates = ranked
          .slice(0, width < 500 ? 3 : 6)
          .flatMap((row) => {
            const view = views.get(row.id);
            if (!view) return [];
            world.set(
              view.center.x,
              view.center.y,
              depth + revenueBatch.height(row.id) + 2,
            );
            map.localToWorld(world);
            world.project(camera);
            if (Math.abs(world.x) > 1 || Math.abs(world.y) > 1) return [];
            return [
              {
                id: row.id,
                name: row.name,
                revenue: row.revenue,
                selectionType: row.selectionType,
                selectionId: row.selectionId,
                x: 0,
                y: 0,
                anchorX: (world.x * 0.5 + 0.5) * width,
                anchorY: (-0.5 * world.y + 0.5) * height,
              },
            ];
          })
          .sort((a, b) => a.anchorX - b.anchorX);
        const middle = Math.ceil(candidates.length / 2);
        options.labels(
          candidates.map((row, index) => {
            const left = index < middle,
              position = left ? index : index - middle,
              count = left ? middle : candidates.length - middle;
            return {
              ...row,
              x:
                width *
                (left
                  ? width < 500
                    ? 0.16
                    : 0.25
                  : width < 500
                    ? 0.84
                    : 0.75),
              y: 32 + ((height - 65) * (position + 0.5)) / Math.max(1, count),
            };
          }),
        );
      }
      if (now - sampleStart >= 2000) {
        options.stats({
          fps: Math.round((frames * 1000) / (now - sampleStart)),
          regions: views.size,
          vertices: geometry.vertices,
          triangles: renderer.info.render.triangles,
          calls: renderer.info.render.calls,
          renderMs: Math.round((renderTotal / Math.max(1, frames)) * 100) / 100,
          benchmarkState,
          benchmarkFrames,
          benchmarkFps: benchmarkStart
            ? Math.round(
                ((benchmarkFrames * 1000) /
                  Math.max(1, (benchmarkStopped || now) - benchmarkStart)) *
                  10,
              ) / 10
            : 0,
          frameIntervalMs: Math.round(
            intervalTotal / Math.max(1, intervalSamples),
          ),
        });
        frames = 0;
        renderTotal = 0;
        intervalTotal = 0;
        intervalSamples = 0;
        sampleStart = now;
      }
    } catch {
      fail("三维地图渲染失败，已切换到业务网络");
    }
  }
  function benchmark() {
    resetView();
    benchmarkStart = performance.now();
    benchmarkEnd = benchmarkStart + 8000;
    benchmarkStopped = 0;
    benchmarkFrames = 0;
    benchmarkState = "running";
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
  }
  function visibility() {
    if (document.hidden && benchmarkState === "running") {
      benchmarkState = "aborted";
      benchmarkStopped = performance.now();
      controls.autoRotate = false;
    }
    lastDraw = 0;
    intervalTotal = 0;
    intervalSamples = 0;
    renderTotal = 0;
    sampleStart = performance.now();
    frames = 0;
  }
  document.addEventListener("visibilitychange", visibility);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resetView();
  resize();
  animation = requestAnimationFrame(tick);
  return {
    setMetrics,
    benchmark,
    resetView,
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material])
            materials.add(material);
      });
      for (const edge of edgeGeometries) geometries.add(edge);
      geometries.add(hoverGeometry);
      geometries.add(pointGeometry);
      materials.add(pointMaterial);
      for (const resource of geometries) resource.dispose();
      for (const material of materials) material.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
