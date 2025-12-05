/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

// A simple full-screen quad vertex shader
const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform mat4 u_shipRot;
uniform float u_thrust;
uniform float u_brake;
uniform float u_yaw_velocity;
uniform float u_pitch_velocity;
uniform float u_thrust_ignition_time;

// Ship DNA from sliders
uniform float u_complexity;
uniform float u_fold1;
uniform float u_fold2;
uniform float u_fold3;
uniform float u_scale;
uniform float u_stretch;
uniform float u_taper;
uniform float u_twist;
uniform float u_asymmetryX;
uniform float u_asymmetryY;
uniform float u_asymmetryZ;

// Parameter Biases
uniform float u_twistAsymX;
uniform float u_scaleAsymX;
uniform float u_fold1AsymX;
uniform float u_fold2AsymX;

uniform float u_generalScale;
uniform float u_chaseDistance;
uniform float u_chaseVerticalOffset;
uniform float u_translucency;

#define MAX_STEPS 64
#define MAX_DIST 15.0
#define SURF_DIST 0.001

mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }

// KIFS Fractal for Ship Body
float sdFractalShip(vec3 p) {
    // Store original position for asymmetry calculations
    vec3 pOrig = p;

    // Apply Asymmetry Distortion first (Spatial scaling based on sign)
    p.x *= 1.0 - sign(p.x) * u_asymmetryX * 0.5;
    p.y *= 1.0 - sign(p.y) * u_asymmetryY * 0.5;
    p.z *= 1.0 - sign(p.z) * u_asymmetryZ * 0.5;

    p /= u_generalScale;
    p.z /= u_stretch; // Longitudinal stretch
    
    // Tapering along Z axis (before rotation, Z is longitudinal)
    p.xy *= 1.0 + p.z * u_taper;

    // --- Asymmetric Twisting ---
    // Base twist + gradient based on original X position
    // If u_twistAsymX > 0, positive X (Right) twists more.
    float localTwist = u_twist + pOrig.x * u_twistAsymX;
    p.xy *= rot(p.z * localTwist * 2.0);

    // Initial orientation to make it face forward (-Z)
    p.yz *= rot(1.57); 

    float s = 1.0;
    for(int i=0; i<int(u_complexity); i++) {
        // --- Asymmetric Folding ---
        // Base fold + gradient based on original X position
        // Note: pOrig.x is used to keep the bias fixed to the ship's original side
        float localFold1 = u_fold1 + pOrig.x * u_fold1AsymX;
        float localFold2 = u_fold2 + pOrig.x * u_fold2AsymX;

        // Folding space
        p = abs(p) - vec3(localFold1, localFold2, 0.3)/s;
        p.xz *= rot(u_fold3);
        
        // --- Asymmetric Scaling ---
        float localScale = u_scale + pOrig.x * u_scaleAsymX * 0.2;
        p *= localScale;
        s *= localScale;
    }
    // Base shape: a box that gets folded into the fractal
    float d = length(max(abs(p) - vec3(0.1, 0.8, 0.1), 0.0));
    return d/s * u_generalScale;
}

// Main SDF mapping the whole ship
float map(vec3 p) {
    // Apply ship rotation (pitch/yaw/roll)
    p = (inverse(u_shipRot) * vec4(p, 1.0)).xyz;

    // Main Body
    float dBody = sdFractalShip(p);
    
    // Engines (simple cylinders at the back)
    vec3 pEng = p;
    pEng.x = abs(pEng.x);
    pEng -= vec3(0.5, 0.0, 1.2); // Position at back
    float dEng = max(length(pEng.xy) - 0.2, abs(pEng.z) - 0.4);
    
    // Flaps (boxes at sides)
    vec3 pFlap = p;
    pFlap.x = abs(pFlap.x);
    pFlap -= vec3(1.1, 0.0, 0.2);
    // Rotate flaps when braking
    pFlap.yz *= rot(u_brake * 0.8);
    float dFlap = length(max(abs(pFlap) - vec3(0.4, 0.05, 0.3), 0.0));

    // Smooth blend body and dynamic parts
    float d = -log(exp(-dBody*12.0) + exp(-dEng*12.0) + exp(-dFlap*12.0)) / 12.0;
    return d;
}

// Calculate normal for lighting
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

void main() {
    // Setup Ray from Chase Camera perspective
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, u_chaseVerticalOffset, u_chaseDistance); // Fixed chase camera relative to ship center (0,0,0)
    vec3 rd = normalize(vec3(uv, -1.5)); // Looking forward (-Z)

    float d = 0.0, t = 0.0;
    for(int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        d = map(p);
        if(d < SURF_DIST || t > MAX_DIST) break;
        t += d;
    }

    if(t < MAX_DIST) {
        vec3 p = ro + rd * t;
        vec3 n = getNormal(p);
        vec3 l = normalize(vec3(1.0, 2.0, 3.0)); // Fixed light source

        // Basic lighting
        float diff = max(dot(n, l), 0.0);
        float amb = 0.1;
        vec3 col = vec3(0.2, 0.25, 0.3) * (diff + amb);
        
        // Rim lighting
        float rim = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
        col += vec3(0.1, 0.6, 1.0) * rim * 0.8;

        // Calculate local coordinates for emissive mapping
        vec3 localP = (inverse(u_shipRot) * vec4(p, 1.0)).xyz;
        
        // --- Engine Glow ---
        // Wider mask to accommodate the ignition animation starting point
        float engineMask = smoothstep(0.4, 1.5, localP.z) * (1.0 - smoothstep(0.4, 1.0, abs(localP.x)));
        
        // Ignition Animation
        float timeSinceIgnition = u_time - u_thrust_ignition_time;
        float ignitionDuration = 0.3; // Animation duration in seconds

        // Ignition pulse travels from front (z=0.5) to back (z=1.5)
        float pulseProgress = clamp(timeSinceIgnition / ignitionDuration, 0.0, 1.0);
        float ignitionFrontZ = mix(0.5, 1.5, pulseProgress);

        // Moving pulse of light
        float pulseWidth = 0.15;
        float pulseShape = smoothstep(0.0, pulseWidth, localP.z - (ignitionFrontZ - pulseWidth)) * 
                           smoothstep(0.0, -pulseWidth, localP.z - (ignitionFrontZ + pulseWidth));
        float pulseGlow = pulseShape * 2.5 * (1.0 - pulseProgress); // Bright pulse that fades

        // Sustained Glow
        float wave1 = sin(localP.z * 8.0) * 0.5 + 0.5;
        float wave2 = sin(localP.z * 5.0) * 0.5 + 0.5;
        float sustainedIntensity = 0.2 + pow(wave1, 3.0) * 1.0 + pow(wave2, 5.0) * 0.8;

        // The sustained glow appears as the ignition pulse passes over it
        float sustainedVisibility = smoothstep(ignitionFrontZ - 0.2, ignitionFrontZ, localP.z);
        if (timeSinceIgnition > ignitionDuration) {
            sustainedVisibility = 1.0; // Fully visible after animation
        }
        float finalSustainedGlow = mix(0.1, sustainedIntensity, u_thrust * sustainedVisibility);

        // Combine glows
        float totalGlow = finalSustainedGlow + pulseGlow;
        col += vec3(1.0, 0.4, 0.05) * engineMask * totalGlow;

        // Flap Glow - asymmetric for turning
        float leftBrakeAmount = u_brake + max(0.0, u_yaw_velocity * 2.5); // Turn right, left brake lights up
        float rightBrakeAmount = u_brake + max(0.0, -u_yaw_velocity * 2.5); // Turn left, right brake lights up

        float flapMaskLeft = smoothstep(0.8, 1.6, localP.x) * (1.0 - smoothstep(0.0, 0.8, -localP.x));
        float flapMaskRight = smoothstep(0.8, 1.6, -localP.x) * (1.0 - smoothstep(0.0, 0.8, localP.x));

        col += vec3(1.0, 0.1, 0.1) * flapMaskLeft * leftBrakeAmount * 2.0;
        col += vec3(1.0, 0.1, 0.1) * flapMaskRight * rightBrakeAmount * 2.0;

        // Pitch maneuver lights
        // Pitching up (negative velocity) lights bottom. Pitching down (positive velocity) lights top.
        float pitchUpAmount = max(0.0, -u_pitch_velocity * 4.0);
        float pitchDownAmount = max(0.0, u_pitch_velocity * 4.0);

        // Define masks for top and bottom surfaces, concentrated on the main body/wings area
        float pitchLightAreaMask = smoothstep(0.8, 0.0, abs(localP.z));
        float topMask = smoothstep(0.2, 0.4, localP.y) * pitchLightAreaMask;
        float bottomMask = smoothstep(-0.2, -0.4, localP.y) * pitchLightAreaMask;

        col += vec3(1.0, 0.1, 0.1) * topMask * pitchDownAmount;
        col += vec3(1.0, 0.1, 0.1) * bottomMask * pitchUpAmount;

        // Add alpha for transparency around the ship
        outColor = vec4(col, u_translucency);
    } else {
        outColor = vec4(0.0); // Transparent background
    }
}
`;

const mat4 = {
    identity: (out: Float32Array) => { out.fill(0); out[0]=1; out[5]=1; out[10]=1; out[15]=1; },
    rotateX: (out: Float32Array, a: Float32Array, rad: number) => {
        let s=Math.sin(rad), c=Math.cos(rad), a10=a[4],a11=a[5],a12=a[6],a13=a[7], a20=a[8],a21=a[9],a22=a[10],a23=a[11];
        out.set(a);
        out[4]=a10*c+a20*s; out[5]=a11*c+a21*s; out[6]=a12*c+a22*s; out[7]=a13*c+a23*s;
        out[8]=a20*c-a10*s; out[9]=a21*c-a11*s; out[10]=a22*c-a12*s; out[11]=a23*c-a13*s;
    },
    rotateY: (out: Float32Array, a: Float32Array, rad: number) => {
        let s=Math.sin(rad), c=Math.cos(rad), a00=a[0],a01=a[1],a02=a[2],a03=a[3], a20=a[8],a21=a[9],a22=a[10],a23=a[11];
        out.set(a);
        out[0]=a00*c-a20*s; out[1]=a01*c-a21*s; out[2]=a02*c-a22*s; out[3]=a03*c-a23*s;
        out[8]=a00*s+a20*c; out[9]=a01*s+a21*c; out[10]=a02*s+a22*c; out[11]=a03*s+a23*c;
    },
    rotateZ: (out: Float32Array, a: Float32Array, rad: number) => {
        let s=Math.sin(rad), c=Math.cos(rad), a00=a[0],a01=a[1],a02=a[2],a03=a[3], a10=a[4],a11=a[5],a12=a[6],a13=a[7];
        out.set(a);
        out[0]=a00*c+a10*s; out[1]=a01*c+a11*s; out[2]=a02*c+a13*s; out[3]=a03*c+a13*s;
        out[4]=a10*c-a00*s; out[5]=a11*c-a01*s; out[6]=a12*c-a02*s; out[7]=a13*c-a03*s;
    },
};

export const ShipOverlay: React.FC = () => {
    const { viewMode, pressedKeys, controlConfig, effectiveShipConfigRef, cameraAngularVelocityRef, shipConfig } = useAppContext();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const shipState = useRef({ pitch: 0, yaw: 0, roll: 0 });

    const shipConfigRef = useRef(shipConfig);
    useEffect(() => { shipConfigRef.current = shipConfig; }, [shipConfig]);
    
    const pressedKeysRef = useRef(pressedKeys);
    useEffect(() => { pressedKeysRef.current = pressedKeys; }, [pressedKeys]);
    
    const controlConfigRef = useRef(controlConfig);
    useEffect(() => { controlConfigRef.current = controlConfig; }, [controlConfig]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || viewMode !== 'chase') return;
        const gl = canvas.getContext('webgl2', { alpha: true, depth: false, antialias: false }); // No depth needed for single quad
        if (!gl) return;

        // Enable blending for translucency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram()!;
        gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
        gl.linkProgram(p);
        gl.useProgram(p);

        // Uniform locations
        const locs = {
            uRes: gl.getUniformLocation(p, 'u_resolution'),
            uTime: gl.getUniformLocation(p, 'u_time'),
            uShipRot: gl.getUniformLocation(p, 'u_shipRot'),
            uThrust: gl.getUniformLocation(p, 'u_thrust'),
            uThrustIgnitionTime: gl.getUniformLocation(p, 'u_thrust_ignition_time'),
            uBrake: gl.getUniformLocation(p, 'u_brake'),
            uYawVelocity: gl.getUniformLocation(p, 'u_yaw_velocity'),
            uPitchVelocity: gl.getUniformLocation(p, 'u_pitch_velocity'),
            // Ship DNA
            uComplexity: gl.getUniformLocation(p, 'u_complexity'),
            uFold1: gl.getUniformLocation(p, 'u_fold1'),
            uFold2: gl.getUniformLocation(p, 'u_fold2'),
            uFold3: gl.getUniformLocation(p, 'u_fold3'),
            uScale: gl.getUniformLocation(p, 'u_scale'),
            uStretch: gl.getUniformLocation(p, 'u_stretch'),
            uTaper: gl.getUniformLocation(p, 'u_taper'),
            uTwist: gl.getUniformLocation(p, 'u_twist'),
            uAsymmetryX: gl.getUniformLocation(p, 'u_asymmetryX'),
            uAsymmetryY: gl.getUniformLocation(p, 'u_asymmetryY'),
            uAsymmetryZ: gl.getUniformLocation(p, 'u_asymmetryZ'),
            
            // New Bias Uniforms
            uTwistAsymX: gl.getUniformLocation(p, 'u_twistAsymX'),
            uScaleAsymX: gl.getUniformLocation(p, 'u_scaleAsymX'),
            uFold1AsymX: gl.getUniformLocation(p, 'u_fold1AsymX'),
            uFold2AsymX: gl.getUniformLocation(p, 'u_fold2AsymX'),

            uGeneralScale: gl.getUniformLocation(p, 'u_generalScale'),
            uChaseDistance: gl.getUniformLocation(p, 'u_chaseDistance'),
            uChaseVerticalOffset: gl.getUniformLocation(p, 'u_chaseVerticalOffset'),
            uTranslucency: gl.getUniformLocation(p, 'u_translucency'),
        };

        // Fullscreen quad
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const rotMat = new Float32Array(16);
        let lastTime = 0, animId = 0;

        // State for smooth thrust/brake animation, now with ignition tracking
        const thrustState = {
            level: 0.0,
            isThrusting: false,
            ignitionTime: -100.0, // Start far in the past to avoid animation on load
        };
        const brakeLevel = { current: 0.0 };

        const render = (t: number) => {
            const dt = Math.min((t - lastTime) / 1000, 0.1);
            const currentTimeSec = t * 0.001;
            lastTime = t;
            
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            const isThrustingNow = (pressedKeysRef.current.has('s') && !controlConfigRef.current.invertForward) || (pressedKeysRef.current.has('w') && controlConfigRef.current.invertForward);
            const isBraking = (pressedKeysRef.current.has('w') && !controlConfigRef.current.invertForward) || (pressedKeysRef.current.has('s') && controlConfigRef.current.invertForward);
            
            // Detect ignition start
            if (isThrustingNow && !thrustState.isThrusting) {
                thrustState.ignitionTime = currentTimeSec;
            }
            thrustState.isThrusting = isThrustingNow;
            
            // LERP for smooth animation
            const LERP_SPEED = 8.0;
            thrustState.level += ((isThrustingNow ? 1.0 : 0.0) - thrustState.level) * LERP_SPEED * dt;
            brakeLevel.current += ((isBraking ? 1.0 : 0.0) - brakeLevel.current) * LERP_SPEED * dt;
            
            // Use actual physics angular velocity for smoother, heavier animation
            // Negate yaw velocity because camera yaw is inverted relative to ship yaw visually
            const tYaw = -cameraAngularVelocityRef.current[1] * 1.2; 
            const tPitch_velocity = cameraAngularVelocityRef.current[0];
            // Invert pitch velocity to match user preference (UP looks UP)
            const tPitch = -tPitch_velocity * 1.0 + (shipConfigRef.current.pitchOffset ?? 0.0);

            // Slower lerp for heavier feel (3.0 instead of 8.0)
            shipState.current.yaw += (tYaw - shipState.current.yaw) * 3.0 * dt;
            shipState.current.pitch += (tPitch - shipState.current.pitch) * 3.0 * dt;
            // Roll based on yaw for banking
            shipState.current.roll += (tYaw * 1.5 - shipState.current.roll) * 3.0 * dt;

            mat4.identity(rotMat);
            mat4.rotateY(rotMat, rotMat, shipState.current.yaw);
            mat4.rotateX(rotMat, rotMat, shipState.current.pitch);
            mat4.rotateZ(rotMat, rotMat, shipState.current.roll);

            gl.useProgram(p);
            gl.uniform2f(locs.uRes, w, h);
            gl.uniform1f(locs.uTime, currentTimeSec);
            gl.uniformMatrix4fv(locs.uShipRot, false, rotMat);
            gl.uniform1f(locs.uThrust, thrustState.level);
            gl.uniform1f(locs.uThrustIgnitionTime, thrustState.ignitionTime);
            gl.uniform1f(locs.uBrake, brakeLevel.current);
            gl.uniform1f(locs.uYawVelocity, tYaw);
            gl.uniform1f(locs.uPitchVelocity, tPitch_velocity);
            
            // Update DNA uniforms from EFFECTIVE config (includes modulations)
            const ec = effectiveShipConfigRef.current;
            gl.uniform1f(locs.uComplexity, ec.complexity);
            gl.uniform1f(locs.uFold1, ec.fold1);
            gl.uniform1f(locs.uFold2, ec.fold2);
            gl.uniform1f(locs.uFold3, ec.fold3);
            gl.uniform1f(locs.uScale, ec.scale);
            gl.uniform1f(locs.uStretch, ec.stretch);
            gl.uniform1f(locs.uTaper, ec.taper);
            gl.uniform1f(locs.uTwist, ec.twist);
            gl.uniform1f(locs.uAsymmetryX, ec.asymmetryX);
            gl.uniform1f(locs.uAsymmetryY, ec.asymmetryY);
            gl.uniform1f(locs.uAsymmetryZ, ec.asymmetryZ);

            // New Bias Uniforms
            gl.uniform1f(locs.uTwistAsymX, ec.twistAsymX);
            gl.uniform1f(locs.uScaleAsymX, ec.scaleAsymX);
            gl.uniform1f(locs.uFold1AsymX, ec.fold1AsymX);
            gl.uniform1f(locs.uFold2AsymX, ec.fold2AsymX);

            gl.uniform1f(locs.uGeneralScale, shipConfigRef.current.generalScale ?? 1.0);
            gl.uniform1f(locs.uChaseDistance, shipConfigRef.current.chaseDistance ?? 6.5);
            gl.uniform1f(locs.uChaseVerticalOffset, shipConfigRef.current.chaseVerticalOffset ?? 1.0);
            gl.uniform1f(locs.uTranslucency, shipConfigRef.current.translucency ?? 1.0);

            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            animId = requestAnimationFrame(render);
        };
        render(performance.now());
        return () => { cancelAnimationFrame(animId); gl.deleteProgram(p); };
    }, [viewMode]);

    if (viewMode !== 'chase') return null;
    return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10" />;
};