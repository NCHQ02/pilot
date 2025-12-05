/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AiStage, type Slider, type TerraformConfig, TerraformTarget, ControlConfig, SoundConfig, Modulation, ModulationSource, ModulationTarget, CameraData, ViewMode, ShipConfig, ShipModulation, ShipModulationTarget } from '../types';
import { AppContextType } from '../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { EDITMODE } from '../config';

interface SessionState {
  sessionId?: string;
  shaderCode?: string;
  sliders?: Slider[];
  uniforms?: { [key:string]: number };
  cameraControlsEnabled?: boolean;
  terraformConfig?: TerraformConfig;
  controlConfig?: ControlConfig;
  soundConfig?: SoundConfig;
  source?: string;
  shipConfig?: ShipConfig;
  // New Settings
  canvasSize?: string;
  viewMode?: ViewMode;
  isHdEnabled?: boolean;
  isFpsEnabled?: boolean;
  isHudEnabled?: boolean;
  collisionThresholdRed?: number;
  collisionThresholdYellow?: number;
}

// Helpers for URL hash management
const parseHash = (): Record<string, string> => {
    const hash = window.location.hash.substring(1);
    if (!hash) return {};
    const params: Record<string, string> = {};
    hash.split('&').forEach(part => {
        const temp = part.split('=');
        if (temp.length === 2) {
            params[decodeURIComponent(temp[0])] = decodeURIComponent(temp[1]);
        }
    });
    return params;
};

const stringifyHash = (params: Record<string, string>): string => {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
};

// --- Optimized Math Helpers for JS Raymarching ---
// Using typed arrays and strictly avoiding new object creation in loops.

const temp_q = new Float32Array(3);
const temp_q_rot = new Float32Array(3);

const getPlanet1Distance = (p_vec: number[] | Float32Array, uniforms: any, t: number) => {
    const scale = uniforms['slider_fractalScale'] ?? 0.37;
    const rot = uniforms['slider_fractalRotation'] ?? 1.09;
    const pulse = uniforms['slider_fractalPulseStrength'] ?? 0.0;

    // Copy p_vec to temp_q to avoid allocations
    temp_q[0] = p_vec[0];
    temp_q[1] = p_vec[1];
    temp_q[2] = p_vec[2];

    let d = -temp_q[1];
    let i = 58.0;

    while (i > 0.05) {
        const angle = rot + Math.sin(t * 1.0 + temp_q[1] * 5.0) * pulse;
        
        // Inline rotate3D_Y to avoid function call overhead and allocations
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        // q_rotated = rotate3D_Y(angle, temp_q);
        temp_q_rot[0] = temp_q[0] * c + temp_q[2] * s;
        temp_q_rot[1] = temp_q[1];
        temp_q_rot[2] = -temp_q[0] * s + temp_q[2] * c;
        
        // Inline mod, fold, and abs logic
        const two_i = i + i;
        // q_mod = mod(q_rotated, i + i) -> ((v % y) + y) % y
        let qx = ((temp_q_rot[0] % two_i) + two_i) % two_i;
        let qy = ((temp_q_rot[1] % two_i) + two_i) % two_i;
        let qz = ((temp_q_rot[2] % two_i) + two_i) % two_i;

        // q_fold = q_mod - i
        qx -= i;
        qy -= i;
        qz -= i;

        // abs_vec(q_fold)
        qx = Math.abs(qx);
        qy = Math.abs(qy);
        qz = Math.abs(qz);

        // q = (i * 0.9) - abs_fold
        const i9 = i * 0.9;
        temp_q[0] = i9 - qx;
        temp_q[1] = i9 - qy;
        temp_q[2] = i9 - qz;

        d = Math.max(d, Math.min(temp_q[0], temp_q[1], temp_q[2]));
        i *= scale;
    }
    return d;
};


const defaultCanvasSize = '100%';

const defaultSoundConfig: SoundConfig = {
  enabled: true,
  masterVolume: 0.5,
  reverb: {
      enabled: true,
      mix: 0.5,
      decay: 5.0,
      tone: 2000,
  },
  drone: {
      enabled: true,
      gain: 0.4,
      filter: 100,
      pitch: 0,
  },
  atmosphere: {
      enabled: true,
      gain: 0.2,
      texture: 'grit',
  },
  melody: {
      enabled: true,
      gain: 0.3,
      density: 0.4,
      scale: "dorian",
  },
  arp: {
      enabled: true,
      gain: 0.25,
      speed: 1.0,
      octaves: 2,
      filter: 600,
      direction: 'updown', // Default to ping-pong if not modulated
  },
  rhythm: {
      enabled: true,
      gain: 0.4,
      bpm: 60,
      filter: 150,
  },
  // Updated Vangelis-style mappings based on user request
  modulations: [
      // Existing
      { id: '1', enabled: true, source: 'speed', target: 'drone.filter', amount: 0.4 },
      { id: '5', enabled: true, source: 'altitude', target: 'atmosphere.gain', amount: 0.15 },
      // Restored drone pitch modulation - UPDATED to -10% as requested
      { id: '6', enabled: true, source: 'altitude', target: 'drone.pitch', amount: -0.1 },
      
      // New requested mappings
      // "moves up or down based on our up/down heading" -> Pitch controls direction. Positive pitch (looking up) = UP, Negative = DOWN.
      { id: 'new1', enabled: true, source: 'pitch', target: 'arp.direction', amount: 1.5 }, 
      // "speed relates to our speed"
      { id: 'new2', enabled: true, source: 'speed', target: 'arp.speed', amount: 0.8 },
      // "octave range based on how much are we facing up or down"
      { id: 'new3', enabled: true, source: 'pitch', target: 'arp.octaves', amount: 1.0 },
  ]
}

// Modulation Ranges (what "100%" means for each target)
const MOD_RANGES: Record<ModulationTarget, number> = {
    'masterVolume': 1.0,
    'drone.gain': 1.0, 'drone.filter': 2000, 'drone.pitch': 24,
    'atmosphere.gain': 1.0,
    'arp.gain': 1.0, 'arp.speed': 3.0, 'arp.filter': 4000, 'arp.octaves': 3, 'arp.direction': 1.0,
    'rhythm.gain': 1.0, 'rhythm.filter': 2000, 'rhythm.bpm': 100,
    'melody.gain': 1.0, 'melody.density': 1.0,
    'reverb.mix': 1.0, 'reverb.tone': 5000
};

const SHIP_MOD_RANGES: Record<ShipModulationTarget, number> = {
    'complexity': 5,
    'fold1': 0.5,
    'fold2': 0.5,
    'fold3': 1.0,
    'scale': 0.5,
    'stretch': 1.0,
    'taper': 1.0,
    'twist': 1.0,
    'asymmetryX': 1.0,
    'asymmetryY': 1.0,
    'asymmetryZ': 1.0,
    'twistAsymX': 1.0,
    'scaleAsymX': 1.0,
    'fold1AsymX': 0.5,
    'fold2AsymX': 0.5,
};

// Audio Graph Types
interface ReverbNode {
    input: GainNode;
    output: GainNode;
    setTone: (f: number) => void;
}

interface DroneNodes {
    filter: BiquadFilterNode;
    gain: GainNode;
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    baseFreq: number;
}

interface AtmosphereNodes {
    filter: BiquadFilterNode;
    gain: GainNode;
}

interface ArpNodes {
    gain: GainNode;
    filter: BiquadFilterNode;
    delay: DelayNode;
    feedback: GainNode;
}

interface RhythmNodes {
    gain: GainNode;
    filter: BiquadFilterNode;
    delay: DelayNode;
    feedback: GainNode;
}

// Musical Scales
const SCALES = {
    dorian: [62, 64, 65, 67, 69, 71, 72, 74],
    phrygian: [62, 63, 65, 67, 69, 70, 72],
    lydian: [62, 64, 66, 67, 69, 71, 73],
};

const mtof = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

// Calibrated starting position for Planet 1 "true horizon" at -1.49
const INITIAL_CAMERA_POS: [number, number, number] = [0, -1.49, 0];
// Start with a level camera view, compensated for FLIGHT_PITCH_OFFSET
const INITIAL_CAMERA_ROT: [number, number] = [0.1, 0.0];

export const useAppStore = (): Omit<AppContextType, keyof ReturnType<typeof useDummyHandlers>> => {
  const [activeShaderCode, setActiveShaderCode] = useState<string>('');
  const [sliders, setSliders] = useState<Slider[]>([]);
  const [uniforms, setUniforms] = useState<{ [key: string]: number }>({});
  const uniformsRef = useRef(uniforms); // Stable ref for game loop
  
  const cameraRef = useRef<CameraData>({
      position: [...INITIAL_CAMERA_POS],
      rotation: [...INITIAL_CAMERA_ROT],
      roll: 0
  });
  
  // Separate ref for what actually gets rendered (allows for chase cam offset)
  const renderCameraRef = useRef<CameraData>({
      position: [...INITIAL_CAMERA_POS],
      rotation: [...INITIAL_CAMERA_ROT],
      roll: 0
  });

  const [cameraControlsEnabled, setCameraControlsEnabled] = useState<boolean>(false);
  const [viewMode, setViewModeState] = useState<ViewMode>('chase');
  const [viewModeTransition, setViewModeTransition] = useState(1.0); // 0 = cockpit, 1 = chase
  const viewModeTransitionRef = useRef({ current: 1.0, target: 1.0 });

  const keysPressed = useRef(new Set<string>());
  const [pressedKeys, setPressedKeys] = useState(new Set<string>());
  const cameraVelocityRef = useRef<[number, number, number]>([0, 0, 0]);
  const cameraAngularVelocityRef = useRef<[number, number]>([0, 0]);
  const [canvasSize, setCanvasSize] = useState<string>(defaultCanvasSize);
  const [isControlsOpen, setIsControlsOpen] = useState<boolean>(false);
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [isHdEnabled, setIsHdEnabled] = useState<boolean>(false);
  const [isFpsEnabled, setIsFpsEnabled] = useState<boolean>(false);
  // HUD enabled by default per user request
  const [isHudEnabled, setIsHudEnabled] = useState<boolean>(true);
  
  const [controlConfig, setControlConfig] = useState<ControlConfig>({});
  const controlConfigRef = useRef(controlConfig); // Stable ref for game loop

  const [sessionSource, setSessionSource] = useState<string | null>(null);
  
  // Physics State
  const [isMoving, setIsMoving] = useState(false);
  const isMovingRef = useRef(false);
  const previousSpeedRef = useRef(0); 

  const [collisionState, setCollisionState] = useState<'none' | 'approaching' | 'colliding'>('none');
  const collisionStateRef = useRef<'none' | 'approaching' | 'colliding'>('none');
  const [collisionProximity, setCollisionProximity] = useState(0);
  const collisionProximityRef = useRef(0);
  const collisionCooldownRef = useRef(0);
  
  const [collisionThresholdRed, setCollisionThresholdRed] = useState(0.002);
  const collisionThresholdRedRef = useRef(0.002);
  const [collisionThresholdYellow, setCollisionThresholdYellow] = useState(0.02);
  const collisionThresholdYellowRef = useRef(0.02);

  // Debugging
  const [debugElevation, setDebugElevation] = useState(0);
  const [debugArpVolume, setDebugArpVolume] = useState(0);
  const [debugCameraAltitude, setDebugCameraAltitude] = useState(0);
  const [debugCameraPitch, setDebugCameraPitch] = useState(0);
  const [debugCameraDistance, setDebugCameraDistance] = useState(0);
  const debugCollisionPointRef = useRef<[number, number, number]>([0, 0, 0]);
  const debugRayStartPointRef = useRef<[number, number, number]>([0, 0, 0]);
  const debugRayEndPointRef = useRef<[number, number, number]>([0, 0, 0]);
  const debugCollisionDistanceRef = useRef(0);

  const [currentSessionId, setCurrentSessionId] = useState<string>('1');
  const currentSessionIdRef = useRef(currentSessionId);

  const defaultUniformsRef = useRef<{ [key: string]: number }>({});
  
  const terraform_currentVelocity = useRef<{ [key: string]: number }>({});
  const terraform_targetVelocity = useRef<{ [key: string]: number }>({});
  const isTerraformingHeld = useRef(false);

  const [terraformPower, setTerraformPower] = useState(1.0);
  const terraformPowerRef = useRef(1.0);
  const [terraformConfig, setTerraformConfig] = useState<TerraformConfig | null>(null);
  const terraformConfigRef = useRef(terraformConfig); // Stable ref for game loop

  // NEW MUSICAL AUDIO STATE
  const [soundConfig, setSoundConfig] = useState<SoundConfig>(defaultSoundConfig);
  const soundConfigRef = useRef(soundConfig); // Stable ref for game loop

  // FRACTAL SHIP STATE
  const [shipConfig, setShipConfig] = useState<ShipConfig>({
      complexity: 6,
      fold1: 0.75,
      fold2: 0.85,
      fold3: 0.15,
      scale: 1.65,
      stretch: 1.2,
      taper: 0.0,
      twist: 0.0,
      asymmetryX: 0.0,
      asymmetryY: 0.0,
      asymmetryZ: 0.0,
      twistAsymX: 0.0,
      scaleAsymX: 0.0,
      fold1AsymX: 0.0,
      fold2AsymX: 0.0,
      chaseDistance: 6.5,
      chaseVerticalOffset: 0.0,
      pitchOffset: 0.0,
      generalScale: 1.0,
      translucency: 1.0,
      modulations: []
  });
  const shipConfigRef = useRef(shipConfig);
  // Ensure effectiveShipConfigRef matches AppContextType by explicitly omitting 'modulations'
  const { modulations: _initMods, ...initEffective } = shipConfig;
  const effectiveShipConfigRef = useRef<Omit<ShipConfig, 'modulations'>>(initEffective);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
      masterGain: GainNode;
      reverb?: ReverbNode;
      drone?: DroneNodes;
      atmosphere?: AtmosphereNodes;
      arp?: ArpNodes;
      rhythm?: RhythmNodes;
  } | null>(null);

  // Live state for sequencer parameters
  const liveAudioStateRef = useRef({
      rhythmBpm: defaultSoundConfig.rhythm.bpm,
      arpSpeed: defaultSoundConfig.arp.speed,
      arpOctaves: defaultSoundConfig.arp.octaves as number,
      melodyDensity: defaultSoundConfig.melody.density
  });
  
  // Sequencing Refs
  const nextMelodyTimeRef = useRef<number>(0);
  const nextArpTimeRef = useRef<number>(0);
  const nextRhythmTimeRef = useRef<number>(0);
  const arpNoteIndexRef = useRef<number>(0);
  const arpInternalDirectionRef = useRef<number>(1); // 1 for up, -1 for down

  // Performance Refs
  const cameraRollRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accumulatedTimeRef = useRef(0);
  const slidersRef = useRef(sliders);

  // OPTIMIZATION: Pre-allocate objects to avoid GC in game loop
  const audioInputsRef = useRef<Record<ModulationSource, number>>({
    speed: 0, acceleration: 0, altitude: 0, descent: 0,
    turning: 0, turningSigned: 0, heading: 0, pitch: 0, proximity: 0, time: 0
  });
  const audioTargetAccumulatorsRef = useRef<Record<ModulationTarget, number>>({
    'masterVolume': 0, 'drone.gain': 0, 'drone.filter': 0, 'drone.pitch': 0,
    'atmosphere.gain': 0, 'arp.gain': 0, 'arp.speed': 0, 'arp.filter': 0, 'arp.octaves': 0, 'arp.direction': 0,
    'rhythm.gain': 0, 'rhythm.filter': 0, 'rhythm.bpm': 0, 'melody.gain': 0, 'melody.density': 0,
    'reverb.mix': 0, 'reverb.tone': 0
  });
  // Use typed array for better performance in math heavy loop
  const tempProposedPosRef = useRef(new Float32Array(3));
  const tempCollisionTestPosRef = useRef(new Float32Array(3));


  // --- SYNC REFS ---
  useEffect(() => { uniformsRef.current = uniforms; }, [uniforms]);
  useEffect(() => { controlConfigRef.current = controlConfig; }, [controlConfig]);
  useEffect(() => { soundConfigRef.current = soundConfig; }, [soundConfig]);
  useEffect(() => { shipConfigRef.current = shipConfig; }, [shipConfig]);
  useEffect(() => { terraformConfigRef.current = terraformConfig; }, [terraformConfig]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { slidersRef.current = sliders; }, [sliders]);
  
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    viewModeTransitionRef.current.target = mode === 'chase' ? 1.0 : 0.0;
  }, []);

  // --- AUDIO SYSTEM ---

  const createNoiseBuffer = (ctx: AudioContext, duration: number): AudioBuffer => {
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
          const output = buffer.getChannelData(channel);
          for (let i = 0; i < bufferSize; i++) {
              output[i] = Math.random() * 2 - 1;
          }
      }
      return buffer;
  };

  const cleanupAudio = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(err => console.warn("Audio close error:", err));
    }
    audioContextRef.current = null;
    audioNodesRef.current = null;
  }, []);

  const initAudio = useCallback(() => {
      if (audioContextRef.current) return;
      
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      audioContextRef.current = ctx;

      // Use latest soundConfig from ref or state
      const cfg = soundConfigRef.current;

      liveAudioStateRef.current = {
          rhythmBpm: cfg.rhythm.bpm,
          arpSpeed: cfg.arp.speed,
          arpOctaves: cfg.arp.octaves,
          melodyDensity: cfg.melody.density
      };

      const masterGain = ctx.createGain();
      masterGain.gain.value = cfg.masterVolume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2.0;
      limiter.ratio.value = 12;
      masterGain.connect(limiter);
      limiter.connect(ctx.destination);

      const nodes: any = { masterGain };

      // 1. Reverb
      let reverbNode: ReverbNode | undefined;
      if (cfg.reverb.enabled) {
          reverbNode = {
            input: ctx.createGain(),
            output: ctx.createGain(),
            setTone: (f) => { if(verbFilter) verbFilter.frequency.setTargetAtTime(f, ctx.currentTime, 0.1) }
          };
          const convolver = ctx.createConvolver();
          const duration = cfg.reverb.decay;
          const length = ctx.sampleRate * duration;
          const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
          for (let i = 0; i < length; i++) {
             const env = Math.pow(1 - i / length, 4);
             impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * env * 0.8;
             impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * env * 0.8;
          }
          convolver.buffer = impulse;
          const verbFilter = ctx.createBiquadFilter();
          verbFilter.type = 'lowpass';
          verbFilter.frequency.value = cfg.reverb.tone;
          reverbNode.input.connect(verbFilter);
          verbFilter.connect(convolver);
          convolver.connect(reverbNode.output);
          reverbNode.output.connect(masterGain);
          reverbNode.output.gain.value = cfg.reverb.mix;
          nodes.reverb = reverbNode;
      }

      // 2. Drone
      if (cfg.drone.enabled) {
          const droneGain = ctx.createGain();
          droneGain.gain.value = cfg.drone.gain;
          const droneFilter = ctx.createBiquadFilter();
          droneFilter.type = 'lowpass';
          droneFilter.frequency.value = cfg.drone.filter;
          droneFilter.Q.value = 0.5;
          const baseFreq = mtof(38); // D2
          const osc1 = ctx.createOscillator();
          osc1.type = 'sawtooth';
          osc1.frequency.value = baseFreq;
          const osc2 = ctx.createOscillator();
          osc2.type = 'sawtooth';
          osc2.frequency.value = baseFreq * 1.01;
          osc1.connect(droneFilter);
          osc2.connect(droneFilter);
          droneFilter.connect(droneGain);
          droneGain.connect(masterGain);
          if (reverbNode) droneGain.connect(reverbNode.input);
          osc1.start();
          osc2.start();
          nodes.drone = { filter: droneFilter, gain: droneGain, osc1, osc2, baseFreq };
      }

      // 3. Atmosphere (Improved to be deeper, less hissy)
      if (cfg.atmosphere.enabled) {
          const atmGain = ctx.createGain();
          atmGain.gain.value = cfg.atmosphere.gain;
          const atmFilter = ctx.createBiquadFilter();
          atmFilter.type = 'lowpass'; // Changed from highpass to lowpass for deeper rumbling wind
          atmFilter.frequency.value = 400;
          atmFilter.Q.value = 0.2;
          const noise = ctx.createBufferSource();
          noise.buffer = createNoiseBuffer(ctx, 8);
          noise.loop = true;
          noise.start();
          noise.connect(atmFilter);
          atmFilter.connect(atmGain);
          atmGain.connect(masterGain);
          if (reverbNode) {
              const verbSend = ctx.createGain();
              verbSend.gain.value = 0.3;
              atmGain.connect(verbSend);
              verbSend.connect(reverbNode.input);
          }
          nodes.atmosphere = { filter: atmFilter, gain: atmGain };
      }

      // 4. Arp
      if (cfg.arp.enabled) {
          const arpGain = ctx.createGain();
          arpGain.gain.value = cfg.arp.gain;
          const arpFilter = ctx.createBiquadFilter();
          arpFilter.type = 'lowpass';
          arpFilter.Q.value = 3.0;
          arpFilter.frequency.value = cfg.arp.filter;
          const delayL = ctx.createDelay();
          const delayR = ctx.createDelay();
          delayL.delayTime.value = 0.3;
          delayR.delayTime.value = 0.45;
          const feedback = ctx.createGain();
          feedback.gain.value = 0.4;
          const delayMerger = ctx.createChannelMerger(2);
          arpFilter.connect(arpGain);
          arpGain.connect(masterGain);
          arpGain.connect(delayL);
          arpGain.connect(delayR);
          delayL.connect(feedback);
          delayR.connect(feedback);
          feedback.connect(delayL);
          delayL.connect(delayMerger, 0, 0);
          delayR.connect(delayMerger, 0, 1);
          delayMerger.connect(masterGain);
          if (reverbNode) arpGain.connect(reverbNode.input);
          nodes.arp = { gain: arpGain, filter: arpFilter, delay: delayL, feedback };
      }

      // 5. Rhythm
      if (cfg.rhythm.enabled) {
          const rhyGain = ctx.createGain();
          rhyGain.gain.value = cfg.rhythm.gain;
          // No fixed filter here, handled per hit now for the Tom sound
          rhyGain.connect(masterGain);
          if (reverbNode) {
               const rhyVerbSend = ctx.createGain();
               rhyVerbSend.gain.value = 0.6; // Heavier reverb send for Blade Runner toms
               rhyGain.connect(rhyVerbSend);
               rhyVerbSend.connect(reverbNode.input);
          }
          nodes.rhythm = { gain: rhyGain };
      }

      audioNodesRef.current = nodes;
      const now = ctx.currentTime;
      nextMelodyTimeRef.current = now + 2; 
      nextArpTimeRef.current = now + 0.5;
      nextRhythmTimeRef.current = now + 0.1;

  }, []); // No dependencies needed for initAudio

  const playGenerativeNote = useCallback((time: number) => {
      const ctx = audioContextRef.current;
      const nodes = audioNodesRef.current;
      const cfg = soundConfigRef.current;
      if (!ctx || !nodes || !cfg.melody.enabled) return;

      const scale = SCALES[cfg.melody.scale];
      const noteIndex = Math.floor(Math.random() * scale.length);
      const octaveOffset = Math.random() > 0.7 ? 12 : 0;
      const freq = mtof(scale[noteIndex] + octaveOffset);

      const duration = 3.0 + Math.random() * 5.0; 
      const attack = duration * 0.4;
      const release = 6.0;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = freq / 2;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2.0;
      filter.frequency.setValueAtTime(200, time);
      filter.frequency.exponentialRampToValueAtTime(2500, time + attack);
      filter.frequency.exponentialRampToValueAtTime(150, time + duration + release);

      const vca = ctx.createGain();
      vca.gain.setValueAtTime(0, time);
      vca.gain.linearRampToValueAtTime(cfg.melody.gain * (0.7 + Math.random() * 0.3), time + attack);
      vca.gain.setValueAtTime(cfg.melody.gain * 0.6, time + duration);
      vca.gain.exponentialRampToValueAtTime(0.001, time + duration + release);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(vca);
      vca.connect(nodes.masterGain);
      if (nodes.reverb) vca.connect(nodes.reverb.input);

      osc.start(time); subOsc.start(time);
      osc.stop(time + duration + release + 1); subOsc.stop(time + duration + release + 1);

      setTimeout(() => { osc.disconnect(); subOsc.disconnect(); filter.disconnect(); vca.disconnect(); }, (duration + release + 2) * 1000);
  }, []);

  const playArpNote = useCallback((time: number) => {
      const ctx = audioContextRef.current;
      const nodes = audioNodesRef.current;
      const cfg = soundConfigRef.current;
      if (!ctx || !nodes || !nodes.arp || !cfg.arp.enabled) return;

      const scale = SCALES[cfg.melody.scale];
      const currentOctaves = Math.max(1, Math.round(liveAudioStateRef.current.arpOctaves));
      const totalNotes = scale.length * currentOctaves;
      
      // Determine direction: check modulation first, fallback to config
      let direction = cfg.arp.direction ?? 'updown';
      const dirMod = audioTargetAccumulatorsRef.current['arp.direction'];
      // If significantly modulated positive, go UP. Negative, go DOWN.
      if (dirMod > 0.3) direction = 'up';
      else if (dirMod < -0.3) direction = 'down';

      // Update index based on direction
      if (direction === 'up') {
          arpNoteIndexRef.current = (arpNoteIndexRef.current + 1) % totalNotes;
      } else if (direction === 'down') {
          arpNoteIndexRef.current = (arpNoteIndexRef.current - 1 + totalNotes) % totalNotes;
      } else if (direction === 'random') {
          arpNoteIndexRef.current = Math.floor(Math.random() * totalNotes);
      } else if (direction === 'updown') {
          arpNoteIndexRef.current += arpInternalDirectionRef.current;
          if (arpNoteIndexRef.current >= totalNotes - 1) {
              arpNoteIndexRef.current = totalNotes - 1;
              arpInternalDirectionRef.current = -1;
          } else if (arpNoteIndexRef.current <= 0) {
              arpNoteIndexRef.current = 0;
              arpInternalDirectionRef.current = 1;
          }
      }

      // Clamp index in case octaves reduced while index was high
      arpNoteIndexRef.current = Math.max(0, Math.min(totalNotes - 1, arpNoteIndexRef.current));

      const scaleIndex = arpNoteIndexRef.current % scale.length;
      const octave = Math.floor(arpNoteIndexRef.current / scale.length);
      const freq = mtof(scale[scaleIndex] + (octave + 1) * 12);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.8, time + 0.01);
      env.gain.exponentialRampToValueAtTime(0.05, time + 0.3);

      osc.connect(nodes.arp.filter);
      osc.disconnect();
      osc.connect(env);
      env.connect(nodes.arp.filter);

      osc.start(time);
      osc.stop(time + 0.4);
      setTimeout(() => { osc.disconnect(); env.disconnect(); }, 500);
  }, []);

  const playRhythm = useCallback((time: number) => {
      const ctx = audioContextRef.current;
      const nodes = audioNodesRef.current;
      const cfg = soundConfigRef.current;
      if (!ctx || !nodes || !nodes.rhythm || !cfg.rhythm.enabled) return;

      // Synthesized Tom for Blade Runner feel
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      // Pitch sweep downwards
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(30, time + 0.2);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(1.0, time + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);

      // Optional click for attack
      const clickOsc = ctx.createOscillator();
      clickOsc.type = 'square';
      clickOsc.frequency.value = 2000;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.1, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.01);

      osc.connect(gain);
      clickOsc.connect(clickGain);
      clickGain.connect(gain);

      gain.connect(nodes.rhythm.gain);

      osc.start(time); clickOsc.start(time);
      osc.stop(time + 0.5); clickOsc.stop(time + 0.5);
      setTimeout(() => { osc.disconnect(); clickOsc.disconnect(); clickGain.disconnect(); gain.disconnect(); }, 600);
  }, []);

  const playCollisionSound = useCallback(() => {
      const ctx = audioContextRef.current;
      const nodes = audioNodesRef.current;
      const cfg = soundConfigRef.current;
      if (!ctx || !nodes || !cfg.enabled) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8 * cfg.masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      
      osc.connect(gain);
      gain.connect(nodes.masterGain);
      
      osc.start(now);
      osc.stop(now + 0.4);
      setTimeout(() => { osc.disconnect(); gain.disconnect(); }, 500);
  }, []);


  const applySessionState = useCallback((sessionState: SessionState) => {
    cleanupAudio();
    const loadedSessionId = sessionState.sessionId ?? 'local-file';
    const loadedShader = sessionState.shaderCode ?? '';
    const loadedSliders = (sessionState.sliders ?? []).filter(slider => slider.variableName !== 'slider_cameraXRotation');
    const loadedUniforms = sessionState.uniforms ?? {};
    const loadedCameraControls = sessionState.cameraControlsEnabled ?? false;
    const loadedTerraformConfig = sessionState.terraformConfig ?? { targets: [] };
    const loadedControlConfig = sessionState.controlConfig ?? {};
    const loadedSource = sessionState.source ?? null;
    const loadedSoundConfig = sessionState.soundConfig;
    const mergedSoundConfig: SoundConfig = {
        ...defaultSoundConfig,
        ...loadedSoundConfig,
        reverb: { ...defaultSoundConfig.reverb, ...(loadedSoundConfig?.reverb || {}) },
        drone: { ...defaultSoundConfig.drone, ...(loadedSoundConfig?.drone || {}) },
        atmosphere: { ...defaultSoundConfig.atmosphere, ...(loadedSoundConfig?.atmosphere || {}) },
        melody: { ...defaultSoundConfig.melody, ...(loadedSoundConfig?.melody || {}) },
        arp: { ...defaultSoundConfig.arp, ...(loadedSoundConfig?.arp || {}) },
        rhythm: { ...defaultSoundConfig.rhythm, ...(loadedSoundConfig?.rhythm || {}) },
        modulations: loadedSoundConfig?.modulations || defaultSoundConfig.modulations,
    };

    const defaultShipConfig: ShipConfig = {
        complexity: 6,
        fold1: 0.75,
        fold2: 0.85,
        fold3: 0.15,
        scale: 1.65,
        stretch: 1.2,
        taper: 0.0,
        twist: 0.0,
        asymmetryX: 0.0,
        asymmetryY: 0.0,
        asymmetryZ: 0.0,
        twistAsymX: 0.0,
        scaleAsymX: 0.0,
        fold1AsymX: 0.0,
        fold2AsymX: 0.0,
        chaseDistance: 6.5,
        chaseVerticalOffset: 0.0,
        pitchOffset: 0.0,
        generalScale: 1.0,
        translucency: 1.0,
        modulations: []
    };
    const loadedShipConfig = { ...defaultShipConfig, ...(sessionState.shipConfig ?? {})};


    setCurrentSessionId(loadedSessionId);
    setActiveShaderCode(loadedShader);
    setSliders(loadedSliders);
    setCameraControlsEnabled(loadedCameraControls);
    setTerraformConfig(loadedTerraformConfig);
    setControlConfig(loadedControlConfig);
    setSessionSource(loadedSource);
    setSoundConfig(mergedSoundConfig);
    setUniforms(loadedUniforms);
    setShipConfig(loadedShipConfig);
    
    // Load new settings, defaulting if not present in old save files
    setCanvasSize(sessionState.canvasSize ?? defaultCanvasSize);
    setViewMode(sessionState.viewMode ?? 'chase');
    setIsHdEnabled(sessionState.isHdEnabled ?? false);
    setIsFpsEnabled(sessionState.isFpsEnabled ?? false);
    setIsHudEnabled(sessionState.isHudEnabled ?? true);
    setCollisionThresholdRed(sessionState.collisionThresholdRed ?? 0.002);
    setCollisionThresholdYellow(sessionState.collisionThresholdYellow ?? 0.02);

    defaultUniformsRef.current = { ...loadedUniforms };
    
    cameraRef.current = { position: [...INITIAL_CAMERA_POS], rotation: [...INITIAL_CAMERA_ROT], roll: 0 };
    renderCameraRef.current = { position: [...INITIAL_CAMERA_POS], rotation: [...INITIAL_CAMERA_ROT], roll: 0 };

    setCollisionState('none');
    collisionStateRef.current = 'none';
    setCollisionProximity(0);
    collisionProximityRef.current = 0;
    previousSpeedRef.current = 0;

  }, [cleanupAudio, setViewMode]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`./sessions/shader-session-${sessionId}.json`);
      if (!response.ok) throw new Error(`Session file not found: ${sessionId}`);
      const sessionState: SessionState = await response.json();
      applySessionState(sessionState);
      
      const hashParams = parseHash();
      // Override canvas size from hash if present, otherwise keep what applySessionState set
      if (hashParams.canvasSize) setCanvasSize(hashParams.canvasSize);

      const initialUniforms = { ...(sessionState.uniforms ?? {}) };
      (sessionState.sliders ?? []).forEach(slider => {
        if (hashParams[slider.variableName]) {
          const val = parseFloat(hashParams[slider.variableName]);
          if (!isNaN(val)) initialUniforms[slider.variableName] = Math.max(slider.min, Math.min(slider.max, val));
        }
      });
      setUniforms(initialUniforms);
    } catch (err) {
      console.error(`Failed to load session ${sessionId}:`, err);
      if (sessionId !== '1') window.location.hash = '#planet=1';
    }
  }, [applySessionState]);

  useEffect(() => {
    const hashParams = parseHash();
    loadSession(hashParams.planet || '1');
    return () => cleanupAudio();
  }, [loadSession, cleanupAudio]);
  
  const handleUniformsCommit = useCallback(() => {}, []);

  useEffect(() => {
    const handleHashChange = () => {
        const hashParams = parseHash();
        const newSessionId = hashParams.planet || '1';
        if (newSessionId !== currentSessionId) {
            loadSession(newSessionId);
            return;
        }
        setCanvasSize(hashParams.canvasSize || defaultCanvasSize);
        setUniforms(prev => {
            const next = { ...prev };
            let changed = false;
            sliders.forEach(slider => {
                const def = defaultUniformsRef.current[slider.variableName] ?? slider.defaultValue;
                let val = def;
                if (hashParams[slider.variableName]) {
                    const parsed = parseFloat(hashParams[slider.variableName]);
                    if (!isNaN(val)) val = parsed;
                }
                val = Math.max(slider.min, Math.min(slider.max, val));
                if (next[slider.variableName] !== val) {
                    next[slider.variableName] = val;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [sliders, currentSessionId, loadSession]);

  const pressKey = useCallback((key: string) => {
    // Check explicitly against the ref to avoid stale closure issues
    if (currentSessionIdRef.current === '1' && !audioContextRef.current && soundConfigRef.current.enabled) {
        initAudio();
        audioContextRef.current?.resume();
    }
    const lowerKey = key.toLowerCase();
    keysPressed.current.add(lowerKey);
    setPressedKeys(prev => new Set(prev).add(lowerKey));
  }, [initAudio]);

  const releaseKey = useCallback((key: string) => {
    const lowerKey = key.toLowerCase();
    keysPressed.current.delete(lowerKey);
    setPressedKeys(prev => {
      const next = new Set(prev);
      next.delete(lowerKey);
      return next;
    });
  }, []);

  const handleTerraformPress = useCallback(() => {
    isTerraformingHeld.current = true;
    const config = terraformConfigRef.current;
    if (!config) return;
    config.targets.forEach(target => {
        if (target.probability !== undefined && Math.random() > target.probability) return;
        const key = target.variableName;
        if (terraform_currentVelocity.current[key] === undefined) terraform_currentVelocity.current[key] = 0;
        if (target.type === 'velocity') terraform_targetVelocity.current[key] = (Math.random() - 0.5) * target.magnitude;
    });
  }, []);

  const handleTerraformRelease = useCallback(() => {
    isTerraformingHeld.current = false;
    Object.keys(terraform_targetVelocity.current).forEach(key => terraform_targetVelocity.current[key] = 0);
  }, []);

  const handleTerraformConfigChange = useCallback((variableName: string, property: keyof TerraformTarget | 'enabled', value: number | boolean) => {
    setTerraformConfig(prev => {
        const targets = prev?.targets ?? [];
        const idx = targets.findIndex(t => t.variableName === variableName);
        if (property === 'enabled') {
            if (value === true && idx === -1) return { targets: [...targets, { variableName, type: 'velocity', magnitude: 0.01, probability: 1.0 }] };
            if (value === false && idx !== -1) return { targets: targets.filter(t => t.variableName !== variableName) };
            return prev;
        } else if (idx !== -1) {
            const newTargets = [...targets];
            newTargets[idx] = { ...newTargets[idx], [property]: value };
            return { targets: newTargets };
        }
        return prev;
    });
  }, []);
  
  const handleControlConfigChange = useCallback((key: keyof ControlConfig, value: boolean | number) => {
    setControlConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSessionSelect = useCallback((sessionId: string) => {
    const hash = parseHash();
    hash['planet'] = sessionId;
    window.location.hash = stringifyHash(hash);
  }, []);
  
  const handleSourceChange = useCallback((source: string) => setSessionSource(source), []);

  const handleSoundConfigChange = useCallback((key: string, value: any) => {
    if (key === 'enabled' && value === true) setTimeout(initAudio, 0);
    setSoundConfig(prev => {
        const path = key.split('.');
        const newConfig = JSON.parse(JSON.stringify(prev));
        let current = newConfig;
        for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
        current[path[path.length - 1]] = value;
        return newConfig;
    });
    
    if (audioNodesRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        const nodes = audioNodesRef.current;
        // Immediate volume cuts when disabling
        if (key === 'masterVolume') nodes.masterGain.gain.setTargetAtTime(value, now, 0.1);
        if (key === 'reverb.enabled' && nodes.reverb) nodes.reverb.output.gain.setTargetAtTime(value ? soundConfigRef.current.reverb.mix : 0, now, 0.1);
        if (key === 'reverb.mix' && nodes.reverb && soundConfigRef.current.reverb.enabled) nodes.reverb.output.gain.setTargetAtTime(value, now, 0.1);
        if (key === 'drone.enabled' && nodes.drone) nodes.drone.gain.gain.setTargetAtTime(value ? soundConfigRef.current.drone.gain : 0, now, 0.1);
        if (key === 'drone.gain' && nodes.drone && soundConfigRef.current.drone.enabled) nodes.drone.gain.gain.setTargetAtTime(value, now, 0.1);
        if (key === 'atmosphere.enabled' && nodes.atmosphere) nodes.atmosphere.gain.gain.setTargetAtTime(value ? soundConfigRef.current.atmosphere.gain : 0, now, 0.5);
        if (key === 'atmosphere.gain' && nodes.atmosphere && soundConfigRef.current.atmosphere.enabled) nodes.atmosphere.gain.gain.setTargetAtTime(value, now, 0.5);
        if (key === 'arp.enabled' && nodes.arp) nodes.arp.gain.gain.setTargetAtTime(value ? soundConfigRef.current.arp.gain : 0, now, 0.1);
        if (key === 'arp.gain' && nodes.arp && soundConfigRef.current.arp.enabled) nodes.arp.gain.gain.setTargetAtTime(value, now, 0.1);
        if (key === 'rhythm.enabled' && nodes.rhythm) nodes.rhythm.gain.gain.setTargetAtTime(value ? soundConfigRef.current.rhythm.gain : 0, now, 0.1);
        if (key === 'rhythm.gain' && nodes.rhythm && soundConfigRef.current.rhythm.enabled) nodes.rhythm.gain.gain.setTargetAtTime(value, now, 0.1);
    }
  }, [initAudio]);

  const addSoundModulation = useCallback((Modulation: Modulation) => {
       setSoundConfig(prev => ({
           ...prev,
           modulations: [...(prev.modulations || []), { ...Modulation, id: uuidv4(), enabled: true }]
       }));
  }, []);

  const updateSoundModulation = useCallback((id: string, newConfig: Partial<Modulation>) => {
      setSoundConfig(prev => ({
          ...prev,
          modulations: (prev.modulations || []).map(mod => mod.id === id ? { ...mod, ...newConfig } : mod)
      }));
  }, []);

  const removeSoundModulation = useCallback((id: string) => {
      setSoundConfig(prev => ({
          ...prev,
          modulations: (prev.modulations || []).filter(mod => mod.id !== id)
      }));
  }, []);

  const getSessionState = useCallback((): SessionState => {
      return {
          sessionId: currentSessionId,
          shaderCode: activeShaderCode,
          sliders,
          uniforms,
          cameraControlsEnabled,
          terraformConfig,
          controlConfig,
          soundConfig,
          source: sessionSource ?? undefined,
          shipConfig,
          canvasSize,
          viewMode,
          isHdEnabled,
          isFpsEnabled,
          isHudEnabled,
          collisionThresholdRed,
          collisionThresholdYellow
      };
  }, [currentSessionId, activeShaderCode, sliders, uniforms, cameraControlsEnabled, terraformConfig, controlConfig, soundConfig, sessionSource, shipConfig, canvasSize, viewMode, isHdEnabled, isFpsEnabled, isHudEnabled, collisionThresholdRed, collisionThresholdYellow]);

  const handleSaveSessionToFile = useCallback(() => {
    const data = getSessionState();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-shader-pilot-session.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getSessionState]);

  // Expose a standardized JSON stringifier for the UI to use
  const getSessionStateJson = useCallback(() => JSON.stringify(getSessionState(), null, 2), [getSessionState]);

  const handleLoadSessionFromFile = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        applySessionState(JSON.parse(ev.target?.result as string));
        if(e.target) e.target.value = '';
      } catch (err) { console.error("Failed to parse session file:", err); }
    };
    reader.readAsText(file);
  }, [applySessionState]);

  const handleShipConfigChange = useCallback((key: keyof ShipConfig, value: number) => {
      setShipConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const addShipModulation = useCallback((Modulation: ShipModulation) => {
        setShipConfig(prev => ({
            ...prev,
            modulations: [...(prev.modulations || []), { ...Modulation, id: uuidv4(), enabled: true }]
        }));
   }, []);
 
   const updateShipModulation = useCallback((id: string, newConfig: Partial<ShipModulation>) => {
       setShipConfig(prev => ({
           ...prev,
           modulations: (prev.modulations || []).map(mod => mod.id === id ? { ...mod, ...newConfig } : mod)
       }));
   }, []);
 
   const removeShipModulation = useCallback((id: string) => {
       setShipConfig(prev => ({
           ...prev,
           modulations: (prev.modulations || []).filter(mod => mod.id !== id)
       }));
   }, []);

  useEffect(() => {
    if (currentSessionId !== '1' || !soundConfig.enabled) cleanupAudio();
  }, [soundConfig.enabled, currentSessionId, cleanupAudio]);

  useEffect(() => {
    collisionThresholdRedRef.current = collisionThresholdRed;
    collisionThresholdYellowRef.current = collisionThresholdYellow;
  }, [collisionThresholdRed, collisionThresholdYellow]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
        // Prevent game controls when typing in input fields
        if ((e.target as HTMLElement).matches('input, textarea, select')) return;
        pressKey(e.key);
    };
    const up = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement).matches('input, textarea, select')) return;
        releaseKey(e.key);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [pressKey, releaseKey]);

  // MAIN GAME LOOP - Now with pre-allocated objects to reduce GC pressure
  useEffect(() => {
    let frameId: number;
    let lastTime = 0;

    const gameLoop = (timestamp: number) => {
        if (lastTime === 0) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 1000.0, 0.1);
        lastTime = timestamp;
        accumulatedTimeRef.current += dt;

        // Read latest configs from Refs
        const controls = controlConfigRef.current;
        const sound = soundConfigRef.current;
        const ship = shipConfigRef.current;
        const currentUniforms = uniformsRef.current;
        const sessionId = currentSessionIdRef.current;

        // --- Physics & Camera ---
        const keys = keysPressed.current;
        let fwd = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        if (controls.invertForward) fwd = -fwd;
        let str = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
        if (controls.invertStrafe) str = -str;
        let asc = (keys.has(' ') ? 1 : 0) - (keys.has('shift') ? 1 : 0);
        if (controls.invertAscend) asc = -asc;
        
        let pitchInput = (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0);
        if (controls.invertPitch) pitchInput = -pitchInput;
        let yawInput = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
        if (controls.invertYaw) yawInput = -yawInput;

        const [p, y] = cameraRef.current.rotation;
        const currentPos = cameraRef.current.position;
        const spd = 1.0;
        const rotSpd = 1.0;

        // Flight Pitch Offset: Allows flying level while looking slightly down (nose-down attitude)
        // This sets the "neutral" joystick position to be slightly pitched down relative to the camera view
        const FLIGHT_PITCH_OFFSET = 0.1;

        // BUG FIX: Vertical movement was inverted. 
        // If p > 0 is looking DOWN, we want NEGATIVE Y when moving forward.
        // Applied offset so p=FLIGHT_PITCH_OFFSET results in level flight (dirY=0)
        const dirX = Math.sin(y) * Math.cos(p - FLIGHT_PITCH_OFFSET);
        const dirY = -Math.sin(p - FLIGHT_PITCH_OFFSET);
        const dirZ = Math.cos(y) * Math.cos(p - FLIGHT_PITCH_OFFSET);
        const rightX = Math.cos(y);
        const rightZ = -Math.sin(y);

        const tVX = (dirX * fwd * (controls.forwardVelocity??1) + rightX * str * (controls.strafeVelocity??1)) * spd;
        const tVY = (dirY * fwd * (controls.forwardVelocity??1) + asc * (controls.ascendVelocity??1)) * spd;
        const tVZ = (dirZ * fwd * (controls.forwardVelocity??1) + rightZ * str * (controls.strafeVelocity??1)) * spd;

        cameraVelocityRef.current[0] += (tVX - cameraVelocityRef.current[0]) * 0.1;
        cameraVelocityRef.current[1] += (tVY - cameraVelocityRef.current[1]) * 0.1;
        cameraVelocityRef.current[2] += (tVZ - cameraVelocityRef.current[2]) * 0.1;
        
        // OPTIMIZATION: Reuse temp array for proposed position instead of creating new one
        const proposedPos = tempProposedPosRef.current;
        proposedPos[0] = currentPos[0] + cameraVelocityRef.current[0] * dt;
        proposedPos[1] = currentPos[1] + cameraVelocityRef.current[1] * dt;
        proposedPos[2] = currentPos[2] + cameraVelocityRef.current[2] * dt;

        // Collision (Planet 1 only)
        let newState: 'none' | 'approaching' | 'colliding' = 'none';
        let newProximity = 0;
        if (sessionId === '1') {
             const dist = getPlanet1Distance(proposedPos, currentUniforms, accumulatedTimeRef.current);
             if (dist < collisionThresholdRedRef.current) {
                 newState = 'colliding';
                 newProximity = 1.0;
                 // Stop movement on collision
                 cameraVelocityRef.current[0] = 0; cameraVelocityRef.current[1] = 0; cameraVelocityRef.current[2] = 0; 
                 if (collisionStateRef.current !== 'colliding' && timestamp - collisionCooldownRef.current > 500) {
                     collisionCooldownRef.current = timestamp;
                     if (sound.enabled && audioContextRef.current && audioNodesRef.current) {
                         audioGeneratorsRef.current.playCollisionSound();
                     }
                 }
             } else if (dist < collisionThresholdYellowRef.current) {
                 newState = 'approaching';
                 newProximity = 1.0 - (dist - collisionThresholdRedRef.current) / (collisionThresholdYellowRef.current - collisionThresholdRedRef.current);
                 newProximity = Math.max(0, Math.min(1, newProximity));
             }
        }
        
        if (newState !== 'colliding') {
            // OPTIMIZATION: Mutate camera position in place
            cameraRef.current.position[0] = proposedPos[0];
            cameraRef.current.position[1] = proposedPos[1];
            cameraRef.current.position[2] = proposedPos[2];
        }
        
        if (collisionStateRef.current !== newState) {
            collisionStateRef.current = newState;
            setCollisionState(newState);
        }
        if (Math.abs(newProximity - collisionProximityRef.current) > 0.02 || newProximity === 0 || newProximity === 1.0) {
            collisionProximityRef.current = newProximity;
            setCollisionProximity(newProximity);
        }

        // Rotation
        const tRotX = pitchInput * rotSpd * (controls.pitchVelocity ?? 0.3);
        const tRotY = yawInput * rotSpd * (controls.yawVelocity ?? 0.3);
        cameraAngularVelocityRef.current[0] += (tRotX - cameraAngularVelocityRef.current[0]) * 0.07;
        cameraAngularVelocityRef.current[1] += (tRotY - cameraAngularVelocityRef.current[1]) * 0.07;
        
        // OPTIMIZATION: Mutate rotation array
        cameraRef.current.rotation[0] = Math.max(-1.57, Math.min(1.57, p + cameraAngularVelocityRef.current[0] * dt));
        cameraRef.current.rotation[1] = y + cameraAngularVelocityRef.current[1] * dt;

        const v = cameraVelocityRef.current;
        const currentSpeed = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        
        // Lower threshold for "isMoving" to avoid jarring HD snaps when slowly drifting to a stop
        const isMovingNow = currentSpeed > 0.0001;
        if (isMovingRef.current !== isMovingNow) {
            isMovingRef.current = isMovingNow;
            setIsMoving(isMovingNow);
        }

        cameraRollRef.current += (-yawInput * (controls.yawVelocity??0.3) * 0.75 * 0.4 - cameraRollRef.current) * 0.1;
        cameraRef.current.roll = cameraRollRef.current;

        // --- VIEW MODE TRANSITION & CAMERA ---
        const transitionRef = viewModeTransitionRef.current;
        const LERP_SPEED = 5.0; // Speed of the view mode fade
        if (Math.abs(transitionRef.target - transitionRef.current) > 0.001) {
            transitionRef.current += (transitionRef.target - transitionRef.current) * LERP_SPEED * dt;
            setViewModeTransition(transitionRef.current);
        } else if (transitionRef.current !== transitionRef.target) {
            transitionRef.current = transitionRef.target; // Snap to final value
            setViewModeTransition(transitionRef.current);
        }
        
        // The render camera should always be at the logical camera's position.
        // The ship is just an overlay, so we don't need to move the world's camera back.
        // This prevents the "zoom" effect when switching to chase view.
        renderCameraRef.current.position[0] = cameraRef.current.position[0];
        renderCameraRef.current.position[1] = cameraRef.current.position[1];
        renderCameraRef.current.position[2] = cameraRef.current.position[2];
        
        // Rotation and roll are shared between views and should still be copied
        renderCameraRef.current.rotation[0] = cameraRef.current.rotation[0];
        renderCameraRef.current.rotation[1] = cameraRef.current.rotation[1];
        renderCameraRef.current.roll = cameraRef.current.roll;


        // --- SHARED PHYSICS INPUTS FOR AUDIO & SHIP ---
        const now = timestamp / 1000.0;
        const acceleration = (currentSpeed - previousSpeedRef.current) / dt;
        previousSpeedRef.current = currentSpeed;

        // OPTIMIZATION: Reuse pre-allocated inputs object to avoid GC
        const inputs = audioInputsRef.current;
        inputs.speed = currentSpeed;
        inputs.acceleration = acceleration * 0.1;
        inputs.altitude = cameraRef.current.position[1] - INITIAL_CAMERA_POS[1];
        inputs.descent = -v[1] * 2.0;
        inputs.turning = Math.abs(cameraAngularVelocityRef.current[1]);
        inputs.turningSigned = cameraAngularVelocityRef.current[1]; // Raw signed velocity for Left/Right distinction
        inputs.heading = (cameraRef.current.rotation[1] % (Math.PI * 2)) / (Math.PI * 2);
        // Pitch normalized: looking UP is positive, DOWN is negative (our rotation[0] is + for down, so invert)
        inputs.pitch = -cameraRef.current.rotation[0] / 1.57; 
        inputs.proximity = collisionProximityRef.current;
        inputs.time = now;


        // --- Audio Update & Scheduling Loop ---
        if (sessionId === '1' && audioContextRef.current && audioNodesRef.current && sound.enabled) {
             // OPTIMIZATION: Reuse pre-allocated accumulators object
             const modulations = sound.modulations || [];
             const targetAccumulators = audioTargetAccumulatorsRef.current;
             
             // Reset accumulators to base values from soundConfig
             targetAccumulators['masterVolume'] = sound.masterVolume;
             targetAccumulators['drone.gain'] = sound.drone.gain;
             targetAccumulators['drone.filter'] = sound.drone.filter;
             targetAccumulators['drone.pitch'] = sound.drone.pitch;
             targetAccumulators['atmosphere.gain'] = sound.atmosphere.gain;
             targetAccumulators['arp.gain'] = sound.arp.gain;
             targetAccumulators['arp.speed'] = sound.arp.speed;
             targetAccumulators['arp.filter'] = sound.arp.filter;
             targetAccumulators['arp.octaves'] = sound.arp.octaves;
             targetAccumulators['arp.direction'] = 0; // Base direction is handled by enum, this is modulation offset
             targetAccumulators['rhythm.gain'] = sound.rhythm.gain;
             targetAccumulators['rhythm.filter'] = sound.rhythm.filter;
             targetAccumulators['rhythm.bpm'] = sound.rhythm.bpm;
             targetAccumulators['melody.gain'] = sound.melody.gain;
             targetAccumulators['melody.density'] = sound.melody.density;
             targetAccumulators['reverb.mix'] = sound.reverb.mix;
             targetAccumulators['reverb.tone'] = sound.reverb.tone;

              for (let i = 0; i < modulations.length; i++) {
                  const mod = modulations[i];
                  if (!mod.enabled) continue;
                  // Calculate modulation amount based on defined range
                  const range = MOD_RANGES[mod.target] || 1.0;
                  targetAccumulators[mod.target] += (inputs[mod.source] || 0) * mod.amount * range;
              }
              const nodes = audioNodesRef.current;
              const ctx = audioContextRef.current;
              const audioNow = ctx.currentTime;

              if (nodes.drone && sound.drone.enabled) {
                  nodes.drone.filter.frequency.setTargetAtTime(Math.max(20, targetAccumulators['drone.filter']), audioNow, 2.0); 
                  const baseFreq = nodes.drone.baseFreq;
                  const pitchOffset = targetAccumulators['drone.pitch'];
                  const finalFreq = baseFreq * Math.pow(2, pitchOffset / 12);
                  nodes.drone.osc1.frequency.setTargetAtTime(finalFreq, audioNow, 0.5); 
                  nodes.drone.osc2.frequency.setTargetAtTime(finalFreq * 1.01, audioNow, 0.5);
                  nodes.drone.gain.gain.setTargetAtTime(Math.max(0, targetAccumulators['drone.gain']), audioNow, 0.1);
              }
              if (nodes.atmosphere && sound.atmosphere.enabled) nodes.atmosphere.gain.gain.setTargetAtTime(Math.max(0, targetAccumulators['atmosphere.gain']), audioNow, 1.5);
              if (nodes.arp && sound.arp.enabled) {
                   nodes.arp.filter.frequency.setTargetAtTime(Math.max(50, targetAccumulators['arp.filter']), audioNow, 0.5);
                   nodes.arp.gain.gain.setTargetAtTime(Math.max(0, targetAccumulators['arp.gain']), audioNow, 0.1);
              }
              if (nodes.rhythm && sound.rhythm.enabled) {
                   // Rhythm filter is per-hit now, modulation applies to gain instead if needed
                   nodes.rhythm.gain.gain.setTargetAtTime(Math.max(0, targetAccumulators['rhythm.gain']), audioNow, 0.1);
              }
              if (nodes.reverb && sound.reverb.enabled) {
                   nodes.reverb.output.gain.setTargetAtTime(Math.max(0, Math.min(1, targetAccumulators['reverb.mix'])), audioNow, 0.5);
                   nodes.reverb.setTone(Math.max(200, targetAccumulators['reverb.tone']));
              }
              nodes.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, targetAccumulators['masterVolume'])), audioNow, 0.1);
              
              // Update live state for sequencer
              liveAudioStateRef.current.rhythmBpm = Math.max(30, Math.min(300, targetAccumulators['rhythm.bpm']));
              liveAudioStateRef.current.arpSpeed = Math.max(0.1, Math.min(5.0, targetAccumulators['arp.speed']));
              liveAudioStateRef.current.arpOctaves = Math.max(1, Math.min(5, targetAccumulators['arp.octaves']));
              liveAudioStateRef.current.melodyDensity = Math.max(0.0, Math.min(1.0, targetAccumulators['melody.density']));

            // Scheduling
            const LOOKAHEAD = 0.1;
            const { rhythmBpm, arpSpeed, melodyDensity } = liveAudioStateRef.current;

            if (sound.melody.enabled && audioNow >= nextMelodyTimeRef.current - LOOKAHEAD) {
                const playTime = Math.max(audioNow, nextMelodyTimeRef.current);
                if (Math.random() < melodyDensity) audioGeneratorsRef.current.playGenerativeNote(playTime);
                nextMelodyTimeRef.current += (60 / rhythmBpm) * (Math.random() * 4 + 4); 
            }
            if (sound.arp.enabled && audioNow >= nextArpTimeRef.current - LOOKAHEAD) {
                const playTime = Math.max(audioNow, nextArpTimeRef.current);
                audioGeneratorsRef.current.playArpNote(playTime);
                nextArpTimeRef.current += (60 / rhythmBpm) / (arpSpeed * 4);
            }
            if (sound.rhythm.enabled && audioNow >= nextRhythmTimeRef.current - LOOKAHEAD) {
                const playTime = Math.max(audioNow, nextRhythmTimeRef.current);
                audioGeneratorsRef.current.playRhythm(playTime);
                nextRhythmTimeRef.current += 60 / rhythmBpm;
            }
        }

        // --- SHIP MODULATION ---
        // Update effective ship config based on physics inputs
        const shipMods = ship.modulations || [];
        // Create a mutable copy of the latest ship config for this frame
        const { modulations: _modulations, ...effectiveConfig } = ship;

        for(const mod of shipMods) {
            if (!mod.enabled) continue;
            
            const targetKey = mod.target as keyof typeof effectiveConfig;
            if (!effectiveConfig.hasOwnProperty(targetKey)) continue;

            const range = SHIP_MOD_RANGES[mod.target] || 1.0;
            const valueChange = (inputs[mod.source] || 0) * mod.amount * range;
            
            // Apply modulation. Since `effectiveConfig` is a copy, we can safely mutate it.
            (effectiveConfig[targetKey] as number) += valueChange;
        }

        // Update the ref with the final calculated values for this frame
        effectiveShipConfigRef.current = effectiveConfig;


        // --- Terraforming ---
        if (isTerraformingHeld.current && terraformPowerRef.current > 0) terraformPowerRef.current = Math.max(0, terraformPowerRef.current - 0.33 * dt);
        else terraformPowerRef.current = Math.min(1.0, terraformPowerRef.current + 0.2 * dt);
        
        if (terraformPower !== terraformPowerRef.current) {
             setTerraformPower(terraformPowerRef.current);
        }
        
        const cVs = terraform_currentVelocity.current, tVs = terraform_targetVelocity.current;
        const affectedUniforms = Object.keys(cVs).concat(Object.keys(tVs));
        if (affectedUniforms.length > 0) {
             // Using a Set to ensure unique keys if there's overlap, though rare here.
             const uniqueAffected = new Set(affectedUniforms);
             if (uniqueAffected.size > 0) {
                setUniforms(prev => {
                    const next = { ...prev };
                    let chg = false;
                    uniqueAffected.forEach(k => {
                        const s = slidersRef.current.find(sl => sl.variableName === k);
                        if (!s) return;
                        cVs[k] = (cVs[k]||0) + ((tVs[k]||0) - (cVs[k]||0)) * 0.1;
                        if (Math.abs(cVs[k]) < 1e-4 && tVs[k]===0) { delete cVs[k]; delete tVs[k]; return; }
                        let val = (next[k] ?? s.defaultValue) + cVs[k] * terraformPowerRef.current;
                        if (val > s.max) { val = s.max; cVs[k] = 0; }
                        if (val < s.min) { val = s.min; cVs[k] = 0; }
                        if (next[k] !== val) { next[k] = val; chg = true; }
                    });
                    return chg ? next : prev;
                });
             }
        }
        frameId = requestAnimationFrame(gameLoop);
    };
    frameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameId);
  }, []); // EMPTY DEPENDENCY ARRAY IS CRITICAL

  // Re-bind audio generators to use refs internally so they can be called from game loop without staleness
  const audioGeneratorsRef = useRef({
      playGenerativeNote: (t:number) => {},
      playArpNote: (t:number) => {},
      playRhythm: (t:number) => {},
      playCollisionSound: () => {}
  });

  useEffect(() => {
      audioGeneratorsRef.current = {
          playGenerativeNote,
          playArpNote,
          playRhythm,
          playCollisionSound
      };
  }, [playGenerativeNote, playArpNote, playRhythm, playCollisionSound]);

  const handleUniformChange = useCallback((n: string, v: number) => setUniforms(p => ({ ...p, [n]: v })), []);
  const allUniforms = uniforms;

  return {
    activeShaderCode, sliders, uniforms, handleUniformChange, handleUniformsCommit, canvasSize, setCanvasSize, allUniforms, cameraRef, renderCameraRef, cameraVelocityRef, cameraAngularVelocityRef, pressKey, releaseKey, cameraControlsEnabled, pressedKeys, isControlsOpen, setIsControlsOpen, isHdEnabled, setIsHdEnabled, isFpsEnabled, setIsFpsEnabled, isHudEnabled, setIsHudEnabled, handleTerraformPress, handleTerraformRelease, terraformPower, terraformConfig, handleTerraformConfigChange, currentSessionId, EDITMODE, handleSessionSelect, controlConfig, handleControlConfigChange, sessionSource, handleSourceChange, soundConfig, handleSoundConfigChange, addSoundModulation, updateSoundModulation, removeSoundModulation, fileInputRef, handleLoadSessionFromFile, handleSaveSessionToFile, handleFileChange, isMoving, debugElevation, debugArpVolume, debugCameraAltitude, debugCameraPitch, debugCameraDistance, collisionState, collisionProximity, collisionThresholdRed, setCollisionThresholdRed, collisionThresholdYellow, setCollisionThresholdYellow, isInteracting, setIsInteracting: (v: boolean) => setIsInteracting(v), viewMode, setViewMode, viewModeTransition, shipConfig, effectiveShipConfigRef, handleShipConfigChange: (key: keyof ShipConfig, v: number) => setShipConfig(p => ({ ...p, [key]: v })), addShipModulation, updateShipModulation, removeShipModulation, debugCollisionPointRef, debugRayStartPointRef, debugRayEndPointRef, debugCollisionDistanceRef, getSessionStateJson
  };
};

const useDummyHandlers = () => ({
  shaderCode: '', handleCodeEdit: () => {}, handleRun: () => {}, error: null, handleSliderConfigChange: () => {}, handleResetSliders: () => {}, handleRemoveSlider: () => {}, isSidebarVisible: false, setIsSidebarVisible: () => {}, isSettingsOpen: false, setIsSettingsOpen: () => {}, settingsRef: React.createRef<HTMLDivElement>(), playbackState: 'playing' as const, handlePlayPause: () => {}, handleStop: () => {}, handleRestart: () => {}, handleNewSessionClick: () => {}, handleLoadSession: () => {}, handleSaveSession: () => {}, handleUndo: () => {}, historyIndex: 0, handleRedo: () => {}, history: [] as any[], setIsNewSessionModalOpen: () => {}, handleConfirmNewSession: () => {}, geminiPrompt: '', setGeminiPrompt: () => {}, handleAiRequest: () => {}, handleAiSliderAdjust: () => {}, aiStage: AiStage.IDLE, geminiError: null, handleExplainCode: () => {}, isGeneratingExplanation: false, explanation: null, explanationError: null, handleClearExplanation: () => {}, handleAnalyzeShader: () => {}, isAnalyzing: false, analysisError: null, handleFetchSliderSuggestions: () => {}, isFetchingSuggestions: false, sliderSuggestions: [], suggestionsError: null, handleClearSuggestions: () => {}, usedSuggestions: new Set<string>(), handleFixCodeWithAi: () => {}, isFixingCode: false
});

export const useAppStoreComplete = (): AppContextType => {
    const pilot = useAppStore();
    const dummy = useDummyHandlers();
    // Destructure all needed from pilot to ensure typescript doesn't complain about missing properties when merging
    const { handleTerraformPress, handleTerraformRelease, terraformPower, isMoving, debugElevation, debugArpVolume, debugCameraAltitude, debugCameraPitch, debugCameraDistance, collisionState, collisionProximity, collisionThresholdRed, setCollisionThresholdRed, collisionThresholdYellow, setCollisionThresholdYellow, isInteracting, setIsInteracting, viewMode, setViewMode, viewModeTransition, shipConfig, effectiveShipConfigRef, handleShipConfigChange, addShipModulation, updateShipModulation, removeShipModulation, debugCollisionPointRef, debugRayStartPointRef, debugRayEndPointRef, debugCollisionDistanceRef, getSessionStateJson, ...rest } = pilot;
    return { ...dummy, ...rest, handleTerraformPress, handleTerraformRelease, terraformPower, isMoving, debugElevation, debugArpVolume, debugCameraAltitude, debugCameraPitch, debugCameraDistance, collisionState, collisionProximity, collisionThresholdRed, setCollisionThresholdRed, collisionThresholdYellow, setCollisionThresholdYellow, isInteracting, setIsInteracting, viewMode, setViewMode, viewModeTransition, shipConfig, effectiveShipConfigRef, handleShipConfigChange, addShipModulation, updateShipModulation, removeShipModulation, debugCollisionPointRef, debugRayStartPointRef, debugRayEndPointRef, debugCollisionDistanceRef, getSessionStateJson } as AppContextType;
}
