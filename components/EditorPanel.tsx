/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef } from 'react';
import { PlayIcon, SparklesIcon, QuestionMarkCircleIcon, MagicWandIcon, LightBulbIcon, AdjustmentsIcon, XCircleIcon } from './Icons';
import { AiStage } from '../types';
import { useAppContext } from '../context/AppContext';


const getAiStatusText = (stage: AiStage): string | null => {
    switch (stage) {
        case AiStage.ADJUSTING_SLIDERS:
            return 'Adjusting sliders with AI...';
        case AiStage.SMART_SLIDER_CREATION:
            return 'Designing a new control...';
        case AiStage.MODIFYING_CODE:
            return 'Modifying shader code...';
        case AiStage.ENABLE_CAMERA_CONTROLS:
            return 'Adding camera controls...';
        default:
            return null;
    }
}

export const EditorPanel: React.FC = () => {
  const {
    isSidebarVisible: isVisible,
    setIsSidebarVisible,
    shaderCode,
    handleCodeEdit: onCodeChange,
    handleRun: onRun,
    error,
    geminiPrompt,
    setGeminiPrompt: onGeminiPromptChange,
    handleAiRequest: onAiRequest,
    handleAiSliderAdjust: onAiSliderAdjust,
    aiStage,
    geminiError,
    handleExplainCode: onExplainCode,
    isGeneratingExplanation,
    explanation,
    explanationError,
    handleClearExplanation: onClearExplanation,
    isAnalyzing,
    analysisError,
    sliders,
    uniforms,
    handleUniformChange: onUniformChange,
    handleUniformsCommit,
    handleSliderConfigChange: onSliderConfigChange,
    handleResetSliders: onResetSliders,
    handleRemoveSlider: onRemoveSlider,
    handleFetchSliderSuggestions: onFetchSliderSuggestions,
    isFetchingSuggestions,
    sliderSuggestions,
    suggestionsError,
    handleClearSuggestions: onClearSuggestions,
    usedSuggestions,
    handleFixCodeWithAi: onFixCodeWithAi,
    isFixingCode,
  } = useAppContext();

  const [selectedSnippet, setSelectedSnippet] = useState<string>('');
  const [editingSlider, setEditingSlider] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const handleSelect = () => {
    if (textareaRef.current) {
        const { selectionStart, selectionEnd, value } = textareaRef.current;
        const snippet = value.substring(selectionStart, selectionEnd).trim();
        setSelectedSnippet(snippet);
        if (!snippet) {
            onClearExplanation();
        }
    }
  };

  const isGenerating = aiStage !== AiStage.IDLE || isFixingCode;
  const aiStatusText = getAiStatusText(aiStage);

  return (
    <aside
      className={`
        bg-gray-900/70 backdrop-blur-md border-l border-gray-700 
        flex flex-col
        fixed inset-y-0 right-0 w-full max-w-md z-40
        transform transition-transform duration-300 ease-in-out
        lg:relative lg:inset-y-auto lg:right-auto lg:max-w-none lg:z-10 lg:transform-none
        lg:transition-all lg:duration-300 lg:ease-in-out
        ${ isVisible ? 'translate-x-0' : 'translate-x-full' }
        lg:translate-x-0
        ${ isVisible ? 'lg:w-[450px]' : 'lg:w-0' }
      `}
    >
      <div className={`overflow-hidden flex flex-col h-full ${isVisible ? 'min-w-[300px] lg:min-w-[450px]' : 'min-w-0'}`}>
        <div className="flex-shrink-0 flex items-center justify-between p-2 lg:hidden border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200">Editor</h2>
          <button 
            onClick={() => setIsSidebarVisible(false)} 
            className="p-2 rounded-md hover:bg-gray-700"
            aria-label="Close editor"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-grow overflow-y-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="shader-editor" className="block text-sm font-medium text-gray-300">
                  Fragment Shader (GLSL)
                </label>
                {selectedSnippet && (
                    <button
                        onClick={() => onExplainCode(selectedSnippet)}
                        disabled={isGeneratingExplanation}
                        className="flex items-center gap-1.5 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        <QuestionMarkCircleIcon className={`text-sm ${isGeneratingExplanation ? 'animate-spin' : ''}`} />
                        {isGeneratingExplanation ? 'Explaining...' : 'Explain Selection'}
                    </button>
                )}
              </div>
              <div className="relative">
                <textarea
                  id="shader-editor"
                  ref={textareaRef}
                  onSelect={handleSelect}
                  value={shaderCode}
                  onChange={(e) => onCodeChange(e.target.value)}
                  className="w-full h-40 p-3 bg-gray-950/80 border border-gray-600 rounded-md font-mono text-sm text-cyan-300 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none resize-y"
                  spellCheck="false"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                    onClick={onRun}
                    className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                    <PlayIcon className="text-xl" />
                    Run
                </button>
              </div>
            </div>
            
            <div className="px-4 pb-2 min-h-[24px]">
              {error ? (
                <div className="bg-red-900/50 border border-red-700 text-red-300 text-xs font-mono p-3 rounded-md whitespace-pre-wrap max-h-48 overflow-y-auto">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold mb-1 text-red-200">Compilation Error:</p>
                      {error}
                    </div>
                    <button
                      onClick={onFixCodeWithAi}
                      disabled={isFixingCode}
                      className="flex items-center gap-1.5 ml-4 px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <MagicWandIcon className={`text-sm ${isFixingCode ? 'animate-spin' : ''}`} />
                      {isFixingCode ? 'Fixing...' : 'Fix with AI'}
                    </button>
                  </div>
                </div>
              ) : (explanation || explanationError || isGeneratingExplanation) && (
                  <div className="relative bg-gray-800/50 border border-gray-600 p-3 rounded-md text-sm">
                      <button 
                          onClick={() => {
                              onClearExplanation();
                              setSelectedSnippet('');
                          }} 
                          className="absolute top-2 right-2 text-gray-400 hover:text-white"
                          aria-label="Close explanation"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                      <h3 className="font-bold text-indigo-300 mb-2 flex items-center gap-2 text-base">
                          <QuestionMarkCircleIcon className="text-lg" />
                          Code Explanation
                      </h3>
                      {isGeneratingExplanation && !explanation && !explanationError && (
                          <p className="text-gray-300 animate-pulse">Thinking...</p>
                      )}
                      {explanationError && (
                          <div className="text-red-400">
                              <p><span className="font-bold">Error:</span> {explanationError}</p>
                          </div>
                      )}
                      {explanation && (
                          <p className="text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">{explanation}</p>
                      )}
                  </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-800 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-medium text-gray-300">Shader Controls</h3>
                    {sliders.length > 0 && (
                        <button 
                            onClick={onResetSliders}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                            title="Remove all sliders"
                        >
                            <XCircleIcon className="text-base" />
                            Reset Sliders
                        </button>
                    )}
                </div>
                
                <div className="space-y-2 pt-2 border-t border-gray-800">
                    <button
                        onClick={onFetchSliderSuggestions}
                        disabled={isFetchingSuggestions || isAnalyzing || isGenerating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold text-sm rounded-md transition-all duration-200 shadow-md disabled:bg-gray-800 disabled:cursor-not-allowed"
                    >
                        <LightBulbIcon className={`text-xl ${isFetchingSuggestions ? 'animate-pulse' : ''}`} />
                        {isFetchingSuggestions ? 'Getting Ideas...' : 'Suggest New Controls'}
                    </button>

                    {suggestionsError && (
                        <div className="text-red-400 text-xs p-2 rounded-md bg-red-900/50 border border-red-700">
                            <p><span className="font-bold">Suggestion Error:</span> {suggestionsError}</p>
                        </div>
                    )}
                    
                    {sliderSuggestions.length > 0 && !isFetchingSuggestions && (
                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-gray-400">Click an idea to apply it with AI:</p>
                                <button onClick={onClearSuggestions} className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded-md hover:bg-gray-700 transition-colors">&times; Clear</button>
                            </div>
                        
                            <div className="flex flex-wrap gap-2">
                                {sliderSuggestions.map((suggestion) => {
                                    const isSafe = suggestion.type === 'safe';
                                    const isUsed = usedSuggestions.has(suggestion.suggestion);
                                    const buttonClass = isSafe
                                        ? "bg-teal-900/50 hover:bg-teal-800/70 border border-teal-700 text-teal-200"
                                        : "bg-purple-900/50 hover:bg-purple-800/70 border border-purple-700 text-purple-200";
                                    
                                    const usedClass = isUsed
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'transition-all transform hover:scale-105';

                                    return (
                                        <button
                                            key={suggestion.suggestion}
                                            onClick={() => {
                                                onGeminiPromptChange(suggestion.suggestion);
                                                setTimeout(onAiRequest, 50); 
                                            }}
                                            disabled={isUsed}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-full ${buttonClass} ${usedClass}`}
                                        >
                                            {suggestion.suggestion}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {isAnalyzing && (
                    <p className="text-sm text-gray-400 animate-pulse text-center py-2">
                        {sliders.length > 0 ? 'Improving slider descriptions...' : 'Analyzing shader for controls...'}
                    </p>
                )}

                {analysisError && (
                    <div className="text-red-400 text-xs p-2 rounded-md bg-red-900/50 border border-red-700">
                        <p><span className="font-bold">Analysis Error:</span> {analysisError}</p>
                    </div>
                )}
                
                {sliders.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-gray-800">
                        {sliders.map((slider) => {
                          const isEditing = editingSlider === slider.variableName;
                          return (
                            <div key={slider.variableName} className="space-y-2 group">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <label 
                                            htmlFor={slider.variableName}
                                            className="text-xs text-gray-400 cursor-help border-b border-dotted border-gray-500"
                                            title={slider.description}
                                        >
                                            {slider.name}
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-cyan-400 w-12 text-right">
                                            {uniforms[slider.variableName]?.toFixed(2)}
                                        </span>
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setEditingSlider(isEditing ? null : slider.variableName)}
                                                title={isEditing ? "Finish Editing" : "Edit Range"}
                                                className={`p-1 rounded-md transition-colors ${isEditing ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white hover:bg-gray-700'}`}
                                            >
                                                <AdjustmentsIcon className="text-sm" />
                                            </button>
                                            <button
                                                onClick={() => onRemoveSlider(slider.variableName)}
                                                title="Remove Slider"
                                                className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                                            >
                                                <XCircleIcon className="text-sm" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isEditing && (
                                        <input
                                            type="number"
                                            value={slider.min}
                                            onChange={(e) => {
                                                const value = parseFloat(e.target.value);
                                                if (!isNaN(value)) {
                                                    onSliderConfigChange(slider.variableName, 'min', value);
                                                }
                                            }}
                                            step={slider.step}
                                            className="w-20 p-1 bg-gray-800 border border-gray-600 rounded-md text-xs text-white text-center focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                            aria-label={`${slider.name} min value`}
                                        />
                                    )}
                                    <input
                                        type="range"
                                        id={slider.variableName}
                                        name={slider.variableName}
                                        min={slider.min}
                                        max={slider.max}
                                        step={slider.step}
                                        value={uniforms[slider.variableName] ?? slider.defaultValue}
                                        onChange={(e) => onUniformChange(slider.variableName, parseFloat(e.target.value))}
                                        onMouseUp={handleUniformsCommit}
                                        onTouchEnd={handleUniformsCommit}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                    {isEditing && (
                                        <input
                                            type="number"
                                            value={slider.max}
                                            onChange={(e) => {
                                                const value = parseFloat(e.target.value);
                                                if (!isNaN(value)) {
                                                    onSliderConfigChange(slider.variableName, 'max', value);
                                                }
                                            }}
                                            step={slider.step}
                                            className="w-20 p-1 bg-gray-800 border border-gray-600 rounded-md text-xs text-white text-center focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                            aria-label={`${slider.name} max value`}
                                        />
                                    )}
                                </div>
                            </div>
                          )
                        })}
                    </div>
                )}
            </div>
        </div>
        
        <div className="p-4 bg-gray-950/50 border-t border-gray-700">
          <div className="relative space-y-3 mb-4">
              <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-300">
                Talk to shader:
              </label>
              <input 
                id="ai-prompt"
                type="text"
                value={geminiPrompt}
                onChange={(e) => onGeminiPromptChange(e.target.value)}
                placeholder="e.g., make it more blue"
                className="w-full p-2 bg-gray-950/80 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                disabled={isGenerating}
              />
              <div className="h-4 text-xs text-center text-gray-400">
                  {aiStatusText}
              </div>
                {geminiError && (
                <div className="text-red-400 text-xs p-2 rounded-md bg-red-900/50 border border-red-700">
                  <p><span className="font-bold">AI Error:</span> {geminiError}</p>
                </div>
              )}
          </div>
          <div className="flex gap-2">
            <button
                onClick={onAiRequest}
                disabled={isGenerating || !geminiPrompt}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-md transition-all duration-200 transform hover:scale-105 shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed disabled:scale-100"
                title="Use AI to generate new shader code or controls"
            >
                <SparklesIcon className={`text-xl ${aiStage !== AiStage.ADJUSTING_SLIDERS && isGenerating ? 'animate-spin' : ''}`} />
                {aiStage !== AiStage.ADJUSTING_SLIDERS && isGenerating ? 'Thinking...' : 'Create Control'}
            </button>
             {sliders.length > 0 && (
                <button
                    onClick={onAiSliderAdjust}
                    disabled={isGenerating || !geminiPrompt}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-md transition-all duration-200 transform hover:scale-105 shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed disabled:scale-100"
                    title="Use AI to adjust existing sliders"
                >
                    <AdjustmentsIcon className={`text-xl ${aiStage === AiStage.ADJUSTING_SLIDERS ? 'animate-spin' : ''}`} />
                    {aiStage === AiStage.ADJUSTING_SLIDERS ? 'Adjusting...' : 'Adjust values'}
                </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};