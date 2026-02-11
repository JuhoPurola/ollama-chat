import { z } from 'zod';

// Message schema
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(100000), // Max 100KB per message
});

// Chat request schema
export const ChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  model: z.string().min(1).max(100).regex(/^[a-z0-9-:.]+$/i), // Alphanumeric, hyphens, colons, dots
  messages: z.array(MessageSchema).min(1).max(100), // Max 100 messages per request
});

// Conversation create schema
export const ConversationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  model: z.string().min(1).max(100).regex(/^[a-z0-9-:.]+$/i),
});

// Model name schema
export const ModelNameSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-:.]+$/i),
});

// Instance action schema
export const InstanceActionSchema = z.object({
  action: z.enum(['start', 'stop']),
});

// Admin message fetch schema
export const AdminMessageFetchSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().uuid(),
});

// UUID schema for validation
export const UUIDSchema = z.string().uuid();

// Helper function to validate and parse
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Helper to create validation error response
export function createValidationErrorResponse(error: z.ZodError) {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Validation failed',
      details: error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    }),
  };
}
