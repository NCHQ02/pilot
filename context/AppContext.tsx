/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/




import React, { createContext, useContext, RefObject, MutableRefObject } from 'react';
import { Slider, AiStage, SliderSuggestion, TerraformConfig, TerraformTarget, ControlConfig, SoundConfig, Modulation, CameraData, ViewMode, ShipConfig, ShipModulation } from '../types';

// Define the shape of the context's value
export interface AppContextType {
  // Shader State
  activeShaderCode: string;
  shaderCode: string;
  handleCodeEdit: (code: string) => void;
  handleRun: () => void;
  error: string | null;

  // Slider State
  sliders: Slider[];
  uniforms: { [key: string]: number };
  handleUniformChange: (variableName: string, value: number) => void;
  handleUniformsCommit: () => void;
  handleSliderConfigChange: (variableName: string, key: 'min' | 'max' | 'step', value: number) => void;
  handleResetSliders: () => void;
  handleRemoveSlider: (variableName: string) => void;
  
  // Settings State
  canvasSize: string;
  setCanvasSize: (size: string) => void;
  isSidebarVisible: boolean;
  setIsSidebarVisible: (visible: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  settingsRef: RefObject<HTMLDivElement>;
  isHdEnabled: boolean;
  setIsHdEnabled: (enabled: boolean) => void;
  isFpsEnabled: boolean;
  setIsFpsEnabled: (enabled: boolean) => void;
  isHudEnabled: boolean;
  setIsHudEnabled: (enabled: boolean) => void;
  isControlsOpen: boolean;
  setIsControlsOpen: (open: boolean) => void;
  isInteracting: boolean;
  setIsInteracting: (interacting: boolean) => void;

  // Camera State
  allUniforms: { [key: string]: number };
  cameraRef: MutableRefObject<CameraData>;
  // Helper for rendering offset in chase mode
  renderCameraRef: MutableRefObject<CameraData>;
  cameraVelocityRef: MutableRefObject<[number, number, number]>;
  cameraAngularVelocityRef: MutableRefObject<[number, number]>;
  pressKey: (key: string) => void;
  releaseKey: (key: string) => void;
  currentSessionId: string;
  cameraControlsEnabled: boolean;
  pressedKeys: Set<string>;
  controlConfig: ControlConfig;
  handleControlConfigChange: (key: keyof ControlConfig, value: boolean | number) => void;
  isMoving: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  viewModeTransition: number; // 0 = cockpit, 1 = chase
  debugElevation: number;
  debugCameraAltitude: number;
  debugCameraPitch: number;
  debugCameraDistance: number;
  collisionState: 'none' | 'approaching' | 'colliding';
  collisionProximity: number;
  collisionThresholdRed: number;
  setCollisionThresholdRed: (value: number) => void;
  collisionThresholdYellow: number;
  setCollisionThresholdYellow: (value: number) => void;
  debugCollisionPointRef: MutableRefObject<[number, number, number]>;
  debugRayStartPointRef: MutableRefObject<[number, number, number]>;
  debugRayEndPointRef: MutableRefObject<[number, number, number]>;
  debugCollisionDistanceRef: MutableRefObject<number>;

  // Playback state
  playbackState: 'playing' | 'paused' | 'stopped';
  handlePlayPause: () => void;
  handleStop: () => void;
  handleRestart: () => void;

  // Terraform
  handleTerraformPress: () => void;
  handleTerraformRelease: () => void;
  terraformPower: number;
  terraformConfig: TerraformConfig | null;
  handleTerraformConfigChange: (variableName: string, property: keyof TerraformTarget | 'enabled', value: number | boolean) => void;

  // Session management
  handleNewSessionClick: () => void;
  handleSaveSessionToFile: () => void;
  handleLoadSessionFromFile: () => void;
  handleLoadSession: () => void;
  handleSaveSession: () => void;
  handleUndo: () => void;
  historyIndex: number;
  handleRedo: () => void;
  history: any[]; 
  fileInputRef: RefObject<HTMLInputElement>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setIsNewSessionModalOpen: (open: boolean) => void;
  handleConfirmNewSession: () => void;
  getSessionStateJson: () => string;

  // Gemini AI
  geminiPrompt: string;
  setGeminiPrompt: (prompt: string) => void;
  handleAiRequest: () => void;
  handleAiSliderAdjust: () => void;
  aiStage: AiStage;
  geminiError: string | null;
  handleExplainCode: (snippet: string) => void;
  isGeneratingExplanation: boolean;
  explanation: string | null;
  explanationError: string | null;
  handleClearExplanation: () => void;
  handleAnalyzeShader: () => void;
  isAnalyzing: boolean;
  analysisError: string | null;
  handleFetchSliderSuggestions: () => void;
  isFetchingSuggestions: boolean;
  sliderSuggestions: SliderSuggestion[];
  suggestionsError: string | null;
  handleClearSuggestions: () => void;
  usedSuggestions: Set<string>;
  handleFixCodeWithAi: () => void;
  isFixingCode: boolean;

  // Sound Engine
  soundConfig: SoundConfig;
  handleSoundConfigChange: (key: string, value: any) => void;
  addSoundModulation: (mod: Modulation) => void;
  updateSoundModulation: (id: string, newConfig: Partial<Modulation>) => void;
  removeSoundModulation: (id: string) => void;
  debugArpVolume: number;

  // Edit Mode Flag & Session Selection
  EDITMODE: boolean;
  handleSessionSelect: (sessionId: string) => void;
  sessionSource: string | null;
  handleSourceChange: (source: string) => void;

  // Ship Config
  shipConfig: ShipConfig;
  effectiveShipConfigRef: MutableRefObject<Omit<ShipConfig, 'modulations'>>;
  handleShipConfigChange: (key: keyof ShipConfig, value: number) => void;
  addShipModulation: (mod: ShipModulation) => void;
  updateShipModulation: (id: string, newConfig: Partial<ShipModulation>) => void;
  removeShipModulation: (id: string) => void;
}


// Create the context with a default null value
export const AppContext = createContext<AppContextType | null>(null);

// Create a provider component
export const AppProvider: React.FC<{ value: AppContextType; children: React.ReactNode }> = ({ value, children }) => {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Create a custom hook for easy consumption
export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};