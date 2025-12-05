/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { CodeIcon, SaveIcon, LoadIcon, UndoIcon, RedoIcon, DocumentPlusIcon, PlayIcon, PauseIcon, StopIcon, ArrowPathIcon } from './Icons';
import { useAppContext } from '../context/AppContext';

const MenuButton: React.FC<{ onClick?: () => void; disabled?: boolean; children: React.ReactNode; className?: string; }> = ({ onClick, disabled, children, className }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
        {children}
    </button>
);


export const Header: React.FC = () => {
    const {
        playbackState,
        handlePlayPause,
        handleStop,
        handleRestart,
        isSidebarVisible,
        setIsSidebarVisible,
        handleNewSessionClick,
        handleLoadSession,
        handleSaveSession,
        handleUndo,
        historyIndex,
        handleRedo,
        history,
        fileInputRef,
        handleFileChange,
    } = useAppContext();

    return (
        <header className="bg-gray-950/50 backdrop-blur-sm border-b border-gray-700 p-2 flex justify-between items-center z-20 flex-shrink-0">
            <div className="flex items-center gap-2 bg-gray-800 px-2 py-1 rounded-md">
                <button onClick={handlePlayPause} title={playbackState === 'playing' ? "Pause" : "Play"} className="p-1.5 rounded-md hover:bg-gray-700 transition-colors">
                    {playbackState === 'playing' ? <PauseIcon className="text-base" /> : <PlayIcon className="text-base" />}
                </button>
                <button onClick={handleStop} title="Stop & Reset Time" className="p-1.5 rounded-md hover:bg-gray-700 transition-colors">
                    <StopIcon className="text-base" />
                </button>
                <button onClick={handleRestart} title="Restart" className="p-1.5 rounded-md hover:bg-gray-700 transition-colors">
                    <ArrowPathIcon className="text-base" />
                </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
                <div className="hidden sm:flex items-center gap-1 sm:gap-2">
                    <button onClick={handleNewSessionClick} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="New Session"><DocumentPlusIcon className="text-base" /></button>
                    <button onClick={handleLoadSession} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="Load Session"><LoadIcon className="text-base" /></button>
                    <button onClick={handleSaveSession} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="Save Session"><SaveIcon className="text-base" /></button>
                </div>
                
                <div className="w-px h-6 bg-gray-700 mx-1 hidden sm:block"></div>

                <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Undo"><UndoIcon className="text-base" /></button>
                <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Redo"><RedoIcon className="text-base" /></button>

                <div className="w-px h-6 bg-gray-700 mx-1"></div>

                <button
                    onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                    className="p-2 rounded-md hover:bg-gray-700 transition-colors"
                    title={isSidebarVisible ? "Hide Editor" : "Show Editor"}
                >
                    <CodeIcon className="text-base" />
                </button>
                
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".json"
                />
            </div>
        </header>
    );
};
