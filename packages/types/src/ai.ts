import { z } from 'zod';
import { AIProvider } from './enums.js';

export const aiMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type AIMessageRole = z.infer<typeof aiMessageRoleSchema>;

export const aiChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  message: z.string().min(1).max(20000),
  provider: z.nativeEnum(AIProvider).optional(),
  context: z
    .object({
      kind: z.enum(['LOGS', 'METRICS', 'INCIDENT', 'DEPLOYMENT', 'GENERIC']),
      payload: z.unknown().optional(),
    })
    .optional(),
});
export type AIChatRequest = z.infer<typeof aiChatRequestSchema>;

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  provider: AIProvider | null;
  model: string | null;
  createdAt: string;
}

export interface AIConversation {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string;
  provider: AIProvider;
  createdAt: string;
  updatedAt: string;
}
