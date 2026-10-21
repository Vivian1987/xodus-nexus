import { describe, expect, it, vi } from 'vitest';
import { parseXboxSocial, socialPeer, XboxSocialService, type SocialReader } from './xbox-social';

const trackedSpawn = vi.hoisted(() => vi.fn());
vi.mock('./process.js', () => ({ spawnTracked: trackedSpawn }));

const capabilities = { friends:true,presence:true,inbox:true,conversation:true,send:true,search:true,partyVoice:true };
const envelope = (extra: object = {}, account = 'sample@example.test') => JSON.stringify({ schema:1, account, selfXuid:'100', status:'ready', capabilities, ...extra });
const friend = { xuid:'200',gamertag:'Friend',presence:'unknown',gamerpicUrl:'https://example.invalid/private.png' };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe('Xbox social response boundaries', () => {
  it('matches the backend positive u64 identity bounds without number rounding', () => {
    for (const id of ['1','9007199254740993','18446744073709551615']) expect(socialPeer(id)).toBe(id);
    for (const id of ['0','01','18446744073709551616','99999999999999999999','184467440737095516150','1e3','+1',' 1',1,null]) expect(() => socialPeer(id)).toThrow('player ID');
    expect(() => parseXboxSocial(envelope({ selfXuid:'18446744073709551616',friends:[] }),'sample@example.test','friends')).toThrow('player ID');
  });
  it('binds the account and strips unknown/private fields and unsupported voice capability', () => {
    const raw = envelope({friends:[friend],privateToken:'must-not-leave-backend'});
    const result = parseXboxSocial(raw, 'sample@example.test', 'friends');
    expect(result.status).toBe('ready'); expect(result.friends?.[0].presence).toBe('unknown');
    expect(result.friends?.[0].gamerpicUrl).toBeUndefined(); expect(result.capabilities.partyVoice).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/must-not-leave|privateToken|sample@example/);
    expect(() => parseXboxSocial(raw, 'other@example.test', 'friends')).toThrow('mismatch');
  });
  it('rejects invalid and duplicate people instead of inventing online state', () => {
    expect(() => parseXboxSocial(envelope({friends:[friend,friend]}), 'sample@example.test','friends')).toThrow();
    expect(() => parseXboxSocial(envelope({friends:[{...friend,xuid:'200;command'}]}), 'sample@example.test','friends')).toThrow();
    expect(parseXboxSocial(envelope({friends:[{...friend,presence:'future-value'}]}),'sample@example.test','friends').friends?.[0].presence).toBe('unknown');
  });
  it('checks peer identity, keeps deleted/filtered states and rejects group messages', () => {
    const raw = envelope({peerXuid:'200',messages:[{id:'m1',senderXuid:'200',text:'deleted private text',deleted:true},{id:'m2',senderXuid:'100',deleted:false}]});
    const result = parseXboxSocial(raw,'sample@example.test','conversation','200');
    expect(result.messages?.map(item => item.text)).toEqual([undefined,undefined]);
    expect(() => parseXboxSocial(raw,'sample@example.test','conversation','300')).toThrow('target');
    expect(() => parseXboxSocial(envelope({peerXuid:'200',messages:[{id:'m1',senderXuid:'300',deleted:false,text:'third party'}]}),'sample@example.test','conversation','200')).toThrow('participant');
  });
  it('requires two distinct bound inbox participants and a matching preview sender', () => {
    const conversation = { id:'c1',peerXuid:'200',participants:['100','200'],unread:true,lastMessage:{id:'m1',senderXuid:'200',text:'Hello',deleted:false} };
    expect(parseXboxSocial(envelope({conversations:[conversation]}),'sample@example.test','inbox').conversations).toHaveLength(1);
    for (const participants of [[],['100'],['200','200'],['100','300']]) expect(() => parseXboxSocial(envelope({conversations:[{...conversation,participants}]}),'sample@example.test','inbox')).toThrow();
    expect(() => parseXboxSocial(envelope({conversations:[{...conversation,lastMessage:{...conversation.lastMessage,senderXuid:'300'}}]}),'sample@example.test','inbox')).toThrow('participant');
    expect(() => parseXboxSocial(envelope({conversations:[{...conversation,peerXuid:'100'}]}),'sample@example.test','inbox')).toThrow();
  });
});
describe('account-bound social requests shared by both windows', () => {
  it('uses only the selected backend and keeps message text and account identifiers out of argv', async () => {
    const completion = deferred<{ code: number; output: string }>();
    const stdin = { on: vi.fn(), end: vi.fn() }, kill = vi.fn();
    trackedSpawn.mockReturnValueOnce({ child: { stdin, kill }, result: completion.promise });
    const service = new XboxSocialService();
    service.select('sample@example.test', '/fixture/selected-nexus-cli');
    const pending = service.request('send', { peer: '200', text: 'Private message $literal' });
    expect(trackedSpawn).toHaveBeenLastCalledWith('/fixture/selected-nexus-cli', ['social', 'send', '200', '--json'], { maxOutput: 3_000_000, stdoutOnly: true });
    expect(stdin.end).toHaveBeenCalledWith(JSON.stringify({ text: 'Private message $literal' }));
    expect(JSON.stringify(trackedSpawn.mock.calls.at(-1))).not.toMatch(/Private message|sample@example/);
    completion.resolve({ code: 0, output: envelope({ peerXuid: '200', sent: {} }) });
    expect((await pending).sent).toEqual({ messageId: undefined, conversationId: undefined });
    expect(kill).not.toHaveBeenCalled();
  });
  it('terminates the selected backend operation on sign-out and discards its late data', async () => {
    const completion = deferred<{ code: number; output: string }>();
    const child = { stdin: { on: vi.fn(), end: vi.fn() }, kill: vi.fn() };
    trackedSpawn.mockReturnValueOnce({ child, result: completion.promise });
    const service = new XboxSocialService();
    service.select('sample@example.test', '/fixture/selected-nexus-cli');
    const pending = service.request('friends');
    service.select();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    completion.resolve({ code: 0, output: envelope({ friends: [friend], privateToken: 'synthetic-secret' }) });
    const result = await pending;
    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).not.toMatch(/Friend|synthetic-secret|sample@example/);
    expect((await service.request('friends')).status).toBe('signed-out');
  });
  it('deduplicates reads and caches only the selected account in memory', async () => {
    const wait = deferred<string>(), reader = vi.fn<SocialReader>(() => wait.promise), service = new XboxSocialService(reader);
    service.select('sample@example.test','/fixture/xodus-cli');
    const app = service.request('friends'), guide = service.request('friends');
    expect(reader).toHaveBeenCalledTimes(1); wait.resolve(envelope({friends:[friend]}));
    expect((await app).friends).toEqual((await guide).friends);
    await service.request('friends'); expect(reader).toHaveBeenCalledTimes(1);
    await service.request('friends',{refresh:true}); expect(reader).toHaveBeenCalledTimes(2);
  });
  it('cancels and discards a late response after sign-out/account changes', async () => {
    const wait = deferred<string>(), reader = vi.fn<SocialReader>(() => wait.promise), service = new XboxSocialService(reader);
    service.select('sample@example.test','/fixture/xodus-cli'); const pending = service.request('friends');
    const signal = reader.mock.calls[0][4] as AbortSignal;
    service.select(); expect(signal.aborted).toBe(true); wait.resolve(envelope({friends:[friend]}));
    expect((await pending).friends).toBeUndefined(); expect((await service.request('friends')).status).toBe('signed-out');
    service.select('new@example.test'); expect((await service.request('friends')).status).toBe('unsupported');
  });
  it('discards a replaced backend response without deleting the replacement request', async () => {
    const old = deferred<string>(), current = deferred<string>();
    const reader = vi.fn<SocialReader>().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const service = new XboxSocialService(reader);
    service.select('sample@example.test', '/fixture/old-cli');
    const outdated = service.request('friends');
    const oldSignal = reader.mock.calls[0][4] as AbortSignal;
    service.select('sample@example.test', '/fixture/current-cli');
    const firstCurrent = service.request('friends');
    old.resolve(envelope({ friends: [{ ...friend, gamertag: 'Old backend' }] }));
    expect((await outdated).status).toBe('error');
    expect(oldSignal.aborted).toBe(true);
    const secondCurrent = service.request('friends');
    expect(reader).toHaveBeenCalledTimes(2);
    current.resolve(envelope({ friends: [{ ...friend, gamertag: 'Current backend' }] }));
    expect((await firstCurrent).friends?.[0].gamertag).toBe('Current backend');
    expect((await secondCurrent).friends?.[0].gamertag).toBe('Current backend');
  });
  it('keeps cached results private to each caller and refreshes once their lifetime ends', async () => {
    vi.useFakeTimers();
    try {
      const reader = vi.fn<SocialReader>().mockResolvedValue(envelope({ friends: [friend] }));
      const service = new XboxSocialService(reader);
      service.select('sample@example.test', '/fixture/xodus-cli');
      const first = await service.request('friends');
      first.friends![0].gamertag = 'Mutated by one window';
      first.capabilities.partyVoice = true;
      vi.advanceTimersByTime(19_999);
      const cached = await service.request('friends');
      expect(cached.friends?.[0].gamertag).toBe('Friend');
      expect(cached.capabilities.partyVoice).toBe(false);
      expect(reader).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      await service.request('friends');
      expect(reader).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it('sends text only as private body, rejects concurrent sends and never retries an uncertain delivery', async () => {
    const wait = deferred<string>(), reader = vi.fn<SocialReader>(() => wait.promise), service = new XboxSocialService(reader);
    service.select('sample@example.test','/fixture/xodus-cli');
    const pending = service.request('send',{peer:'200',text:'Hello $literal'});
    expect(reader.mock.calls[0].slice(0,4)).toEqual(['/fixture/xodus-cli','send','200',{text:'Hello $literal'}]);
    await expect(service.request('send',{peer:'200',text:'Second'})).rejects.toThrow('pending');
    wait.resolve('invalid or interrupted response'); const result = await pending;
    expect(result.status).toBe('error'); expect(result.reason).toContain('could not be confirmed'); expect(reader).toHaveBeenCalledTimes(1);
  });
  it('validates inputs before spawning any private operation', async () => {
    const reader = vi.fn<SocialReader>(), service = new XboxSocialService(reader);
    service.select('sample@example.test','/fixture/xodus-cli');
    await expect(service.request('send',{peer:'200',text:'🕹'.repeat(257)})).rejects.toThrow('256');
    await expect(service.request('conversation',{peer:'-1'})).rejects.toThrow('player');
    await expect(service.request('send',{peer:'18446744073709551616',text:'Synthetic message'})).rejects.toThrow('player');
    await expect(service.request('search',{query:'\0'})).rejects.toThrow('player name'); expect(reader).not.toHaveBeenCalled();
  });
});
