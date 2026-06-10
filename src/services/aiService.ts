import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase/client';

const functions = getFunctions(app);

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  success: boolean;
  message: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  // Tool results for automatic modal triggering
  toolResults?: {
    priceChanges?: Array<{ itemId: string; itemName: string; oldPrice: number; newPrice: number; change: number }>;
    relistItems?: any;
  };
}

/**
 * Send a message to the AI assistant
 */
export async function sendAIMessage(
  message: string,
  userId: string,
  conversationHistory: AIChatMessage[] = []
): Promise<AIResponse> {
  const aiAssistantFn = httpsCallable<{
    message: string;
    userId: string;
    conversationHistory: AIChatMessage[];
  }, AIResponse>(functions, 'aiAssistant', {
    timeout: 300000, // 5 minutes for AI processing with multiple tool calls
  });

  try {
    const result = await aiAssistantFn({
      message,
      userId,
      conversationHistory,
    });

    return result.data;
  } catch (error) {
    console.error('[aiService] Error calling AI assistant:', error);
    throw error;
  }
}
