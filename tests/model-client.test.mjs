import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestModel} from '../model-client.mjs';
const input={baseUrl:'https://gateway.example/v1',apiKey:'private-test-credential',model:'test',messages:[{role:'user',content:'private-test-interview'}]};
const ok=()=>Response.json({choices:[{message:{content:'有效回复'},finish_reason:'stop'}]});
test('连接中断只重试一次，日志不包含密钥或访谈',async()=>{
 let calls=0;const logs=[];
 const result=await requestModel(input,{fetchImpl:async()=>{if(++calls===1)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});return ok();},sleep:async()=>{},report:e=>logs.push(e)});
 assert.equal(result,'有效回复');assert.equal(calls,2);assert.equal(logs[0].code,'ECONNRESET');assert.ok(!JSON.stringify(logs).includes('private-test'));
});
test('网关故障有限重试；授权失败和超时不盲目重试',async()=>{
 for(const [status,expected] of [[503,2],[401,1],[429,1]]){let calls=0;await assert.rejects(requestModel(input,{fetchImpl:async()=>{calls++;return new Response('private-test-provider-body',{status});},sleep:async()=>{},report:()=>{}}),e=>e.code==='MODEL_HTTP_'+status&&!e.message.includes('private-test'));assert.equal(calls,expected);}
 let calls=0;await assert.rejects(requestModel(input,{fetchImpl:async()=>{calls++;throw new DOMException('timeout','TimeoutError');},report:()=>{}}),e=>e.code==='MODEL_TIMEOUT');assert.equal(calls,1);
});
test('响应正文断开时保留明确原因，不保存半条发言',async()=>{
 await assert.rejects(requestModel(input,{fetchImpl:async()=>({ok:true,json:async()=>{throw new TypeError('terminated');}}),report:()=>{}}),e=>e.code==='MODEL_RESPONSE_INTERRUPTED');
});
test('日志区分角色、调用阶段和响应头/正文耗时，且不记录正文',async()=>{
 const logs=[];
 await requestModel(input,{role:'respondent',phase:'reply',fetchImpl:async()=>ok(),report:e=>logs.push(e)});
 assert.equal(logs[0].event,'model_request_completed');assert.equal(logs[0].role,'respondent');assert.equal(logs[0].phase,'reply');assert.equal(typeof logs[0].headersMs,'number');assert.ok(!JSON.stringify(logs).includes('private-test'));
 const errors=[];await assert.rejects(requestModel(input,{role:'respondent',fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');},report:e=>errors.push(e)}));
 assert.equal(errors[0].stage,'awaiting_headers');
});
