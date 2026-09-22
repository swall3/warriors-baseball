import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pitchingAvailability,requiredRest,validatePitchRules} from '../src/lib/coach/live/pitch-rules.ts';
const rules={name:'Test league',dailyLimit:75,warnAt:65,rest:[{above:20,days:1},{above:35,days:2},{above:50,days:3},{above:65,days:4}]};
test('rest threshold boundaries and full calendar rest days',()=>{
 validatePitchRules(rules);assert.equal(requiredRest(20,rules),0);assert.equal(requiredRest(21,rules),1);
 const outings=[{date:'2026-09-19',counts:{p1:21}}];
 assert.equal(pitchingAvailability('p1','2026-09-20',rules,outings).resting,true);
 assert.equal(pitchingAvailability('p1','2026-09-21',rules,outings).resting,false);
});
test('doubleheaders aggregate before calculating limits and rest',()=>{
 const outings=[{date:'2026-09-21',counts:{p1:35}},{date:'2026-09-21',counts:{p1:20}}];
 const a=pitchingAvailability('p1','2026-09-21',rules,outings,20);assert.equal(a.today,75);assert.equal(a.atLimit,true);assert.equal(a.restDays,4);
 const next=pitchingAvailability('p1','2026-09-22',rules,outings);assert.equal(next.availableOn,'2026-09-25');
});
test('reject malformed limits and unsorted rest tiers',()=>{
 assert.throws(()=>validatePitchRules({...rules,warnAt:80}));
 assert.throws(()=>validatePitchRules({...rules,rest:[{above:30,days:2},{above:20,days:1}]}));
 assert.throws(()=>validatePitchRules({...rules,rest:[{above:20,days:-1}]}));
});
