export type VoiceUsage = { creatorId: string; userId: string; durationSeconds: number; provider: string; estimatedCostUsd: number };
export interface SpeechToTextProvider { name: string; transcribe(audio: ArrayBuffer, mimeType: string, signal: AbortSignal): Promise<{ text: string; durationSeconds: number }> }
export interface TextToSpeechProvider { name: string; synthesize(text: string, signal: AbortSignal): Promise<{ audio: ArrayBuffer; mimeType: string; durationSeconds: number }> }
export interface RealtimeVoiceProvider { name: string; createSession(creatorId: string, userId: string): Promise<{ clientToken: string; expiresAt: string }> }
export type VoicePolicy = { mode: 'disabled' | 'free' | 'trial' | 'premium' | 'usage-limited'; trialUses?: number; dailyLimit?: number; maxDurationSeconds?: number };
