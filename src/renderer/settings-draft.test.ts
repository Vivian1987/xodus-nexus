import { expect, it } from 'vitest';
import type { Settings } from '../shared/types';
import { rebaseSettingsDraft } from './settings-draft';
const base:Settings={installRoot:'/games',market:'US',parallelDownloads:4,winePath:'',externalXodusRoot:'',runtimeRoot:'',verboseLogs:false};
it('keeps unsaved storage edits while accepting independent optional preference changes',()=>{
  expect(rebaseSettingsDraft({...base,installRoot:'/typed',market:'GR'},base,{...base,downloadNotifications:true,minimizeToTray:true})).toEqual({...base,installRoot:'/typed',market:'GR',downloadNotifications:true,minimizeToTray:true});
});
it('rebases untouched fields and preserves a new edit made while saving',()=>{
  const saved={...base,installRoot:'/saved'};
  expect(rebaseSettingsDraft({...base,installRoot:'/newer'},base,saved).installRoot).toBe('/newer');
  expect(rebaseSettingsDraft(base,base,saved)).toEqual(saved);
  expect(rebaseSettingsDraft(saved,saved,{...saved,downloadSpeedUnit:'bits'})).toEqual({...saved,downloadSpeedUnit:'bits'});
});
