import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const sql=async query=>(await run('docker',['exec','codex-ninety-feet-db-tests','psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',query])).stdout.trim();
test('two simultaneous recorders commit one revision and surface the other conflict',async()=>{
 const revision=Number(await sql("select revision from live_games where org_id='test-a' and id='same-id'"));
 const suffix=Date.now();
 const submit=i=>sql(`select public.commit_live_game_command('test-a','same-id','race-${suffix}-${i}',${revision},'{"type":"pitch","outcome":"ball"}',
 '{"id":"same-id","revision":${revision+1},"config":{"teamId":"team-a"},"pitchCount":${revision+1}}','pitch','grant-a')`);
 const results=(await Promise.all([submit(1),submit(2)])).map(JSON.parse);
 assert.equal(results.filter(r=>r.error==='conflict').length,1);
 assert.equal(results.filter(r=>r.state && !r.error).length,1);
 assert.equal(Number(await sql("select revision from live_games where org_id='test-a' and id='same-id'")),revision+1);
 const winner=results.findIndex(r=>!r.error)+1;
 const retry=JSON.parse(await submit(winner));assert.equal(retry.duplicate,true);
 assert.equal(Number(await sql("select revision from live_games where org_id='test-a' and id='same-id'")),revision+1);
});
