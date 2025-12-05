/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { useAppContext } from '../context/AppContext';

export const NewSessionModal: React.FC = () => {
    const { setIsNewSessionModalOpen, handleConfirmNewSession } = useAppContext();
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-300 animate-fadeIn">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700 max-w-sm w-full mx-4 animate-scaleUp">
                <h2 className="text-xl font-bold mb-4 text-white">Start a New Session?</h2>
                <p className="text-gray-300 mb-6">
                    Any unsaved changes will be lost. Are you sure you want to continue?
                </p>
                <div className="flex justify-end gap-4">
                    <button
                        onClick={() => setIsNewSessionModalOpen(false)}
                        className="px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500 text-white font-semibold transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirmNewSession}
                        className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};