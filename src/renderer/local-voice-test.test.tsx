import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalVoiceTest } from './LocalVoiceTest';
import { GuideOverlay } from './GuideOverlay';
import { demoSnapshot } from '../shared/demo-data';
afterEach(()=>vi.unstubAllGlobals());
it('renders explicit local-only controls without requesting microphone permission',()=>{const request=vi.fn();vi.stubGlobal('window',{launcher:{requestVoiceCapture:request}});const html=renderToStaticMarkup(<LocalVoiceTest/>);expect(html).toContain('No audio is recorded or sent to Xbox');expect(html).toContain('Microphone stopped');expect(html).toContain('Start test');expect(html).toContain('Stop test');expect(html).toContain('Listen to my voice on this PC');expect(request).not.toHaveBeenCalled();expect(html).not.toContain('Connected to Xbox');});
it('keeps the local test and real application mixer inside the optional Guide audio panel',()=>{const html=renderToStaticMarkup(<GuideOverlay data={demoSnapshot()} tab="audio" setTab={()=>{}} close={()=>{}} go={()=>{}} openGame={()=>{}}/>);for(const title of ['Local microphone test','System audio mixer','App mixer'])expect(html).toContain(title);expect(html).toContain('No audio is recorded or sent to Xbox');});
it('localizes the test, device controls, lifecycle and local-only explanation in Greek',()=>{vi.stubGlobal('localStorage',{getItem:()=> 'el'});const html=renderToStaticMarkup(<LocalVoiceTest/>);for(const text of ['Τοπική δοκιμή μικροφώνου','Έναρξη δοκιμής','Διακοπή δοκιμής','Ο ήχος δεν καταγράφεται ούτε αποστέλλεται στο Xbox','Συσκευή εξόδου για αυτήν τη δοκιμή'])expect(html).toContain(text);});
