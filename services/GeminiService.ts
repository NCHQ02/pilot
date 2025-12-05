/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, Type } from "@google/genai";
import type { Slider, SliderSuggestion, Modulation } from '../types';
import { v4 as uuidv4 } from 'uuid';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'gemini-2.5-pro';

// A centralized, detailed system instruction for all code-generation prompts.
const SYSTEM_INSTRUCTION = `You are an expert GLSL shader developer. You are modifying a single GLSL fragment shader expression that will be injected into a larger template.

**Execution Environment:**
The user's code is executed inside a \`main()\` function. The following variables and functions are globally available:
- **Inputs (do NOT redeclare these):**
  - \`vec2 r\`: The resolution of the canvas in pixels.
  - \`float t\`: The current time in seconds.
  - \`vec3 FC\`: The fragment's coordinates (\`gl_FragCoord.xyz\`).
  - \`vec3 u_cameraPosition\`: A \`vec3\` representing the camera's position in 3D space.
  - \`vec2 u_cameraRotation\`: A \`vec2\` for camera rotation (x: pitch, y: yaw).
- **Output (you MUST write to this):**
  - \`vec4 o\`: The final output color for the pixel. It is pre-declared as \`vec4(0.0, 0.0, 0.0, 1.0)\`. Your code must modify it.
- **Helpers (available for use):**
  - \`mat3 rotate3D(float angle, vec3 axis)\`: A function to create a 3D rotation matrix.
- **Sliders (Uniforms):**
  - Any variable starting with \`slider_\` (e.g., \`slider_zoom\`, \`slider_speed\`) is a \`uniform float\` provided by the host application.
  - **CRITICAL:** Do NOT declare these variables (e.g., do not write \`float slider_zoom;\`). They are automatically available.

**Code Generation Rules & Style Guide:**
1.  **Placement:** Your entire generated code will be placed inside the \`void main() { ... }\` function.
2.  **No \`main\`:** Because of rule #1, you MUST NOT write \`void main()\` yourself.
3.  **No Helper Functions:** You MUST NOT define new functions. All logic must be inlined within the main body of code you provide.
4.  **Semicolons:** Every statement MUST end with a semicolon (';').
5.  **Braces:** All loops (\`for\`, \`while\`) and conditional blocks (\`if\`, \`else\`) MUST use curly braces (\`{\`...\`}\`).
6.  **No Comma Operator:** Do NOT chain statements using the comma operator (e.g., \`a=b, c=d;\` is forbidden).
7.  **Strict Typing:** Be explicit with types. Use \`.0\` for float literals (e.g., \`1.0\`, not \`1\`). Integers in loops are acceptable (e.g., \`int i = 0;\`).
8.  **Clarity over Brevity:** Write clean, well-formatted, multi-line code. Avoid "code-golfing" or compressing logic into a single line.`;


export const analyzeShaderForSliders = async (shaderCode: string): Promise<Slider[]> => {
    const prompt = `You are a GLSL shader analysis expert. Your task is to analyze a fragment shader and identify numerical literals that are good candidates for being controlled by UI sliders.

Analyze the following shader code, which is the body of the main() function:
\`\`\`glsl
${shaderCode}
\`\`\`

Your goal is to generate a JSON array of slider definitions. For each slider:
1.  **name**: A short, descriptive, user-friendly label (e.g., "Zoom", "Twist Effect").
2.  **description**: A concise, user-friendly explanation of what the slider controls. It MUST explain the visual effect of the slider's minimum and maximum values (e.g., "Controls the zoom level. A value of 0.1 is zoomed out, while 5.0 is zoomed in.").
3.  **variableName**: A unique, valid GLSL float variable name that starts with a letter or underscore (e.g., \`slider_zoom\`).
4.  **targetLiteral**: The exact numerical literal from the code to replace (e.g., "0.5", "8.").
5.  **min**, **max**: Sensible floating-point minimum and maximum values for the slider.
6.  **step**: A sensible float step value (e.g., 0.01 or 0.1).
7.  **defaultValue**: The original value of the \`targetLiteral\`.

Guidelines:
- Only choose literals that have a clear visual impact.
- Avoid values that are likely static, like array indices or fundamental constants (0.0, 1.0, unless they are used for something like color mixing).
- Ensure \`defaultValue\` is exactly the number from the code.
- Provide a good variety of controls if possible.
- The output MUST be only the JSON array.

Example Output:
[
  {
    "name": "Zoom",
    "description": "Controls the zoom level. Low values zoom out, high values zoom in.",
    "variableName": "slider_zoom",
    "targetLiteral": "0.6",
    "min": 0.1,
    "max": 5.0,
    "step": 0.01,
    "defaultValue": 0.6
  }
]`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING },
                        variableName: { type: Type.STRING },
                        targetLiteral: { type: Type.STRING },
                        min: { type: Type.NUMBER },
                        max: { type: Type.NUMBER },
                        step: { type: Type.NUMBER },
                        defaultValue: { type: Type.NUMBER },
                    },
                    required: ["name", "description", "variableName", "targetLiteral", "min", "max", "step", "defaultValue"]
                }
            }
        }
    });

    return JSON.parse(response.text) as Slider[];
};

export const enrichSliderDetails = async (shaderCode: string, sliders: Slider[]): Promise<Slider[]> => {
    const prompt = `You are a GLSL shader expert. Your task is to improve the names and descriptions for an existing set of UI sliders based on their context in the shader code.

Shader Code (this is the code inside main):
\`\`\`glsl
${shaderCode}
\`\`\`

Existing Sliders (JSON):
${JSON.stringify(sliders.map(({ variableName, targetLiteral, name, min, max }) => ({ variableName, targetLiteral, currentName: name, min, max })), null, 2)}

For each slider provided, generate a more descriptive and user-friendly 'name' and a concise 'description'. The description MUST explain the visual effect of the slider's minimum and maximum values based on its usage in the code (e.g., "Controls zoom. A low value zooms out, a high value zooms in.").

Your response MUST be ONLY a JSON array of objects, with one object for each slider. Each object must contain:
- "variableName": The original variable name to identify the slider.
- "newName": The improved name.
- "newDescription": The new description.
`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        variableName: { type: Type.STRING },
                        newName: { type: Type.STRING },
                        newDescription: { type: Type.STRING },
                    },
                    required: ["variableName", "newName", "newDescription"]
                }
            }
        }
    });

    const enrichedData = JSON.parse(response.text) as { variableName: string; newName: string; newDescription: string; }[];
    
    return sliders.map(slider => {
        const update = enrichedData.find(e => e.variableName === slider.variableName);
        if (update) {
            return { ...slider, name: update.newName, description: update.newDescription };
        }
        return slider;
    });
};

export const fetchSliderSuggestions = async (shaderCode: string, sliders: Slider[]): Promise<SliderSuggestion[]> => {
    const prompt = `You are an expert in creative GLSL shaders. You are helping a user discover new visual effects.
Based on the following shader code and its existing controls, suggest new controls or visual modifications.

Shader Code (this is the code inside main):
\`\`\`glsl
${shaderCode}
\`\`\`

${sliders.length > 0 ? `
Existing Controls:
${sliders.map(s => `- ${s.name}: ${s.description}`).join('\n')}
` : ''}

Your task is to provide two kinds of suggestions:
1.  **Safe Suggestions**: Analyze the code for hardcoded numerical literals that would be good to control with a slider. For each, create a short, actionable suggestion phrase. These should be simple parameterizations that are unlikely to break the shader. For example, if you see \`p*=.5\`, suggest "Control the pattern scale".
2.  **Creative Suggestions**: Suggest 3-5 new, creative ideas for visual modifications that might require more complex code changes. Frame them as requests.

Return your response as a JSON array of objects. Each object must have two fields:
- \`suggestion\`: A string containing the suggestion phrase (e.g., "Add a pulsing color effect", "Control the twist amount").
- \`type\`: A string, either "safe" or "creative".

Example Output:
[
  { "suggestion": "Control the zoom", "type": "safe" },
  { "suggestion": "Vary the shape count", "type": "safe" },
  { "suggestion": "Add a ripple effect from the center", "type": "creative" },
  { "suggestion": "Change colors from red to blue over time", "type": "creative" }
]
`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        suggestion: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['safe', 'creative'] },
                    },
                    required: ['suggestion', 'type']
                }
            }
        }
    });

    return JSON.parse(response.text) as SliderSuggestion[];
};

export const explainCode = async (snippet: string): Promise<string> => {
    const prompt = `You are a GLSL shader expert. Explain the following GLSL code snippet in a clear, concise, and easy-to-understand way for a beginner. Explain what the code does visually.

Code Snippet:
\`\`\`glsl
${snippet}
\`\`\`
`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
};

export type ModificationType = 'adjust_sliders' | 'smart_slider' | 'modify_code' | 'enable_camera_controls';

export interface ModificationDecision {
    action: ModificationType;
    reason: string;
}

export const determineModificationType = async (shaderCode: string, sliders: Slider[], userPrompt: string): Promise<ModificationDecision> => {
    const prompt = `You are an AI assistant for a GLSL shader editor. Your first task is to determine how to best handle a user's request.

User Request: "${userPrompt}"

Shader Code (this is the code inside main):
\`\`\`glsl
${shaderCode}
\`\`\`

${sliders.length > 0 ? `
Existing Sliders:
${sliders.map(s => `- ${s.name} (${s.variableName}): ${s.description}`).join('\n')}
` : 'There are currently no sliders.'}

Analyze the user's request and choose one of the following actions:

1.  **adjust_sliders**: Choose this ONLY if the request can be satisfied by changing the values of the *existing sliders*.
    - Examples: "make it faster," "zoom in," "change color to red" (if a 'speed' or 'zoom' or 'color' slider exists).
    - If there are no sliders, you cannot choose this.

2.  **smart_slider**: Choose this if the request is for a new visual effect, a new controllable parameter, or an aesthetic change that is not covered by existing sliders. This is the default action for creative requests.
    - Examples: "add a ripple effect," "make it pulse," "let me control the brightness," "add a twist."

3.  **enable_camera_controls**: Choose this if the user wants to add camera movement to a 3D scene. This is for adding first-person flight controls (WASD, arrow key look).
    - Examples: "let me fly through this", "add camera controls", "I want to look around".
    - This action should only be chosen if the shader appears to be a 3D scene where movement would make sense.

4.  **modify_code**: Choose this ONLY for requests that do not add a new visual parameter, such as refactoring, optimization, or fixing a bug.
    - Examples: "make it run faster", "fix the syntax error", "rewrite this part using a loop".

Your response must be a JSON object with two fields:
- "action": One of "adjust_sliders", "smart_slider", "enable_camera_controls", "modify_code".
- "reason": A brief, user-facing explanation of your choice. (e.g., "I will add a new slider to control the ripple effect.").

CRITICAL RULE: For any request that introduces a new visual element or behavior (like ripples, twists, color cycling), you MUST choose "smart_slider". Do not choose "modify_code" for these creative tasks.`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    action: { type: Type.STRING, enum: ["adjust_sliders", "smart_slider", "enable_camera_controls", "modify_code"] },
                    reason: { type: Type.STRING },
                },
                required: ["action", "reason"],
            }
        }
    });
    return JSON.parse(response.text) as ModificationDecision;
};

export const adjustSliders = async (shaderCode: string, sliders: Slider[], userPrompt: string): Promise<{ [key: string]: number }> => {
    const prompt = `You are an AI assistant for a GLSL shader editor. Your task is to adjust the values of existing sliders to match the user's request.

User Request: "${userPrompt}"

Shader Code (this is the code inside main):
\`\`\`glsl
${shaderCode}
\`\`\`

Sliders:
${JSON.stringify(sliders.map(s => ({ name: s.name, variableName: s.variableName, min: s.min, max: s.max, description: s.description })), null, 2)}

Your response must be a JSON array of objects. Each object must contain two keys:
- "variableName": The 'variableName' of the slider to change.
- "newValue": The new numerical value for that slider.

- The new value MUST be within the slider's min/max range.
- Only include sliders that need to be changed.
- If the user says "more red", and red is controlled by a slider, increase its value.

Example response:
[
  { "variableName": "slider_speed", "newValue": 5.0 }
]`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        variableName: { type: Type.STRING },
                        newValue: { type: Type.NUMBER },
                    },
                    required: ["variableName", "newValue"]
                }
            }
        }
    });
    
    const adjustments = JSON.parse(response.text) as { variableName: string; newValue: number }[];
    
    const updatedUniforms: { [key: string]: number } = {};
    for (const adj of adjustments) {
        updatedUniforms[adj.variableName] = adj.newValue;
    }

    return updatedUniforms;
};


export const createSmartSlider = async (shaderCode: string, userPrompt: string): Promise<{ newSlider: Slider; modifiedCode: string }> => {
    const prompt = `${SYSTEM_INSTRUCTION}

You must now implement a user's request by modifying a fragment shader and adding a new UI slider to control the new effect.

**User Request:** "${userPrompt}"

**Current Shader Code (this is the code inside main):**
\`\`\`glsl
${shaderCode}
\`\`\`
You must:
1.  Implement the user's request by modifying the shader code according to all the rules.
2.  Define a new slider that provides control over the new effect (e.g., its strength, speed, or size).

**Your response MUST be a single JSON object with two keys:**
1.  \`newSlider\`: An object defining the new slider with the following fields:
    - \`name\`: A short, user-friendly label (e.g., "Brightness", "Ripple Strength").
    - \`description\`: A concise explanation of the slider's effect.
    - \`variableName\`: A new, unique, valid GLSL float variable name (e.g., \`slider_brightness\`).
    - \`min\`, \`max\`, \`step\`: Sensible float values for the slider's range.
    - \`defaultValue\`: A sensible default value.
2.  \`modifiedCode\`: The complete, new shader code to be placed inside the main function. It must not contain \`void main()\` or helper functions. It must incorporate the new \`variableName\` you defined above.

**Example Request:** "add a twist effect"
**Example Response:**
{
  "newSlider": {
    "name": "Twist Amount",
    "description": "Controls the intensity of the spiral twist effect.",
    "variableName": "slider_twist",
    "min": 0.0,
    "max": 10.0,
    "step": 0.1,
    "defaultValue": 2.0
  },
  "modifiedCode": "vec2 p = (FC.xy * 2.0 - r) / r.y;\\nfloat angle = p.y * slider_twist + t;\\np.x += sin(angle) * 0.1;\\no.rgb = vec3(p.x, p.y, 1.0);"
}
`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    newSlider: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            variableName: { type: Type.STRING },
                            min: { type: Type.NUMBER },
                            max: { type: Type.NUMBER },
                            step: { type: Type.NUMBER },
                            defaultValue: { type: Type.NUMBER },
                        },
                        required: ["name", "description", "variableName", "min", "max", "step", "defaultValue"]
                    },
                    modifiedCode: { type: Type.STRING },
                },
                required: ["newSlider", "modifiedCode"]
            }
        }
    });
    
    return JSON.parse(response.text);
};

export const implementCameraControls = async (shaderCode: string): Promise<{ modifiedCode: string }> => {
    const prompt = `${SYSTEM_INSTRUCTION}

You must now rewrite a fragment shader to include a dynamic, first-person raymarching camera system.

**User Request:** "add camera controls"

**Current Shader Code (this is the code inside main):**
\`\`\`glsl
${shaderCode}
\`\`\`

Your task is to replace any existing camera setup (static or otherwise) with a new one that uses the globally available uniforms:
- \`vec3 u_cameraPosition\`: Use this as the ray origin (\`ro\`).
- \`vec2 u_cameraRotation\`: Use this for looking around. \`.x\` is pitch (up/down), \`.y\` is yaw (left/right).

**Implementation Steps:**
1.  Identify the ray origin vector in the code (often named \`ro\`, \`p\`, or \`origin\`) and replace its definition with \`vec3 ro = u_cameraPosition;\`.
2.  Identify the ray direction vector (often named \`rd\`, \`v\`, or \`dir\`).
3.  Replace its definition with a new one that correctly uses the camera rotation. Start with a base direction, then apply rotations. For example:
    \`\`\`glsl
    vec3 rd = normalize(vec3((FC.xy * 2.0 - r) / r.y, 1.0));
    rd = rotate3D(u_cameraRotation.y, vec3(0.0, 1.0, 0.0)) * rd;
    rd = rotate3D(u_cameraRotation.x, vec3(1.0, 0.0, 0.0)) * rd;
    \`\`\`
4.  Ensure this new \`ro\` and \`rd\` are correctly used in the subsequent raymarching loop or scene function. You MUST correctly identify and replace the existing variables.

Your response must be a JSON object with a single key, "modifiedCode", containing the complete, new shader code string. This code will be placed directly inside the 'main' function. Do NOT include the 'void main() { ... }' wrapper or any helper functions.
`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    modifiedCode: { type: Type.STRING },
                },
                required: ["modifiedCode"]
            }
        }
    });
    return JSON.parse(response.text);
};

export const modifyCode = async (shaderCode: string, userPrompt: string): Promise<{ modifiedCode: string }> => {
    const prompt = `${SYSTEM_INSTRUCTION}

You must now modify a fragment shader based on a user's request.

**User Request:** "${userPrompt}"

**Current Shader Code (this is the code inside main):**
\`\`\`glsl
${shaderCode}
\`\`\`

Modify the code to fulfill the request, following all rules defined above.
Your response must be a JSON object with a single key, "modifiedCode", containing the new shader code string. This code will be placed directly inside the 'main' function. Do NOT include the 'void main() { ... }' wrapper or any helper functions.
`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    modifiedCode: { type: Type.STRING },
                },
                required: ["modifiedCode"]
            }
        }
    });
    return JSON.parse(response.text);
};

export const fixCode = async (shaderCode: string, errorMessage: string): Promise<{ fixedCode: string }> => {
    const prompt = `${SYSTEM_INSTRUCTION}

You must now fix a compilation error in a fragment shader.

**Error Message:**
\`\`\`
${errorMessage}
\`\`\`

**Broken Shader Code (this is the code inside main):**
\`\`\`glsl
${shaderCode}
\`\`\`

Analyze the error and the code, correct the syntax or logic error, and return the fixed code. The top priority is to make the code compile successfully. Follow all rules defined above.

Your response must be a JSON object with a single key, "fixedCode", containing the corrected shader code string. This code will be placed directly inside the 'main' function. Do NOT include the 'void main() { ... }' wrapper or any helper functions.
`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    fixedCode: { type: Type.STRING },
                },
                required: ["fixedCode"]
            }
        }
    });
    return JSON.parse(response.text);
};

export const generateAudioModulation = async (userPrompt: string): Promise<Modulation[]> => {
    const prompt = `You are an expert audio engineer configuring a dynamic soundtrack for a 3D exploration game.
Translate the user's natural language request into one or more "Modulation" patch configurations.

**Available Sources (Inputs):**
- 'speed': Camera movement speed (0.0 to ~1.0+).
- 'acceleration': Change in speed over time. Positive = speeding up, Negative = slowing down.
- 'altitude': Camera height relative to start (can be negative or positive, e.g., -5.0 to +10.0).
- 'descent': Vertical downward speed. Positive when diving/falling, negative when climbing.
- 'turning': How fast the camera is rotating left/right (yaw speed, approx 0.0 to 1.0).
- 'heading': Compass direction (0.0 to 1.0).
- 'pitch': Camera looking up/down angle (-1.0 looking down, +1.0 looking up).
- 'proximity': How close the camera is to an obstacle (0.0 = safe, 1.0 = collision imminent).
- 'time': Always increasing game time in seconds.

**Available Targets (Audio Parameters):**
- 'masterVolume': Overall volume (0.0 to 1.0).
- 'drone.gain', 'drone.filter' (Hz), 'drone.pitch' (semitones).
- 'atmosphere.gain'.
- 'arp.gain', 'arp.filter' (Hz), 'arp.speed' (multiplier, higher = faster notes), 'arp.octaves' (range 1-3).
- 'rhythm.gain', 'rhythm.filter' (Hz), 'rhythm.bpm' (Beats Per Minute).
- 'melody.gain', 'melody.density' (0.0 to 1.0, higher = more frequent notes).
- 'reverb.mix', 'reverb.tone' (Hz).

**Modulation Logic:**
Final Value = Base Value + (Source Value * Amount)
- Positive 'amount' means more source = higher target value.
- Negative 'amount' means more source = lower target value.

**Examples:**
- "Make it louder when I go fast": \`[{ source: 'speed', target: 'masterVolume', amount: 0.3 }]\`
- "Drums go faster when I dive down": \`[{ source: 'descent', target: 'rhythm.bpm', amount: 50 }]\`
- "More intense music near obstacles": \`[{ source: 'proximity', target: 'rhythm.gain', amount: 0.5 }, { source: 'proximity', target: 'arp.speed', amount: 1.0 }]\`
- "Higher arp range when climbing high": \`[{ source: 'altitude', target: 'arp.octaves', amount: 0.5 }]\`

**User Request:** "${userPrompt}"

Return a JSON array of Modulation objects. Each object must have:
- 'source': One of the sources listed above.
- 'target': One of the targets listed above.
- 'amount': A sensible float value for the scaling factor based on the target's typical range.
- 'enabled': true
`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        source: { type: Type.STRING, enum: ['speed', 'acceleration', 'altitude', 'descent', 'turning', 'heading', 'pitch', 'proximity', 'time'] },
                        target: { type: Type.STRING, enum: ['masterVolume', 'drone.gain', 'drone.filter', 'drone.pitch', 'atmosphere.gain', 'arp.gain', 'arp.speed', 'arp.filter', 'arp.octaves', 'rhythm.gain', 'rhythm.filter', 'rhythm.bpm', 'melody.gain', 'melody.density', 'reverb.mix', 'reverb.tone'] },
                        amount: { type: Type.NUMBER },
                        enabled: { type: Type.BOOLEAN },
                    },
                    required: ['source', 'target', 'amount', 'enabled']
                }
            }
        }
    });

    const rawMods = JSON.parse(response.text) as Omit<Modulation, 'id'>[];
    return rawMods.map(mod => ({ ...mod, id: uuidv4() }));
};
