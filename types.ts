/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



export interface Slider {
  name: string;
  variableName: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description?: string;
  targetLiteral?: string;
}

export enum AiStage {
  IDLE,
  ADJUSTING_SLIDERS,
  SMART_SLIDER_CREATION,
  MODIFYING_CODE,
  ENABLE_CAMERA_CONTROLS,
  SOUND,
}

export interface SliderSuggestion {
  suggestion: string;
  type: 'safe' | 'creative';
}

export interface TerraformTarget {
  variableName: string;
  type: 'velocity';
  magnitude: number;
  probability?: number;
}

export interface TerraformConfig {
  targets: TerraformTarget[];
}

export interface ControlConfig {
    invertStrafe?: boolean;
    invertForward?: boolean;
    invertAscend?: boolean;
    invertPitch?: boolean;
    invertYaw?: boolean;
    forwardVelocity?: number;
    strafeVelocity?: number;
    ascendVelocity?: number;
    pitchVelocity?: number;
    yawVelocity?: number;
}

// Expanded Inputs
export type ModulationSource = 
    | 'speed'        // 0.0 to ~1.0+
    | 'acceleration' // Delta speed, positive (speeding up) or negative (slowing down)
    | 'altitude'     // Height relative to start (can be negative)
    | 'descent'      // Downward velocity (positive when falling/diving)
    | 'turning'      // Yaw rotation speed (absolute value, 0.0 to ~1.0)
    | 'turningSigned' // Yaw rotation speed with direction (Negative = Left, Positive = Right)
    | 'heading'      // Compass direction (0.0 to 1.0)
    | 'pitch'        // Camera look up/down angle (-1.0 looking down, +1.0 looking up)
    | 'proximity'    // Closeness to obstacles (0.0 safe, 1.0 collision)
    | 'time';        // Always increasing seconds

// Expanded Outputs
export type ModulationTarget =
    | 'masterVolume'
    | 'drone.gain' | 'drone.filter' | 'drone.pitch'
    | 'atmosphere.gain'
    | 'arp.gain' | 'arp.speed' | 'arp.filter' | 'arp.octaves' | 'arp.direction'
    | 'rhythm.gain' | 'rhythm.filter' | 'rhythm.bpm'
    | 'melody.gain' | 'melody.density'
    | 'reverb.mix' | 'reverb.tone';

export interface Modulation {
  id: string;
  enabled: boolean;
  source: ModulationSource;
  target: ModulationTarget;
  amount: number; // -1.0 to 1.0 (representing -100% to +100% of standard range)
}

export interface ReverbConfig {
  enabled: boolean;
  mix: number; // 0 to 1 (wet/dry mix)
  decay: number; // seconds
  tone: number; // lowpass filter frequency for damping
}

export interface ArpConfig {
    enabled: boolean;
    gain: number;
    speed: number; // 0.1 to 2.0 factor
    octaves: 1 | 2 | 3;
    filter: number; // Base filter cutoff
    direction: 'up' | 'down' | 'updown' | 'random';
}

export interface RhythmConfig {
    enabled: boolean;
    gain: number;
    bpm: number;
    filter: number; // Base filter cutoff
}

export interface SoundConfig {
  enabled: boolean;
  masterVolume: number;
  reverb: ReverbConfig;
  drone: { // Deep bass foundation
      enabled: boolean;
      gain: number;
      filter: number; // Lowpass cutoff
      pitch: number; // Semitone offset
  };
  atmosphere: { // Texture layer (rain/wind)
      enabled: boolean;
      gain: number;
      texture: 'smooth' | 'grit';
  };
  melody: { // Generative CS-80 style leads
      enabled: boolean;
      gain: number;
      density: number; // How often notes play
      scale: 'dorian' | 'phrygian' | 'lydian';
  };
  arp: ArpConfig;
  rhythm: RhythmConfig;
  modulations: Modulation[]; // Active patch bay connections
}

export interface CameraData {
    position: [number, number, number];
    rotation: [number, number];
    roll: number;
}

export type ViewMode = 'cockpit' | 'chase';

export type ShipModulationTarget = 
    | 'complexity' 
    | 'fold1' | 'fold2' | 'fold3' 
    | 'scale' | 'stretch' | 'taper' | 'twist'
    | 'asymmetryX' | 'asymmetryY' | 'asymmetryZ'
    | 'twistAsymX' | 'scaleAsymX' | 'fold1AsymX' | 'fold2AsymX';

export interface ShipModulation {
    id: string;
    enabled: boolean;
    source: ModulationSource;
    target: ShipModulationTarget;
    amount: number;
}

export interface ShipConfig {
    complexity: number; // Iterations
    fold1: number;
    fold2: number;
    fold3: number;
    scale: number;
    stretch: number;
    taper: number;
    twist: number;
    asymmetryX: number; // Left/Right Bias
    asymmetryY: number; // Up/Down Bias
    asymmetryZ: number; // Front/Back Bias
    // New Parameter Biases
    twistAsymX: number;
    scaleAsymX: number;
    fold1AsymX: number;
    fold2AsymX: number;
    
    chaseDistance?: number;
    chaseVerticalOffset?: number;
    pitchOffset?: number;
    generalScale?: number;
    translucency?: number;
    modulations: ShipModulation[];
}