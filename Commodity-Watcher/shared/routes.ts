import { z } from 'zod';
import { commodities, newsItems } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  commodities: {
    list: {
      method: 'GET' as const,
      path: '/api/commodities' as const,
      responses: {
        200: z.array(z.custom<typeof commodities.$inferSelect>()),
      },
    },
  },
  news: {
    list: {
      method: 'GET' as const,
      path: '/api/news' as const,
      input: z.object({
        commodityId: z.coerce.number().optional(),
        search: z.string().optional()
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof newsItems.$inferSelect>()),
      },
    },
    refresh: {
      method: 'POST' as const,
      path: '/api/news/refresh' as const,
      input: z.object({
        commodityId: z.coerce.number().optional()
      }).optional(),
      responses: {
        200: z.object({ message: z.string(), count: z.number() }),
        500: errorSchemas.internal
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
