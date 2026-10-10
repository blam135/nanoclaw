import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Message, type Adapter, type Attachment, type Chat } from 'chat';
import { closeDb, initTestDb, runMigrations } from '../db/index.js';
import type { InboundMessage } from './adapter.js';
import { createChatSdkBridge } from './chat-sdk-bridge.js';

vi.mock('../webhook-server.js', () => ({ registerWebhookAdapter: vi.fn() }));

beforeEach(async () => {
  await runMigrations(await initTestDb());
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});

async function receive(attachments: Attachment[]): Promise<Record<string, unknown>[]> {
  let chat!: Chat;
  const adapter = {
    name: 'stub',
    initialize: async (instance: Chat) => {
      chat = instance;
    },
    channelIdFromThreadId: () => 'stub:channel',
    isDM: () => true,
  } as unknown as Adapter;
  const bridge = createChatSdkBridge({ adapter, supportsThreads: false });
  const received: InboundMessage[] = [];
  await bridge.setup({
    onInbound: (_platform, _thread, message) => {
      received.push(message);
    },
    onInboundEvent: () => {},
    onMetadata: () => {},
    onAction: () => {},
  });
  const message = new Message({
    id: 'photo-message',
    threadId: 'stub:channel',
    text: '',
    formatted: { type: 'root', children: [] },
    raw: {},
    attachments,
    author: { userId: 'human', userName: 'human', fullName: 'Human', isBot: false, isMe: false },
    metadata: { dateSent: new Date('2026-10-09T00:00:00.000Z'), edited: false },
  });
  await chat.processMessage(adapter, 'stub:channel', message);
  expect(received).toHaveLength(1);
  return (received[0].content as { attachments: Record<string, unknown>[] }).attachments;
}

const photo: Attachment = {
  type: 'image',
  name: 'photo.png',
  mimeType: 'image/png',
  url: 'https://cdn.discordapp.com/attachments/channel/message/photo.png',
};
const bytes = Buffer.from([137, 80, 78, 71]);

describe('inbound photo attachments', () => {
  it('downloads URL-only photos even when the message has no text', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes));
    vi.stubGlobal('fetch', fetcher);
    const attachments = await receive([photo]);
    expect(fetcher).toHaveBeenCalledWith(photo.url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(attachments[0]).toMatchObject({ ...photo, data: bytes.toString('base64') });
  });

  it('uses authenticated fetchData without fetching the URL', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const fetchData = vi.fn().mockResolvedValue(bytes);
    const attachments = await receive([{ ...photo, fetchData }]);
    expect(fetchData).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(attachments[0].data).toBe(bytes.toString('base64'));
  });

  it.each([bytes, new Blob([bytes])])('preserves attachment bytes already supplied by the adapter', async (data) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const attachments = await receive([{ ...photo, data }]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(attachments[0].data).toBe(bytes.toString('base64'));
  });

  it('retains the URL and continues routing after a failed download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('expired', { status: 403 })));
    const attachments = await receive([photo]);
    expect(attachments[0]).toMatchObject(photo);
    expect(attachments[0]).not.toHaveProperty('data');
  });
});
