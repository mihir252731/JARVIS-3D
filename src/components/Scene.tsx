"use client";

import Model, { type ModelStats } from "./Model";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import {
  Group,
  Intersection,
  Object3D as ThreeObject3D,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

type ModelName = "city" | "human" | "cyberpunk";
type ObjectType = "cube" | "sphere" | "model";
type SceneTarget = ModelName | ObjectType;
type Vec3Tuple = [number, number, number];

const MODEL_PATHS: Record<ModelName, string> = {
  city: "/models/new_york_city.glb",
  human: "/models/male_human_skeleton_-_zbrush_-_anatomy_study.glb",
  cyberpunk: "/models/adam_smasher_cyberpunk.glb",
};

const MODEL_SCALES: Record<ModelName, number> = {
  city: 0.01,
  human: 0.35,
  cyberpunk: 0.01,
};

const HUMAN_SCALE_IN_CITY = 0.045;
const HUMAN_SCALE_ON_DETAIL = 0.035;
const HUMAN_FACE_CAMERA_YAW_OFFSET = Math.PI;
const WALKABLE_VIEW_SAMPLES = [
  [0, 0],
  [-0.2, 0],
  [0.2, 0],
  [-0.4, 0],
  [0.4, 0],
  [0, -0.25],
  [-0.2, -0.25],
  [0.2, -0.25],
  [-0.4, -0.25],
  [0.4, -0.25],
  [0, -0.5],
  [-0.25, -0.5],
  [0.25, -0.5],
] as const;

type Object3D = {
  id: string;
  type: ObjectType;
  name?: ModelName;
  modelPath?: string;
  modelScale?: number;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: number;
};

export type SceneSummary = {
  totalObjects: number;
  cubes: number;
  spheres: number;
  cities: number;
  humans: number;
  cyberpunkModels: number;
  selectedObject?: {
    type: ObjectType;
    name?: ModelName;
  };
  cityModelStats?: ModelStats;
};

export type SceneRefType = {
  addObject: (type: ObjectType) => void;
  addObjectWithPath: (
    path: string,
    name: ModelName,
    modelScale?: number,
    position?: Vec3Tuple
  ) => void;
  addModelAtView: (
    name: ModelName,
    count?: number,
    detailScale?: boolean
  ) => void;
  deleteObjectByName: (name: ModelName, count?: number) => void;
  deleteObjectByType: (type: ObjectType, count?: number) => void;
  clearObjects: () => void;
  deleteSelectedObject: () => void;
  scaleObject: (factor: number) => void;
  scaleObjectsByName: (name: ModelName, factor: number) => void;
  scaleObjectByTarget: (target: SceneTarget, factor: number) => void;
  scaleObjectsByTarget: (target: SceneTarget, factor: number) => void;
  moveSelectedObject3D: (x: number, y: number, z: number) => void;
  moveSelectedObjectBy: (x: number, y: number, z: number) => void;
  moveObjectByTarget: (
    target: SceneTarget,
    x: number,
    y: number,
    z: number
  ) => void;
  moveObjectsByTarget: (
    target: SceneTarget,
    x: number,
    y: number,
    z: number
  ) => void;
  rotateSelectedObject: (degrees: number, axis?: "x" | "y" | "z") => void;
  rotateObjectByTarget: (
    target: SceneTarget,
    degrees: number,
    axis?: "x" | "y" | "z"
  ) => void;
  rotateObjectsByTarget: (
    target: SceneTarget,
    degrees: number,
    axis?: "x" | "y" | "z"
  ) => void;
  selectObject: (target: SceneTarget) => void;
  zoomCamera: (direction: "in" | "out", steps?: number) => void;
  zoomCameraMax: (direction: "in" | "out") => void;
  focusAtView: (zoomDistance?: number) => void;
  focusObject: (target: ModelName | ObjectType) => void;
  getSceneSummary: () => SceneSummary;
};

const createId = () => `${Date.now()}-${Math.random()}`;

const toTuple = (vector: Vector3): Vec3Tuple => [
  vector.x,
  vector.y,
  vector.z,
];

const findAncestorUserData = (
  object: ThreeObject3D,
  key: string
): unknown => {
  let current: ThreeObject3D | null = object;

  while (current) {
    if (current.userData[key]) {
      return current.userData[key];
    }

    current = current.parent;
  }

  return undefined;
};

const Scene = forwardRef<SceneRefType>((props, ref) => {
  const [objects, setObjects] = useState<Object3D[]>([]);
  const [modelStats, setModelStats] = useState<Record<string, ModelStats>>(
    {}
  );
  const [selectedId, setSelectedId] = useState<string>("1");
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const sceneObjectsRef = useRef<Group | null>(null);
  const raycasterRef = useRef(new Raycaster());

  const addObject = (type: ObjectType) => {
    const modelList = Object.values(MODEL_PATHS);
    const randomModel =
      modelList[Math.floor(Math.random() * modelList.length)];

    const newObj: Object3D = {
      id: createId(),
      type,
      modelPath: type === "model" ? randomModel : undefined,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    };

    setObjects((prev) => [...prev, newObj]);
    setSelectedId(newObj.id);
  };

  const addObjectWithPath = (
    path: string,
    name: ModelName,
    modelScale = MODEL_SCALES[name],
    position: Vec3Tuple = [0, 0, 0]
  ) => {
    const newObj: Object3D = {
      id: createId(),
      type: "model",
      name,
      modelPath: path,
      modelScale,
      position,
      rotation: [0, 0, 0],
      scale: 1,
    };

    setObjects((prev) => [...prev, newObj]);
    setSelectedId(newObj.id);
  };

  const getRaycastHit = (preferWalkableSurface = false) => {
    const controls = controlsRef.current;
    const root = sceneObjectsRef.current;

    if (!controls || !root) {
      return null;
    }

    raycasterRef.current.setFromCamera(
      new Vector2(0, 0),
      controls.object
    );

    const intersects = raycasterRef.current.intersectObjects(
      root.children,
      true
    );

    const validHits = intersects.filter((item) => {
      if (findAncestorUserData(item.object, "helper")) {
        return false;
      }

      return (
        !preferWalkableSurface ||
        findAncestorUserData(item.object, "objectName") !== "human"
      );
    });
    const hit =
      preferWalkableSurface
        ? validHits.find((item) => {
            const normal = item.face?.normal.clone() ?? new Vector3(0, 1, 0);
            normal.transformDirection(item.object.matrixWorld);
            return normal.y > 0.35;
          }) ?? validHits[0]
        : validHits[0];

    if (!hit) {
      return null;
    }

    const normal = hit.face?.normal.clone() ?? new Vector3(0, 1, 0);
    const normalMatrix = hit.object.matrixWorld;
    normal.transformDirection(normalMatrix);

    return {
      point: hit.point.clone(),
      normal,
    };
  };

  const isWalkableHit = (item: Intersection) => {
    if (findAncestorUserData(item.object, "helper")) {
      return false;
    }

    if (findAncestorUserData(item.object, "objectName") === "human") {
      return false;
    }

    const normal = item.face?.normal.clone() ?? new Vector3(0, 1, 0);
    normal.transformDirection(item.object.matrixWorld);
    return normal.y > 0.45;
  };

  const getLowestVisibleWalkablePoint = () => {
    const controls = controlsRef.current;
    const root = sceneObjectsRef.current;

    if (!controls || !root) {
      return null;
    }

    const candidates = WALKABLE_VIEW_SAMPLES.flatMap(([x, y]) => {
      raycasterRef.current.setFromCamera(
        new Vector2(x, y),
        controls.object
      );

      return raycasterRef.current
        .intersectObjects(root.children, true)
        .filter(isWalkableHit)
        .map((item) => ({
          point: item.point.clone(),
          screenDistance: Math.hypot(x, y),
        }));
    });

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      const heightDelta = a.point.y - b.point.y;

      if (Math.abs(heightDelta) > 0.04) {
        return heightDelta;
      }

      return a.screenDistance - b.screenDistance;
    });

    return candidates[0].point;
  };

  const snapPointToWalkableSurface = (point: Vector3) => {
    const root = sceneObjectsRef.current;

    if (!root) {
      return point;
    }

    raycasterRef.current.set(
      new Vector3(point.x, point.y + 10, point.z),
      new Vector3(0, -1, 0)
    );

    const hit = raycasterRef.current
      .intersectObjects(root.children, true)
      .find((item) => {
        if (findAncestorUserData(item.object, "helper")) {
          return false;
        }

        if (findAncestorUserData(item.object, "objectName") === "human") {
          return false;
        }

        const normal = item.face?.normal.clone() ?? new Vector3(0, 1, 0);
        normal.transformDirection(item.object.matrixWorld);
        return normal.y > 0.35;
      });

    return hit ? hit.point.clone() : point;
  };

  const getViewTargetPosition = (preferWalkableSurface = false) => {
    if (preferWalkableSurface) {
      const visibleWalkablePoint = getLowestVisibleWalkablePoint();

      if (visibleWalkablePoint) {
        return visibleWalkablePoint.add(new Vector3(0, 0.01, 0));
      }
    }

    const hit = getRaycastHit(preferWalkableSurface);

    if (hit) {
      const point = preferWalkableSurface
        ? snapPointToWalkableSurface(hit.point)
        : hit.point;
      const offset = preferWalkableSurface ? 0.01 : 0.03;
      return point.add(new Vector3(0, offset, 0));
    }

    const controls = controlsRef.current;

    if (!controls) {
      return new Vector3(0, 0, 0);
    }

    const camera = controls.object;
    const direction = new Vector3();
    camera.getWorldDirection(direction);

    const viewDistance = Math.max(
      0.5,
      Math.min(controls.getDistance(), 25)
    );

    const point = camera.position
      .clone()
      .add(direction.multiplyScalar(viewDistance));

    return preferWalkableSurface
      ? snapPointToWalkableSurface(point).add(new Vector3(0, 0.01, 0))
      : point;
  };

  const getYawFacingCamera = (position: Vector3) => {
    const controls = controlsRef.current;

    if (!controls) {
      return 0;
    }

    const camera = controls.object;
    const dx = camera.position.x - position.x;
    const dz = camera.position.z - position.z;

    return Math.atan2(dx, dz) + HUMAN_FACE_CAMERA_YAW_OFFSET;
  };

  const addModelAtView = (
    name: ModelName,
    count = 1,
    detailScale = false
  ) => {
    const hasCity = objects.some((obj) => obj.name === "city");
    const modelScale =
      name === "human" && detailScale
        ? HUMAN_SCALE_ON_DETAIL
        : name === "human" && hasCity
          ? HUMAN_SCALE_IN_CITY
          : MODEL_SCALES[name];
    const basePosition = getViewTargetPosition(name === "human");
    const normalizedCount = Math.max(1, Math.min(50, count));
    const spacing = Math.max(modelScale * 3, detailScale ? 0.04 : 0.12);

    const newObjects = Array.from(
      { length: normalizedCount },
      (_, index): Object3D => {
        const columns = Math.ceil(Math.sqrt(normalizedCount));
        const row = Math.floor(index / columns);
        const column = index % columns;
        const xOffset = (column - (columns - 1) / 2) * spacing;
        const zOffset =
          (row - Math.floor((normalizedCount - 1) / columns) / 2) *
          spacing;

        const position = basePosition
          .clone()
          .add(new Vector3(xOffset, 0, zOffset));

        return {
          id: createId(),
          type: "model",
          name,
          modelPath: MODEL_PATHS[name],
          modelScale,
          position: toTuple(position),
          rotation: [
            0,
            name === "human" ? getYawFacingCamera(position) : 0,
            0,
          ],
          scale: 1,
        };
      }
    );

    setObjects((prev) => [...prev, ...newObjects]);
    setSelectedId(newObjects[newObjects.length - 1].id);
  };

  const deleteObjectByName = (name: ModelName, count?: number) => {
    setObjects((prev) => {
      if (!count) {
        return prev.filter((obj) => obj.name !== name);
      }

      let remaining = count;
      return [...prev].reverse().filter((obj) => {
        if (obj.name === name && remaining > 0) {
          remaining -= 1;
          return false;
        }

        return true;
      }).reverse();
    });
  };

  const deleteObjectByType = (type: ObjectType, count?: number) => {
    setObjects((prev) => {
      if (!count) {
        return prev.filter((obj) => obj.type !== type);
      }

      let remaining = count;
      return [...prev]
        .reverse()
        .filter((obj) => {
          if (obj.type === type && remaining > 0) {
            remaining -= 1;
            return false;
          }

          return true;
        })
        .reverse();
    });
  };

  const clearObjects = () => {
    setObjects([]);
  };

  const deleteSelectedObject = () => {
    setObjects((prev) => prev.filter((obj) => obj.id !== selectedId));
  };

  const scaleObject = (factor: number) => {
    setObjects((prev) =>
      prev.map((obj) =>
        obj.id === selectedId
          ? { ...obj, scale: obj.scale * factor }
          : obj
      )
    );
  };

  const scaleObjectsByName = (name: ModelName, factor: number) => {
    setObjects((prev) =>
      prev.map((obj) =>
        obj.name === name ? { ...obj, scale: obj.scale * factor } : obj
      )
    );
  };

  const objectMatchesTarget = (obj: Object3D, target: SceneTarget) =>
    obj.name === target || obj.type === target;

  const getTargetIndex = (items: Object3D[], target: SceneTarget) => {
    const selectedIndex = items.findIndex(
      (obj) => obj.id === selectedId && objectMatchesTarget(obj, target)
    );

    if (selectedIndex >= 0) {
      return selectedIndex;
    }

    const camera = controlsRef.current?.object;

    if (camera) {
      const visibleTarget = items
        .map((obj, index) => {
          if (!objectMatchesTarget(obj, target)) {
            return null;
          }

          const projected = new Vector3(...obj.position).project(camera);

          if (
            projected.z < -1 ||
            projected.z > 1 ||
            Math.abs(projected.x) > 1.4 ||
            Math.abs(projected.y) > 1.4
          ) {
            return null;
          }

          return {
            index,
            score: Math.hypot(projected.x, projected.y),
          };
        })
        .filter((item): item is { index: number; score: number } =>
          Boolean(item)
        )
        .sort((a, b) => a.score - b.score)[0];

      if (visibleTarget) {
        return visibleTarget.index;
      }
    }

    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (objectMatchesTarget(items[index], target)) {
        return index;
      }
    }

    return -1;
  };

  const updateTargetObject = (
    target: SceneTarget,
    updater: (obj: Object3D) => Object3D
  ) => {
    setObjects((prev) => {
      const targetIndex = getTargetIndex(prev, target);

      if (targetIndex < 0) {
        return prev;
      }

      const next = [...prev];
      next[targetIndex] = updater(next[targetIndex]);
      setSelectedId(next[targetIndex].id);
      return next;
    });
  };

  const updateMatchingObjects = (
    target: SceneTarget,
    updater: (obj: Object3D) => Object3D
  ) => {
    setObjects((prev) => {
      const matching = prev.filter((obj) => objectMatchesTarget(obj, target));

      if (matching.length === 0) {
        return prev;
      }

      const lastMatchingId = matching[matching.length - 1].id;
      setSelectedId(lastMatchingId);

      return prev.map((obj) =>
        objectMatchesTarget(obj, target) ? updater(obj) : obj
      );
    });
  };

  const scaleObjectByTarget = (target: SceneTarget, factor: number) => {
    updateTargetObject(target, (obj) => ({
      ...obj,
      scale: obj.scale * factor,
    }));
  };

  const scaleObjectsByTarget = (target: SceneTarget, factor: number) => {
    updateMatchingObjects(target, (obj) => ({
      ...obj,
      scale: obj.scale * factor,
    }));
  };

  const moveSelectedObject3D = (
    x: number,
    y: number,
    z: number
  ) => {
    setObjects((prev) =>
      prev.map((obj) =>
        obj.id === selectedId
          ? { ...obj, position: [x, y, z] }
          : obj
      )
    );
  };

  const moveSelectedObjectBy = (x: number, y: number, z: number) => {
    setObjects((prev) =>
      prev.map((obj) =>
        obj.id === selectedId
          ? {
              ...obj,
              position: [
                obj.position[0] + x,
                obj.position[1] + y,
                obj.position[2] + z,
              ],
            }
          : obj
      )
    );
  };

  const moveObjectByTarget = (
    target: SceneTarget,
    x: number,
    y: number,
    z: number
  ) => {
    updateTargetObject(target, (obj) => ({
      ...obj,
      position: [
        obj.position[0] + x,
        obj.position[1] + y,
        obj.position[2] + z,
      ],
    }));
  };

  const moveObjectsByTarget = (
    target: SceneTarget,
    x: number,
    y: number,
    z: number
  ) => {
    updateMatchingObjects(target, (obj) => ({
      ...obj,
      position: [
        obj.position[0] + x,
        obj.position[1] + y,
        obj.position[2] + z,
      ],
    }));
  };

  const rotateSelectedObject = (
    degrees: number,
    axis: "x" | "y" | "z" = "y"
  ) => {
    const radians = (degrees * Math.PI) / 180;
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;

    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id !== selectedId) {
          return obj;
        }

        const rotation: Vec3Tuple = [...obj.rotation];
        rotation[axisIndex] += radians;

        return {
          ...obj,
          rotation,
        };
      })
    );
  };

  const rotateObjectByTarget = (
    target: SceneTarget,
    degrees: number,
    axis: "x" | "y" | "z" = "y"
  ) => {
    const radians = (degrees * Math.PI) / 180;
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;

    updateTargetObject(target, (obj) => {
      const rotation: Vec3Tuple = [...obj.rotation];
      rotation[axisIndex] += radians;

      return {
        ...obj,
        rotation,
      };
    });
  };

  const rotateObjectsByTarget = (
    target: SceneTarget,
    degrees: number,
    axis: "x" | "y" | "z" = "y"
  ) => {
    const radians = (degrees * Math.PI) / 180;
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;

    updateMatchingObjects(target, (obj) => {
      const rotation: Vec3Tuple = [...obj.rotation];
      rotation[axisIndex] += radians;

      return {
        ...obj,
        rotation,
      };
    });
  };

  const findObject = (target: SceneTarget) =>
    objects.find((obj) => objectMatchesTarget(obj, target));

  const selectObject = (target: SceneTarget) => {
    const object = findObject(target);

    if (object) {
      setSelectedId(object.id);
    }
  };

  const setCameraDistance = (distance: number) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const camera = controls.object;
    const target = controls.target;
    const direction = camera.position.clone().sub(target).normalize();

    camera.position.copy(target).add(direction.multiplyScalar(distance));
    controls.update();
  };

  const zoomCamera = (direction: "in" | "out", steps = 1) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const normalizedSteps = Math.max(1, Math.min(50, steps));
    const currentDistance = controls.getDistance();
    const multiplier =
      direction === "in"
        ? Math.pow(0.82, normalizedSteps)
        : Math.pow(1.22, normalizedSteps);
    const nextDistance = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, currentDistance * multiplier)
    );

    setCameraDistance(nextDistance);
  };

  const zoomCameraMax = (direction: "in" | "out") => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    setCameraDistance(
      direction === "in" ? controls.minDistance : controls.maxDistance
    );
  };

  const focusAtView = (zoomDistance = 1) => {
    const controls = controlsRef.current;
    const hit = getRaycastHit();

    if (!controls || !hit) {
      return;
    }

    controls.target.copy(hit.point);
    setCameraDistance(zoomDistance);
    controls.update();
  };

  const focusObject = (target: ModelName | ObjectType) => {
    const controls = controlsRef.current;
    const object = findObject(target);

    if (!controls || !object) {
      return;
    }

    const position = new Vector3(...object.position);
    const distance =
      object.name === "city"
        ? 18
        : object.name === "human"
          ? 1.4
          : object.type === "cube" || object.type === "sphere"
            ? 3
            : 5;
    const height =
      object.name === "city" ? 5 : object.name === "human" ? 0.9 : 1;

    controls.target.copy(position);
    controls.object.position.set(
      position.x,
      position.y + height,
      position.z + distance
    );
    controls.update();
    setSelectedId(object.id);
  };

  const getSceneSummary = (): SceneSummary => {
    const selectedObject = objects.find((obj) => obj.id === selectedId);

    return {
      totalObjects: objects.length,
      cubes: objects.filter((obj) => obj.type === "cube").length,
      spheres: objects.filter((obj) => obj.type === "sphere").length,
      cities: objects.filter((obj) => obj.name === "city").length,
      humans: objects.filter((obj) => obj.name === "human").length,
      cyberpunkModels: objects.filter((obj) => obj.name === "cyberpunk")
        .length,
      selectedObject: selectedObject
        ? {
            type: selectedObject.type,
            name: selectedObject.name,
          }
        : undefined,
      cityModelStats: modelStats[MODEL_PATHS.city],
    };
  };

  const handleModelStats = (stats: ModelStats) => {
    setModelStats((prev) => {
      const current = prev[stats.path];

      if (
        current &&
        current.nodeCount === stats.nodeCount &&
        current.meshCount === stats.meshCount &&
        current.buildingLikeNodeCount === stats.buildingLikeNodeCount
      ) {
        return prev;
      }

      return {
        ...prev,
        [stats.path]: stats,
      };
    });
  };

  useImperativeHandle(ref, () => ({
    addObject,
    addObjectWithPath,
    addModelAtView,
    deleteObjectByName,
    deleteObjectByType,
    clearObjects,
    deleteSelectedObject,
    scaleObject,
    scaleObjectsByName,
    scaleObjectByTarget,
    scaleObjectsByTarget,
    moveSelectedObject3D,
    moveSelectedObjectBy,
    moveObjectByTarget,
    moveObjectsByTarget,
    rotateSelectedObject,
    rotateObjectByTarget,
    rotateObjectsByTarget,
    selectObject,
    zoomCamera,
    zoomCameraMax,
    focusAtView,
    focusObject,
    getSceneSummary,
  }));

  return (
    <Canvas camera={{ position: [3, 3, 3], near: 0.01, far: 10000 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} />

      <group ref={sceneObjectsRef}>
        {objects.map((obj) => (
          <group
            key={obj.id}
            position={obj.position}
            rotation={obj.rotation}
            scale={obj.scale}
            userData={{
              objectId: obj.id,
              objectName: obj.name,
              objectType: obj.type,
            }}
            onClick={() => setSelectedId(obj.id)}
          >
            {obj.type === "cube" && (
              <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial
                  color={
                    obj.id === selectedId ? "#00ffff" : "#0077ff"
                  }
                  emissive={
                    obj.id === selectedId
                      ? "#00ffff"
                      : "#000000"
                  }
                  emissiveIntensity={
                    obj.id === selectedId ? 1.5 : 0
                  }
                />
              </mesh>
            )}

            {obj.type === "sphere" && (
              <mesh>
                <sphereGeometry args={[0.7, 32, 32]} />
                <meshStandardMaterial
                  color={
                    obj.id === selectedId ? "#00ffff" : "#0077ff"
                  }
                  emissive={
                    obj.id === selectedId
                      ? "#00ffff"
                      : "#000000"
                  }
                  emissiveIntensity={
                    obj.id === selectedId ? 1.5 : 0
                  }
                />
              </mesh>
            )}

            {obj.type === "model" && obj.modelPath && (
              <Model
                path={obj.modelPath}
                scale={obj.modelScale}
                anchor={obj.name === "human" ? "ground" : "center"}
                onStats={handleModelStats}
              />
            )}

            {obj.id === selectedId && obj.type !== "model" && (
              <mesh userData={{ helper: true }}>
                {obj.type === "cube" && (
                  <boxGeometry args={[1.05, 1.05, 1.05]} />
                )}
                {obj.type === "sphere" && (
                  <sphereGeometry args={[0.75, 32, 32]} />
                )}

                <meshBasicMaterial
                  wireframe
                  color="#00ffff"
                  transparent
                  opacity={0.6}
                />
              </mesh>
            )}
          </group>
        ))}
      </group>

      <OrbitControls
        ref={controlsRef}
        enableDamping
        maxDistance={300}
        minDistance={0.05}
        screenSpacePanning
        zoomToCursor
      />
    </Canvas>
  );
});

Scene.displayName = "Scene";

export default Scene;
