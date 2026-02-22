// Isolated AI background types — do not merge into types.ts

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

export interface PromptHistory {
    id: string;           // timestamp-based unique id
    prompt: string;       // original user prompt
    imageUrl: string;     // resolved image URL (blob: or https:)
    generatedAt: number;  // Date.now()
}

export interface AIBackgroundState {
    status: GenerationStatus;
    currentPrompt: string;
    generatedUrl: string | null;
    errorMessage: string | null;
    history: PromptHistory[];  // last 4 entries
}
