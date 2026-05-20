"use client";

import Scene, {
  type SceneRefType,
  type SceneSummary,
} from "../components/Scene";
import Gesture from "../components/Gesture";
import { useEffect, useRef, useState } from "react";

type SpeechRecognitionResultEventLike = {
  results: {
    [resultIndex: number]: {
      [alternativeIndex: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult:
    | ((event: SpeechRecognitionResultEventLike) => void)
    | null;
  onerror:
    | ((event: SpeechRecognitionErrorEventLike) => void)
    | null;
  onend: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

type GestureInput =
  | string
  | {
      type: "move";
      x: number;
      y: number;
      z: number;
    };

type TrainingMode = "speech" | "gesture";

type GestureBinding = {
  sequence: string[];
  command: string;
};

type CommandTarget = "human" | "city" | "cyberpunk" | "cube" | "sphere";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
};

const getCommandSteps = (cmd: string) => {
  const digitMatch = cmd.match(/\b(\d+)\s*(?:x|times?|time)?\b/);

  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const word = Object.keys(NUMBER_WORDS).find((key) =>
    new RegExp(`\\b${key}\\b`).test(cmd)
  );

  return word ? NUMBER_WORDS[word] : 1;
};

const isMaxCommand = (cmd: string) =>
  /\b(max|maximum|all the way|fully|full)\b/.test(cmd);

const isAllCommand = (cmd: string) =>
  /\b(all|every|everything|entire)\b/.test(cmd);

const isHereCommand = (cmd: string) =>
  /\b(over here|right here|here|there|this spot|current spot|current view|where i am looking|where i'm looking)\b/.test(
    cmd
  );

const isHumanCommand = (cmd: string) =>
  /\b(human|humans|person|persons|people|man|men|woman|women|him|her)\b/.test(
    cmd
  );

const getCommandTarget = (cmd: string): CommandTarget | null => {
  if (isHumanCommand(cmd)) {
    return "human";
  }

  if (/\bcity|cities\b/.test(cmd)) {
    return "city";
  }

  if (cmd.includes("cyberpunk")) {
    return "cyberpunk";
  }

  if (/\b(cube|cubes|box|boxes)\b/.test(cmd)) {
    return "cube";
  }

  if (/\b(sphere|spheres|ball|balls)\b/.test(cmd)) {
    return "sphere";
  }

  return null;
};

const isCityDetailCommand = (cmd: string) =>
  /\b(balcony|street|road|sidewalk|intersection|crossing|building|window|door|roof|center)\b/.test(
    cmd
  );

const shouldPlaceAtView = (cmd: string) =>
  isHereCommand(cmd) || isCityDetailCommand(cmd);

const getDeleteCount = (cmd: string) =>
  isAllCommand(cmd) ? undefined : getCommandSteps(cmd);

const getScaleFactor = (
  cmd: string,
  direction: "up" | "down"
) => {
  if (isMaxCommand(cmd)) {
    return direction === "up" ? 5 : 0.2;
  }

  return Math.pow(
    direction === "up" ? 1.2 : 0.8,
    getCommandSteps(cmd)
  );
};

const getMoveStepSize = (target: CommandTarget | null) => {
  if (target === "human") {
    return 0.012;
  }

  if (target === "city") {
    return 0.06;
  }

  if (target === "cube" || target === "sphere") {
    return 0.035;
  }

  if (target === "cyberpunk") {
    return 0.02;
  }

  return 0.025;
};

const getMoveDistance = (cmd: string, target: CommandTarget | null) =>
  getMoveStepSize(target) * getCommandSteps(cmd);

const isSceneQuestion = (text: string) =>
  /\?|\b(how many|how much|count|what is|what's|tell me|are there|is there|do you see)\b/.test(
    text
  );

const formatCount = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const joinReadableList = (items: string[]) => {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const getDegrees = (cmd: string) => {
  const match = cmd.match(/\b(\d+)\s*(?:degree|degrees)?\b/);
  return match ? Number(match[1]) : 90;
};

const getRotationAxis = (cmd: string): "x" | "y" | "z" => {
  if (/\b(x axis|pitch|upward|downward)\b/.test(cmd)) {
    return "x";
  }

  if (/\b(z axis|roll|tilt)\b/.test(cmd)) {
    return "z";
  }

  return "y";
};

const normalizeTrainingCommand = (command: string) => {
  const text = command.trim().toLowerCase();

  if (!text) {
    return "";
  }

  if (isHumanCommand(text)) {
    return text.includes("add") ? text : "add human";
  }

  if (/\bcity|cities\b/.test(text)) {
    return text.includes("add") ? text : "add city";
  }

  if (/\bcube|box\b/.test(text)) {
    return text.includes("add") ? text : "add cube";
  }

  if (/\bsphere|ball\b/.test(text)) {
    return text.includes("add") ? text : "add sphere";
  }

  return text;
};

const normalizeStoredGestureBinding = (
  binding: GestureBinding
): GestureBinding => ({
  ...binding,
  command: normalizeTrainingCommand(binding.command),
});

const sequenceMatches = (recent: string[], target: string[]) => {
  if (target.length === 0 || recent.length < target.length) {
    return false;
  }

  return target.every(
    (gesture, index) =>
      recent[recent.length - target.length + index] === gesture
  );
};

const withoutNone = (sequence: string[]) =>
  sequence.filter((gesture) => gesture !== "None");

const gestureBindingMatches = (recent: string[], target: string[]) =>
  sequenceMatches(recent, target) ||
  sequenceMatches(withoutNone(recent), withoutNone(target));

const readStoredSpeechAliases = () => {
  if (typeof window === "undefined") {
    return {};
  }

  const saved = window.localStorage.getItem("jarvis:speechAliases");
  return saved ? (JSON.parse(saved) as Record<string, string>) : {};
};

const readStoredGestureBindings = () => {
  if (typeof window === "undefined") {
    return [];
  }

  const saved = window.localStorage.getItem("jarvis:gestureBindings");
  return saved
    ? (JSON.parse(saved) as GestureBinding[]).map(
        normalizeStoredGestureBinding
      )
    : [];
};

export default function Home() {
  const sceneRef = useRef<SceneRefType>(null);
  const [voiceStatus, setVoiceStatus] = useState(
    "Click Speak, then say a command."
  );
  const [viewMode, setViewMode] = useState<"scene" | "train">("scene");
  const [trainingMode, setTrainingMode] = useState<TrainingMode>("speech");
  const [speechAlias, setSpeechAlias] = useState("");
  const [speechCommand, setSpeechCommand] = useState("");
  const [speechAliases, setSpeechAliases] = useState<Record<string, string>>(
    {}
  );
  const [gestureBindings, setGestureBindings] = useState<GestureBinding[]>(
    []
  );
  const [trainingStorageReady, setTrainingStorageReady] = useState(false);
  const [isRecordingGesture, setIsRecordingGesture] = useState(false);
  const [recordedGestureSequence, setRecordedGestureSequence] = useState<
    string[]
  >([]);
  const [gestureCommand, setGestureCommand] = useState("");
  const [lastGestureName, setLastGestureName] = useState("None");

  const smoothPos = useRef({ x: 0, y: 0, z: 0 });
  const isGrabbing = useRef(false);
  const recentGestures = useRef<string[]>([]);
  const gestureCommandCooldown = useRef(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSpeechAliases(readStoredSpeechAliases());
      setGestureBindings(readStoredGestureBindings());
      setTrainingStorageReady(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!trainingStorageReady) {
      return;
    }

    window.localStorage.setItem(
      "jarvis:speechAliases",
      JSON.stringify(speechAliases)
    );
  }, [speechAliases, trainingStorageReady]);

  useEffect(() => {
    if (!trainingStorageReady) {
      return;
    }

    window.localStorage.setItem(
      "jarvis:gestureBindings",
      JSON.stringify(gestureBindings)
    );
  }, [gestureBindings, trainingStorageReady]);

  const speakAnswer = (message: string) => {
    setVoiceStatus(`Jarvis: ${message}`);

    if (!("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(message);
    speech.rate = 1;
    speech.pitch = 1;
    speech.volume = 1;
    window.speechSynthesis.speak(speech);
  };

  const getBuildingAnswer = (summary: SceneSummary) => {
    if (summary.cities === 0) {
      return "There is no city model in the scene right now.";
    }

    const stats = summary.cityModelStats;

    if (!stats) {
      return "The city model is still loading, so I cannot estimate the building count yet.";
    }

    if (stats.buildingLikeNodeCount > 0) {
      return `I found about ${stats.buildingLikeNodeCount} building-like named parts in the city model.`;
    }

    return `I can see ${summary.cities} city model, but its individual buildings are not labeled. The model contains ${stats.meshCount} mesh parts, so I can count city geometry, but not exact buildings yet.`;
  };

  const answerSceneQuestion = (input: string) => {
    const text = input.toLowerCase();
    const summary = sceneRef.current?.getSceneSummary();

    if (!summary) {
      return "The scene is still loading, so I cannot inspect it yet.";
    }

    if (isHumanCommand(text)) {
      return `There ${summary.humans === 1 ? "is" : "are"} ${formatCount(
        summary.humans,
        "human",
        "humans"
      )} in the scene.`;
    }

    const modelCounts = [
      summary.cities > 0
        ? formatCount(summary.cities, "city model", "city models")
        : "",
      summary.humans > 0
        ? formatCount(summary.humans, "human model", "human models")
        : "",
      summary.cyberpunkModels > 0
        ? formatCount(
            summary.cyberpunkModels,
            "cyberpunk model",
            "cyberpunk models"
          )
        : "",
    ].filter(Boolean);

    if (/\b(model|models)\b/.test(text)) {
      const totalModels =
        summary.cities + summary.humans + summary.cyberpunkModels;

      if (totalModels === 0) {
        return "There are no models in the scene.";
      }

      return `There ${totalModels === 1 ? "is" : "are"} ${joinReadableList(
        modelCounts
      )} in the scene.`;
    }

    if (/\b(building|buildings)\b/.test(text)) {
      return getBuildingAnswer(summary);
    }

    if (/\b(city|cities)\b/.test(text)) {
      return `There ${summary.cities === 1 ? "is" : "are"} ${formatCount(
        summary.cities,
        "city model",
        "city models"
      )} in the scene.`;
    }

    if (/\b(cube|cubes|box|boxes)\b/.test(text)) {
      return `There ${summary.cubes === 1 ? "is" : "are"} ${formatCount(
        summary.cubes,
        "cube",
        "cubes"
      )} in the scene.`;
    }

    if (/\b(sphere|spheres|ball|balls)\b/.test(text)) {
      return `There ${summary.spheres === 1 ? "is" : "are"} ${formatCount(
        summary.spheres,
        "sphere",
        "spheres"
      )} in the scene.`;
    }

    if (/\b(selected|select|current object)\b/.test(text)) {
      if (!summary.selectedObject) {
        return "Nothing is selected right now.";
      }

      return `The selected object is ${
        summary.selectedObject.name ?? summary.selectedObject.type
      }.`;
    }

    const visibleCounts = [
      ...modelCounts,
      summary.cubes > 0 ? formatCount(summary.cubes, "cube", "cubes") : "",
      summary.spheres > 0
        ? formatCount(summary.spheres, "sphere", "spheres")
        : "",
    ].filter(Boolean);

    if (visibleCounts.length === 0) {
      return "I cannot see any objects in the scene right now.";
    }

    return `I can see ${joinReadableList(visibleCounts)} in the scene.`;
  };

  const resolveSpeechAliases = (input: string) => {
    const parts = input
      .toLowerCase()
      .split(/\band\b|,/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return input;
    }

    const resolved = parts.map((part) => speechAliases[part] ?? part);
    return resolved.join(" and ");
  };

  const saveSpeechTraining = () => {
    const phrase = speechAlias.trim().toLowerCase();
    const command = normalizeTrainingCommand(speechCommand);

    if (!phrase || !command) {
      setVoiceStatus("Train speech needs both a phrase and an action.");
      return;
    }

    setSpeechAliases((prev) => ({
      ...prev,
      [phrase]: command,
    }));
    setSpeechAlias("");
    setSpeechCommand("");
    setVoiceStatus(`Learned speech: "${phrase}" means "${command}".`);
  };

  const saveGestureTraining = () => {
    const command = normalizeTrainingCommand(gestureCommand);

    if (recordedGestureSequence.length === 0 || !command) {
      setVoiceStatus("Record a gesture and enter an action first.");
      return;
    }

    setGestureBindings((prev) => [
      ...prev,
      {
        sequence: recordedGestureSequence,
        command,
      },
    ]);
    setRecordedGestureSequence([]);
    setGestureCommand("");
    setIsRecordingGesture(false);
    recentGestures.current = [];
    setVoiceStatus(
      `Learned gesture: ${recordedGestureSequence.join(" -> ")} means "${command}".`
    );
  };

  const handleCommand = (input: string) => {
    const text = input.toLowerCase();
    const parts = text.split(/\band\b|,/);
    let handled = false;

    parts.forEach((cmd) => {
      cmd = cmd.trim();

      if (!cmd) {
        return;
      }

      const commandTarget = getCommandTarget(cmd);
      const shouldAffectAllTargets = Boolean(
        commandTarget && isAllCommand(cmd)
      );

      if (
        cmd.includes("take me to") ||
        cmd.includes("go to") ||
        cmd.includes("focus on") ||
        cmd.includes("show me")
      ) {
        handled = true;

        if (isHumanCommand(cmd)) {
          sceneRef.current?.focusObject("human");
        } else if (cmd.includes("city")) {
          sceneRef.current?.focusObject("city");
        } else if (cmd.includes("cube") || cmd.includes("box")) {
          sceneRef.current?.focusObject("cube");
        } else if (cmd.includes("sphere") || cmd.includes("ball")) {
          sceneRef.current?.focusObject("sphere");
        } else if (cmd.includes("cyberpunk")) {
          sceneRef.current?.focusObject("cyberpunk");
        } else {
          sceneRef.current?.focusAtView(
            isCityDetailCommand(cmd) ? 0.35 : 1
          );
        }
      } else if (cmd.includes("select")) {
        handled = true;

        if (isHumanCommand(cmd)) {
          sceneRef.current?.selectObject("human");
        } else if (cmd.includes("city")) {
          sceneRef.current?.selectObject("city");
        } else if (cmd.includes("cube") || cmd.includes("box")) {
          sceneRef.current?.selectObject("cube");
        } else if (cmd.includes("sphere") || cmd.includes("ball")) {
          sceneRef.current?.selectObject("sphere");
        } else if (cmd.includes("cyberpunk")) {
          sceneRef.current?.selectObject("cyberpunk");
        }
      } else if (
        cmd.includes("rotate") ||
        cmd.includes("turn") ||
        cmd.includes("spin")
      ) {
        handled = true;
        const direction = /\b(left|counterclockwise|anti clockwise)\b/.test(
          cmd
        )
          ? -1
          : 1;
        const degrees = getDegrees(cmd) * direction;
        const axis = getRotationAxis(cmd);

        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.rotateObjectsByTarget(
              commandTarget,
              degrees,
              axis
            );
            setVoiceStatus(
              `Done: rotated all ${commandTarget}s ${Math.abs(degrees)} degrees.`
            );
          } else {
            sceneRef.current?.rotateObjectByTarget(
              commandTarget,
              degrees,
              axis
            );
            setVoiceStatus(
              `Done: rotated the ${commandTarget} ${Math.abs(degrees)} degrees.`
            );
          }
        } else {
          sceneRef.current?.rotateSelectedObject(degrees, axis);
          setVoiceStatus(`Done: rotated the selected object ${Math.abs(degrees)} degrees.`);
        }
      } else if (cmd.includes("add") || cmd.includes("create")) {
        handled = true;
        const count = Math.max(1, Math.min(50, getCommandSteps(cmd)));

        if (cmd.includes("cube") || cmd.includes("box")) {
          Array.from({ length: count }).forEach(() =>
            sceneRef.current?.addObject("cube")
          );
        } else if (cmd.includes("sphere") || cmd.includes("ball")) {
          Array.from({ length: count }).forEach(() =>
            sceneRef.current?.addObject("sphere")
          );
        } else if (cmd.includes("city")) {
          sceneRef.current?.addObjectWithPath(
            "/models/new_york_city.glb",
            "city",
            0.01
          );
        } else if (isHumanCommand(cmd)) {
          if (shouldPlaceAtView(cmd) || count > 1) {
            sceneRef.current?.addModelAtView(
              "human",
              count,
              isCityDetailCommand(cmd)
            );
          } else {
            sceneRef.current?.addObjectWithPath(
              "/models/male_human_skeleton_-_zbrush_-_anatomy_study.glb",
              "human",
              0.35
            );
          }
        } else if (cmd.includes("cyberpunk")) {
          sceneRef.current?.addObjectWithPath(
            "/models/adam_smasher_cyberpunk.glb",
            "cyberpunk",
            0.01
          );
        }
      } else if (cmd.includes("delete") || cmd.includes("remove")) {
        handled = true;

        if (/\b(everything|all objects|whole scene|scene)\b/.test(cmd)) {
          sceneRef.current?.clearObjects();
        } else if (/\b(model|models)\b/.test(cmd)) {
          sceneRef.current?.deleteObjectByType(
            "model",
            getDeleteCount(cmd)
          );
        } else if (cmd.includes("cube") || cmd.includes("box")) {
          sceneRef.current?.deleteObjectByType(
            "cube",
            getDeleteCount(cmd)
          );
        } else if (cmd.includes("sphere") || cmd.includes("ball")) {
          sceneRef.current?.deleteObjectByType(
            "sphere",
            getDeleteCount(cmd)
          );
        } else if (/\b(this|that|selected|it|anything|object)\b/.test(cmd)) {
          sceneRef.current?.deleteSelectedObject();
        } else if (cmd.includes("city")) {
          sceneRef.current?.deleteObjectByName(
            "city",
            getDeleteCount(cmd)
          );
        } else if (isHumanCommand(cmd)) {
          sceneRef.current?.deleteObjectByName(
            "human",
            getDeleteCount(cmd)
          );
        } else if (cmd.includes("cyberpunk")) {
          sceneRef.current?.deleteObjectByName(
            "cyberpunk",
            getDeleteCount(cmd)
          );
        }
      } else if (cmd.includes("zoom in")) {
        handled = true;

        if (
          cmd.includes("zoom into") ||
          cmd.includes("zoom in to") ||
          isCityDetailCommand(cmd)
        ) {
          sceneRef.current?.focusAtView(
            isCityDetailCommand(cmd) ? 0.35 : 1
          );
        } else if (isMaxCommand(cmd)) {
          sceneRef.current?.zoomCameraMax("in");
        } else {
          sceneRef.current?.zoomCamera("in", getCommandSteps(cmd));
        }
      } else if (cmd.includes("zoom out")) {
        handled = true;

        if (isMaxCommand(cmd)) {
          sceneRef.current?.zoomCameraMax("out");
        } else {
          sceneRef.current?.zoomCamera("out", getCommandSteps(cmd));
        }
      } else if (
        cmd.includes("scale up") ||
        cmd.includes("make bigger") ||
        cmd.includes("make large") ||
        cmd.includes("bigger") ||
        cmd.includes("larger") ||
        /\blarge\b/.test(cmd) ||
        cmd.includes("grow")
      ) {
        handled = true;
        const factor = getScaleFactor(cmd, "up");

        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.scaleObjectsByTarget(commandTarget, factor);
            setVoiceStatus(`Done: made all ${commandTarget}s bigger.`);
          } else {
            sceneRef.current?.scaleObjectByTarget(commandTarget, factor);
            setVoiceStatus(`Done: made the ${commandTarget} bigger.`);
          }
        } else {
          sceneRef.current?.scaleObject(factor);
          setVoiceStatus("Done: made the selected object bigger.");
        }
      } else if (
        cmd.includes("scale down") ||
        cmd.includes("make smaller") ||
        cmd.includes("make small") ||
        cmd.includes("smaller") ||
        /\bsmall\b/.test(cmd) ||
        cmd.includes("shorter") ||
        cmd.includes("shrink")
      ) {
        handled = true;
        const factor = getScaleFactor(cmd, "down");

        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.scaleObjectsByTarget(commandTarget, factor);
            setVoiceStatus(`Done: made all ${commandTarget}s smaller.`);
          } else {
            sceneRef.current?.scaleObjectByTarget(commandTarget, factor);
            setVoiceStatus(`Done: made the ${commandTarget} smaller.`);
          }
        } else {
          sceneRef.current?.scaleObject(factor);
          setVoiceStatus("Done: made the selected object smaller.");
        }
      } else if (
        cmd.includes("zoom to") ||
        cmd.includes("zoom into") ||
        cmd.includes("go to") ||
        cmd.includes("show me") ||
        cmd.includes("focus")
      ) {
        handled = true;
        sceneRef.current?.focusAtView(
          isCityDetailCommand(cmd) ? 0.35 : 1
        );
      } else if (cmd.includes("left")) {
        handled = true;
        const distance = -getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, distance, 0, 0);
            setVoiceStatus(`Done: moved all ${commandTarget}s left.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, distance, 0, 0);
            setVoiceStatus(`Done: moved the ${commandTarget} left.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(distance, 0, 0);
          setVoiceStatus("Done: moved the selected object left.");
        }
      } else if (cmd.includes("right")) {
        handled = true;
        const distance = getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, distance, 0, 0);
            setVoiceStatus(`Done: moved all ${commandTarget}s right.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, distance, 0, 0);
            setVoiceStatus(`Done: moved the ${commandTarget} right.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(distance, 0, 0);
          setVoiceStatus("Done: moved the selected object right.");
        }
      } else if (/\bup\b/.test(cmd)) {
        handled = true;
        const distance = getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, 0, distance, 0);
            setVoiceStatus(`Done: moved all ${commandTarget}s up.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, 0, distance, 0);
            setVoiceStatus(`Done: moved the ${commandTarget} up.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(0, distance, 0);
          setVoiceStatus("Done: moved the selected object up.");
        }
      } else if (/\bdown\b/.test(cmd)) {
        handled = true;
        const distance = -getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, 0, distance, 0);
            setVoiceStatus(`Done: moved all ${commandTarget}s down.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, 0, distance, 0);
            setVoiceStatus(`Done: moved the ${commandTarget} down.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(0, distance, 0);
          setVoiceStatus("Done: moved the selected object down.");
        }
      } else if (
        cmd.includes("closer") ||
        cmd.includes("nearer") ||
        cmd.includes("towards me") ||
        cmd.includes("toward me")
      ) {
        handled = true;
        const distance = getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved all ${commandTarget}s closer.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved the ${commandTarget} closer.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(0, 0, distance);
          setVoiceStatus("Done: moved the selected object closer.");
        }
      } else if (
        cmd.includes("far") ||
        cmd.includes("farther") ||
        cmd.includes("away")
      ) {
        handled = true;
        const distance = -getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved all ${commandTarget}s farther.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved the ${commandTarget} farther.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(0, 0, distance);
          setVoiceStatus("Done: moved the selected object farther.");
        }
      } else if (cmd.includes("forward")) {
        handled = true;
        const distance = -getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved all ${commandTarget}s forward.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved the ${commandTarget} forward.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(0, 0, distance);
          setVoiceStatus("Done: moved the selected object forward.");
        }
      } else if (cmd.includes("back")) {
        handled = true;
        const distance = getMoveDistance(cmd, commandTarget);
        if (commandTarget) {
          if (shouldAffectAllTargets) {
            sceneRef.current?.moveObjectsByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved all ${commandTarget}s back.`);
          } else {
            sceneRef.current?.moveObjectByTarget(commandTarget, 0, 0, distance);
            setVoiceStatus(`Done: moved the ${commandTarget} back.`);
          }
        } else {
          sceneRef.current?.moveSelectedObjectBy(0, 0, distance);
          setVoiceStatus("Done: moved the selected object back.");
        }
      }
    });

    return handled;
  };

  const startListening = () => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition ||
      speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setVoiceStatus("Listening now. Say: add human");
    };

    recognition.onaudiostart = () => {
      setVoiceStatus("Microphone is active. Say: add human");
    };

    recognition.onsoundstart = () => {
      setVoiceStatus("Sound detected. Keep speaking.");
    };

    recognition.onspeechstart = () => {
      setVoiceStatus("Speech detected...");
    };

    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      console.log("You said:", text);
      setVoiceStatus(`Heard: "${text}"`);

      await handleUserInput(text);
    };

    recognition.onerror = (event) => {
      console.warn("Speech error:", event.error);
      setVoiceStatus(
        event.error === "no-speech"
          ? "No speech reached Chrome. Check Windows mic input, then click Speak and talk right away."
          : `Speech error: ${event.error}`
      );
    };

    recognition.onend = () => {
      setVoiceStatus((status) =>
        status.startsWith("Listening")
          ? "Listening ended. Click Speak to try again."
          : status
      );
    };

    recognition.start();
  };

  const handleGesture = (gesture: GestureInput) => {
    if (typeof gesture === "object" && gesture.type === "move") {
      if (!isGrabbing.current) return;

      const targetX = (gesture.x - 0.5) * 5;
      const targetY = -(gesture.y - 0.5) * 5;
      const targetZ = -gesture.z * 15;

      smoothPos.current.x =
        smoothPos.current.x * 0.8 + targetX * 0.2;
      smoothPos.current.y =
        smoothPos.current.y * 0.8 + targetY * 0.2;
      smoothPos.current.z =
        (smoothPos.current.z || 0) * 0.8 + targetZ * 0.2;

      sceneRef.current?.moveSelectedObject3D(
        smoothPos.current.x,
        smoothPos.current.y,
        smoothPos.current.z
      );

      return;
    }

    const gestureName = typeof gesture === "string" ? gesture : gesture.type;
    setLastGestureName(gestureName);

    if (isRecordingGesture) {
      setRecordedGestureSequence((prev) => {
        if (prev[prev.length - 1] === gestureName) {
          return prev;
        }

        return [...prev, gestureName].slice(-8);
      });
      return;
    }

    recentGestures.current = [...recentGestures.current, gestureName].slice(
      -8
    );

    const matchedBinding = gestureBindings.find((binding) =>
      gestureBindingMatches(recentGestures.current, binding.sequence)
    );

    if (matchedBinding && !gestureCommandCooldown.current) {
      gestureCommandCooldown.current = true;
      window.setTimeout(() => {
        gestureCommandCooldown.current = false;
      }, 1400);
      recentGestures.current = [];
      setVoiceStatus(
        `Gesture command: "${matchedBinding.command}".`
      );
      void handleUserInput(matchedBinding.command);
      if (viewMode === "train") {
        setViewMode("scene");
      }
      return;
    }

    if (gestureName === "Closed_Fist") {
      isGrabbing.current = true;
    }

    if (gestureName === "Open_Palm") {
      isGrabbing.current = false;
    }

    if (!isGrabbing.current) {
      if (gestureName === "Pointing_Up") {
        sceneRef.current?.addObject("cube");
      }

      if (gestureName === "Thumb_Down") {
        sceneRef.current?.addObject("sphere");
      }
    }
  };

  const handleAICommand = async (inputText: string) => {
    console.log("USER INPUT:", inputText);

    const res = await fetch("/api/ai", {
      method: "POST",
      body: JSON.stringify({ prompt: inputText }),
    });

    const data = await res.json();

    try {
      const commands = JSON.parse(data.commands);

      commands.forEach((cmd: string) => {
        handleCommand(cmd);
      });

      const speech = new SpeechSynthesisUtterance(inputText);
      speechSynthesis.speak(speech);
    } catch (err) {
      console.error("AI parse error:", err);
    }
  };

  const handleUserInput = async (inputText: string) => {
    const text = resolveSpeechAliases(inputText.trim());

    if (!text) {
      return;
    }

    if (isSceneQuestion(text.toLowerCase())) {
      speakAnswer(answerSceneQuestion(text));
      return;
    }

    const commandWasHandled = handleCommand(text);

    if (!commandWasHandled) {
      setVoiceStatus(`Heard: "${text}". Asking AI to interpret it.`);
      await handleAICommand(text);
    }
  };

  const trainingPanel = (
    <section className="training-shell">
        <header className="training-header">
          <div>
            <span className="brand-kicker">Training</span>
            <h1>Teach Jarvis</h1>
          </div>
          <button onClick={() => setViewMode("scene")}>Back to Scene</button>
        </header>

        <section className="training-tabs">
          <button
            className={trainingMode === "speech" ? "active-tab" : ""}
            onClick={() => setTrainingMode("speech")}
          >
            Speech
          </button>
          <button
            className={trainingMode === "gesture" ? "active-tab" : ""}
            onClick={() => setTrainingMode("gesture")}
          >
            Gesture
          </button>
        </section>

        <p className="training-feedback">{voiceStatus}</p>

        {trainingMode === "speech" ? (
          <section className="training-panel">
            <h2>Teach a phrase</h2>
            <p>
              Example: make “mihir” mean “human”, or “troy” mean
              “city”.
            </p>
            <label>
              When I say
              <input
                value={speechAlias}
                onChange={(event) => setSpeechAlias(event.target.value)}
                placeholder="mihir"
              />
            </label>
            <label>
              Do this
              <input
                value={speechCommand}
                onChange={(event) => setSpeechCommand(event.target.value)}
                placeholder="add human"
              />
            </label>
            <button className="run-button" onClick={saveSpeechTraining}>
              Save Speech Training
            </button>

            <div className="training-list">
              <h3>Learned speech</h3>
              {Object.entries(speechAliases).length === 0 ? (
                <p>No speech phrases trained yet.</p>
              ) : (
                Object.entries(speechAliases).map(([phrase, command]) => (
                  <div className="training-row" key={phrase}>
                    <span>{phrase}</span>
                    <strong>{command}</strong>
                    <button
                      onClick={() =>
                        setSpeechAliases((prev) => {
                          const next = { ...prev };
                          delete next[phrase];
                          return next;
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="training-panel gesture-training">
            <h2>Teach a gesture sequence</h2>
            <p>
              Click Start Recording, perform one or more recognized hand
              gestures, stop, then map that sequence to a command.
            </p>

            <div className="gesture-training-layout">
              <div className="gesture-recorder">
                <Gesture onGesture={handleGesture} />
              </div>

              <div className="gesture-training-controls">
                <div className="recording-readout">
                  {recordedGestureSequence.length === 0
                    ? "No gesture recorded yet."
                    : recordedGestureSequence.join(" -> ")}
                </div>
                <div className="training-actions">
                  <button
                    onClick={() => {
                      setRecordedGestureSequence([]);
                      setIsRecordingGesture(true);
                    }}
                  >
                    Start Recording
                  </button>
                  <button onClick={() => setIsRecordingGesture(false)}>
                    Stop Recording
                  </button>
                </div>
                <label>
                  Do this
                  <input
                    value={gestureCommand}
                    onChange={(event) =>
                      setGestureCommand(event.target.value)
                    }
                    placeholder="zoom in, remove selected, add human"
                  />
                </label>
                <button
                  className="run-button"
                  onClick={saveGestureTraining}
                >
                  Save Gesture Training
                </button>
              </div>
            </div>

            <div className="training-list">
              <h3>Learned gestures</h3>
              {gestureBindings.length === 0 ? (
                <p>No gestures trained yet.</p>
              ) : (
                gestureBindings.map((binding, index) => (
                  <div
                    className="training-row"
                    key={`${binding.command}-${index}`}
                  >
                    <span>{binding.sequence.join(" -> ")}</span>
                    <strong>{binding.command}</strong>
                    <button
                      onClick={() =>
                        setGestureBindings((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </section>
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-kicker">Jarvis 3D</span>
          <h1>Scene Command Center</h1>
        </div>

        <div className="quick-actions" aria-label="Quick actions">
          <button onClick={() => sceneRef.current?.addObject("cube")}>
            Add Cube
          </button>
          <button onClick={() => sceneRef.current?.addObject("sphere")}>
            Add Sphere
          </button>
          <button onClick={() => sceneRef.current?.scaleObject(1.2)}>
            Scale Up
          </button>
          <button onClick={() => sceneRef.current?.scaleObject(0.8)}>
            Scale Down
          </button>
          <button onClick={() => sceneRef.current?.addObject("model")}>
            Add Model
          </button>
          <button className="speak-button" onClick={startListening}>
            Speak
          </button>
          <button onClick={() => setViewMode("train")}>Train Me</button>
        </div>
      </header>

      <section className="command-panel" aria-label="Command input">
        <div className="command-copy">
          <strong>Ask or command</strong>
          <span>Add 10 humans over here, remove all cubes, how many humans?</span>
        </div>

        <div className="command-row">
          <input
            id="commandInput"
            placeholder="Type a command or question"
            onKeyDown={async (event) => {
              if (event.key !== "Enter") {
                return;
              }

              const input = event.currentTarget;
              await handleUserInput(input.value);
              input.value = "";
            }}
          />

          <button
            className="run-button"
            onClick={async () => {
              const input = document.getElementById(
                "commandInput"
              ) as HTMLInputElement;

              await handleUserInput(input.value);
              input.value = "";
            }}
          >
            Run
          </button>
        </div>
      </section>

      <section className="scene-viewport" aria-label="3D scene">
        <Scene ref={sceneRef} />

        <div className="scene-status" aria-live="polite">
          <div className="status-grid">
            <span>System</span>
            <strong>Active</strong>
            <span>Gesture</span>
            <strong>Active</strong>
            <span>Voice</span>
            <strong>Active</strong>
            <span>AI</span>
            <strong>Connected</strong>
          </div>
          <p>{voiceStatus}</p>
          <p>
            Last gesture: {lastGestureName} | Trained gestures:{" "}
            {gestureBindings.length}
          </p>
        </div>

        <div className="viewport-hint">
          Orbit, zoom, then say &quot;add human over here&quot;
        </div>

        {viewMode === "scene" && <Gesture onGesture={handleGesture} />}
      </section>

      {viewMode === "train" && (
        <div className="training-overlay">{trainingPanel}</div>
      )}
    </main>
  );
}
