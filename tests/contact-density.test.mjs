import {test} from "node:test";
import assert from "node:assert/strict";
import {contactDensity,selectContacts,densityColor} from "../src/lib/coach/contact-density.ts";
const hit=(x,y,extra={})=>({x,y,result:"single",battingTeam:"us",...extra});
test("contact selection excludes non-contact and invalid coordinates",()=>{
 const events=[hit(20,30),hit(25,40,{result:"strikeout"}),hit(0,0,{result:"walk"}),hit(NaN,20),hit(101,20),hit(20,20,{result:"error"}),hit(20,20,{result:"out",battingTeam:"them"})];
 assert.equal(selectContacts(events,"all","all").length,3);
 assert.equal(selectContacts(events,"us","hits").length,1);
 assert.equal(selectContacts(events,"them","outs").length,1);
 assert.equal(selectContacts(events,"us","outs").length,0);
});
test("density retains boundary contacts and distinguishes cluster concentration",()=>{
 const edge=contactDensity([hit(100,100)],64,64,2);assert.equal(edge[4095],1);
 const field=contactDensity([hit(25,50),hit(25,50),hit(75,50)],100,100,2);
 assert.ok(field[50*100+25]>field[50*100+74]);
 assert.equal(Math.max(...field),1);
 assert.ok(contactDensity([],10,10,2).every(v=>v===0));
});
test("one density scale runs from cool blue to hot red",()=>{
 const low=densityColor(0),high=densityColor(1);
 assert.ok(low[2]>low[0]);assert.ok(high[0]>high[2]);
 assert.deepEqual(densityColor(-1),low);assert.deepEqual(densityColor(2),high);
});
