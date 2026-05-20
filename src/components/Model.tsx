"use client";

import { Center, Clone, useGLTF } from "@react-three/drei";
import { useEffect } from "react";

export type ModelStats = {
  path: string;
  nodeCount: number;
  meshCount: number;
  buildingLikeNodeCount: number;
};

type ModelProps = {
  path: string;
  scale?: number;
  anchor?: "center" | "ground";
  onStats?: (stats: ModelStats) => void;
};

const BUILDING_NAME_PATTERN =
  /building|tower|house|skyscraper|apartment|balcony|street|road|city|block/i;

export default function Model({
  path,
  scale = 0.01,
  anchor = "center",
  onStats,
}: ModelProps) {
  const { scene } = useGLTF(path);

  useEffect(() => {
    let nodeCount = 0;
    let meshCount = 0;
    let buildingLikeNodeCount = 0;

    scene.traverse((child) => {
      nodeCount += 1;

      if (child.type === "Mesh") {
        meshCount += 1;
      }

      if (BUILDING_NAME_PATTERN.test(child.name)) {
        buildingLikeNodeCount += 1;
      }
    });

    onStats?.({
      path,
      nodeCount,
      meshCount,
      buildingLikeNodeCount,
    });
  }, [onStats, path, scene]);

  const clone = <Clone object={scene} scale={scale} />;

  return anchor === "center" ? <Center>{clone}</Center> : clone;
}
