import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

// IMPORTANT: The GEMINI_API_KEY must be set in your Vercel/environment variables. 
// Do not hardcode it here. Vercel automatically makes this available in production.
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(express.json());

// Main handler for all Gemini requests from the frontend
app.post('/', async (req, res) => {
    try {
        const { task, payload } = req.body;
        
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "API key is not configured on the server." });
        }
        
        if (!task || !payload) {
            return res.status(400).json({ error: "Missing 'task' or 'payload' in request body." });
        }

        let response;
        let model = 'gemini-2.5-flash'; // Default model for text tasks

        switch (task) {
            case 'tts':
                // Gemini TTS Call
                const voiceConfig = { voiceName: "Charon" }; // Consistent TTS voice
                
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-preview-tts',
                    contents: [{ parts: [{ text: payload.prompt }] }],
                    config: {
                        responseModalities: ["AUDIO"],
                        speechConfig: { voiceConfig }
                    }
                });
                
                // Extract audio data and mime type for the frontend
                const part = response?.candidates?.[0]?.content?.parts?.[0];
                if (!part || !part.inlineData) {
                    throw new Error("TTS response missing inlineData.");
                }

                return res.json({ 
                    audioData: part.inlineData.data,
                    mimeType: part.inlineData.mimeType,
                });

            case 'harakat':
            case 'translation':
            case 'sentence':
            case 'pronunciation':
                // All text-based calls use the same structure
                response = await ai.models.generateContent({
                    model: model,
                    contents: [{ parts: [{ text: payload.prompt }] }],
                    config: {
                         // Send system instruction only if provided
                        ...(payload.systemInstruction && { 
                            systemInstruction: payload.systemInstruction 
                        })
                    }
                });
                
                return res.json({ 
                    result: response.text, 
                });
                
            default:
                return res.status(400).json({ error: `Unknown task: ${task}` });
        }
        
    } catch (error) {
        console.error("Backend Gemini API Error:", error);
        res.status(500).json({ error: "Failed to process request on the server." });
    }
});

// Vercel serverless function export
export default app;