import { z } from 'zod';

const SpaceCreate = z.object({
  type: z.literal('space.create'),
  payload: z.object({
    name: z.string().min(1).optional(),
    importProfile: z.boolean().optional(),
    record: z.boolean().optional(),
    privacy: z.boolean().optional(),
    allowlist: z.array(z.string()).optional(),
    blocklist: z.array(z.string()).optional()
  })
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

const PluginRef = z.object({
  package: z.string().min(1),
  name: z.string().min(1),
  params: z.record(z.unknown()).optional()
});

const BrowserRun = z.object({
  type: z.literal('browser.run'),
  payload: z.object({
    spaceId: z.string().min(1),
    pageId: z.string().min(1),
    // Exactly one of script/plugin is required — checked in parseClientMessage,
    // not here, since z.discriminatedUnion needs each member to be a plain
    // ZodObject (a .refine() would wrap this in a ZodEffects).
    script: z.string().min(1).optional(),
    plugin: PluginRef.optional()
  })
});

export const ClientMessage = z.discriminatedUnion('type', [
  SpaceCreate,
  SpaceClose,
  BrowserOpen,
  BrowserList,
  BrowserClose,
  BrowserRun
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

  if (result.data.type === 'browser.run') {
    const { script, plugin } = result.data.payload;
    if ((script ? 1 : 0) + (plugin ? 1 : 0) !== 1) {
      return { ok: false, error: 'invalid message: payload must include exactly one of script or plugin' };
    }
  }

  return { ok: true, message: result.data };
}
