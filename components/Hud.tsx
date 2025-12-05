/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/









import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

// Independent high-performance 2D renderer for HUD overlay
// Bypasses React state for 60fps updates
export const Hud: React.FC = () => {
    const { cameraRef, renderCameraRef, cameraVelocityRef, isHudEnabled, collisionState, viewModeTransition } = useAppContext();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // Use ref to access latest collision state in render loop without re-triggering effect
    const collisionStateRef = useRef(collisionState);
    useEffect(() => {
        collisionStateRef.current = collisionState;
    }, [collisionState]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isHudEnabled) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        let animationFrameId: number;
        
        const render = () => {
            // Handle resize
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;

            // Opacity for cockpit elements, which fade out in chase view
            const hudAlpha = 1.0 - viewModeTransition;

            // Read mutable refs directly for max speed
            const cam = renderCameraRef.current; // Use renderCamera for correct perspective
            const pitch = cam.rotation[0];
            const yaw = cam.rotation[1];
            const altitude = cameraRef.current.position[1] + 1.49; // Offset by 1.49 so 0 is roughly "ground" level
            const vY = cameraVelocityRef.current[1];

            // --- STYLES & COLORS based on Collision State - Runeterra Theme ---
            const currentState = collisionStateRef.current;
            let baseColorStr = '120, 200, 255'; // Magical Blue (Default)
            let glowColorStr = '180, 150, 255'; // Purple glow
            if (currentState === 'approaching') {
                baseColorStr = '255, 180, 80'; // Gold Warning (Demacia)
                glowColorStr = '255, 220, 100';
            } else if (currentState === 'colliding') {
                baseColorStr = '255, 80, 100'; // Red Alert (Noxus)
                glowColorStr = '255, 120, 140';
            }

            if (hudAlpha > 0.01) {
                // Add magical glow effect
                ctx.shadowBlur = 15;
                ctx.shadowColor = `rgba(${glowColorStr}, ${0.6 * hudAlpha})`;

                ctx.strokeStyle = `rgba(${baseColorStr}, ${0.6 * hudAlpha})`;
                ctx.fillStyle = `rgba(${baseColorStr}, ${0.9 * hudAlpha})`;
                ctx.lineWidth = 2.5;
                ctx.font = 'bold 13px monospace';

                // --- HORIZON LINE ---
                const fovY = Math.PI / 2; // Assume 90 deg FOV
                const horizonOffsetY = -(pitch / (fovY / 2)) * (h / 2);
                const horizonY = cy + horizonOffsetY;

                if (horizonY > -100 && horizonY < h + 100) {
                    ctx.beginPath();
                    const gap = 100;
                    ctx.moveTo(cx - 300, horizonY); ctx.lineTo(cx - gap, horizonY);
                    ctx.moveTo(cx + gap, horizonY); ctx.lineTo(cx + 300, horizonY);
                    ctx.stroke();
                }

                // --- CENTER CROSSHAIR (Waterline) ---
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * hudAlpha})`;
                ctx.beginPath();
                ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 5, cy);
                ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 20, cy);
                ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 5);
                ctx.stroke();
                ctx.fillStyle = `rgba(255,255,255,${0.5 * hudAlpha})`;
                ctx.fillRect(cx - 1, cy - 1, 2, 2);


                // --- READOUTS ---
                const altText = `ALT: ${altitude.toFixed(2)}`;
                const vsText = `V/S: ${(vY * 10).toFixed(2)}`;

                // Background with magical border
                ctx.fillStyle = `rgba(10, 15, 30, ${0.7 * hudAlpha})`;
                ctx.fillRect(cx + 345, cy - 52, 85, 18);
                ctx.fillRect(cx + 345, cy - 32, 85, 18);

                ctx.strokeStyle = `rgba(${glowColorStr}, ${0.4 * hudAlpha})`;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(cx + 345, cy - 52, 85, 18);
                ctx.strokeRect(cx + 345, cy - 32, 85, 18);

                ctx.fillStyle = `rgba(${baseColorStr}, ${0.95 * hudAlpha})`;
                ctx.textAlign = 'left';
                ctx.fillText(altText, cx + 350, cy - 40);
                ctx.fillText(vsText, cx + 350, cy - 20);

                // Heading with magical styling
                const headingDeg = (((-yaw * 180 / Math.PI) % 360) + 360) % 360;
                const headingText = `${headingDeg.toFixed(0)}°`;
                ctx.fillStyle = `rgba(10, 15, 30, ${0.7 * hudAlpha})`;
                ctx.fillRect(cx - 22, 48, 44, 18);

                ctx.strokeStyle = `rgba(${glowColorStr}, ${0.4 * hudAlpha})`;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(cx - 22, 48, 44, 18);

                ctx.fillStyle = `rgba(${baseColorStr}, ${0.95 * hudAlpha})`;
                ctx.textAlign = 'center';
                ctx.fillText(headingText, cx, 60);

                // --- CLIMB RATE INDICATOR ---
                const crHeight = 100;
                const crY = cy;
                const crX = cx + 330;

                // Background
                ctx.fillStyle = `rgba(10, 15, 30, ${0.6 * hudAlpha})`;
                ctx.fillRect(crX - 4, crY - crHeight / 2, 8, crHeight);

                // Border with glow
                ctx.strokeStyle = `rgba(${glowColorStr}, ${0.4 * hudAlpha})`;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(crX - 4, crY - crHeight / 2, 8, crHeight);

                // Center line
                ctx.strokeStyle = `rgba(${baseColorStr}, ${0.3 * hudAlpha})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(crX - 6, crY);
                ctx.lineTo(crX + 6, crY);
                ctx.stroke();

                const vYClamped = Math.max(-0.5, Math.min(0.5, vY));
                const indicatorY = crY - (vYClamped / 0.5) * (crHeight / 2);

                // Indicator with enhanced glow
                ctx.shadowBlur = 20;
                ctx.fillStyle = `rgba(${baseColorStr}, ${0.95 * hudAlpha})`;
                ctx.fillRect(crX - 4, indicatorY - 3, 8, 6);
                ctx.shadowBlur = 15;
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isHudEnabled, cameraRef, renderCameraRef, cameraVelocityRef, viewModeTransition]);

    if (!isHudEnabled) return null;

    return (
        <canvas 
            ref={canvasRef} 
            className="fixed inset-0 z-20 pointer-events-none"
        />
    );
};