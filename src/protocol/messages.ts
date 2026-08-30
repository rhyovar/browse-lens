import { z } from 'zod';

const SpaceCreate = z.object({
  type: z.literal('space.create'),
  payload: z.object({ name: z.string().min(1).optional() })
});

const SpaceClose = z.object({
  type: z.literal('space.close'),
  payload: z.object({ spaceId: z.string().min(1) })
});

const BrowserOpen = z.object({
  type: z.literal('browser.open'),
  payload: z.object({ spaceId: z.string().min(1), url: z.string().url() })
});

const BrowserList = z.object({
  type: z.literal('browser.list'),
  payload: z.object({ spaceId: z.string().min(1) })
});

const BrowserClose = z.object({
  type: z.literal('browser.close'),
  payload: z.object({ spaceId: z.string().min(1), pageId: z.string().min(1) })
});

export const ClientMessage = z.discriminatedUnion('type', [
  SpaceCreate,
  SpaceClose,
  BrowserOpen,
  BrowserList,
  BrowserClose
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; error: string };

export function parseClientMessage(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }

  const result = ClientMessage.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { ok: false, error: `invalid message: ${detail}` };
  }

  return { ok: true, message: result.data };
}
