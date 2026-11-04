export const MODEL_REQUEST_TIMEOUT_MS=180000;
export class ModelRequestError extends Error {
  constructor(message, code, statusCode=502){super(message);this.code=code;this.statusCode=statusCode;}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function networkCode(error){
  const cause=error?.cause;
  const value=cause?.code||cause?.errors?.[0]?.code||error?.code;
  return typeof value==='string'&&/^[A-Z0-9_]+$/.test(value)?value:'NETWORK_ERROR';
}
export async function requestModel({baseUrl,apiKey,model,messages},{fetchImpl=fetch,sleep=wait,timeoutMs=MODEL_REQUEST_TIMEOUT_MS,role='unknown',phase='reply',report=event=>event.event==='model_request_completed'?console.info(JSON.stringify(event)):console.warn(JSON.stringify(event))}={}){
  const started=Date.now();
  const host=new URL(baseUrl).hostname;
  for(let attempt=1;attempt<=2;attempt++){
    const signal=AbortSignal.timeout(Math.max(1,timeoutMs-(Date.now()-started)));
    let response,headersMs;
    try{
      response=await fetchImpl(baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,messages})});
      headersMs=Date.now()-started;
    }catch(error){
      const timeout=signal.aborted||error.name==='TimeoutError';
      const code=timeout?'MODEL_TIMEOUT':networkCode(error);
      report({event:'model_network_error',host,role,phase,stage:'awaiting_headers',code,attempt,timeoutMs,elapsedMs:Date.now()-started});
      const retryable=['ECONNRESET','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','NETWORK_ERROR'].includes(code);
      if(attempt===1&&!timeout&&retryable&&Date.now()-started+700<timeoutMs){await sleep(600);continue;}
      const detail=timeout?'模型响应超时':code==='ENOTFOUND'?'无法解析模型网关地址':code==='EACCES'?'系统阻止了到模型网关的网络连接':'与模型网关的连接中断';
      throw new ModelRequestError(`${detail}（${code}）。已保存的访谈不受影响，可稍后继续。`,code,timeout?504:502);
    }
    if(!response.ok){
      // Never return provider bodies: they can contain request data or credentials.
      const status=response.status;
      await response.body?.cancel();
      report({event:'model_http_error',host,role,phase,status,attempt,headersMs});
      if(attempt===1&&[502,503,504].includes(status)&&Date.now()-started+700<timeoutMs){await sleep(600);continue;}
      const message=status===401||status===403?'模型网关拒绝授权，请检查服务端密钥':status===429?'模型服务请求过多，请稍后继续':`模型网关暂时无法完成请求（HTTP ${status}）`;
      throw new ModelRequestError(message+'。已保存的访谈不受影响。','MODEL_HTTP_'+status,status===429?503:502);
    }
    let result;
    try{result=await response.json();}catch(error){
      const timeout=signal.aborted||error.name==='TimeoutError';
      const code=timeout?'MODEL_TIMEOUT':'MODEL_RESPONSE_INTERRUPTED';
      report({event:'model_response_error',host,role,phase,stage:'reading_body',code,attempt,headersMs,elapsedMs:Date.now()-started});
      throw new ModelRequestError(timeout?'模型响应超时，已保存的访谈不受影响，请稍后继续。':'模型响应未完整接收，本条未写入访谈，请重试。',code,timeout?504:502);
    }
    if(result.choices?.[0]?.finish_reason==='length')throw new ModelRequestError('模型输出被截断，本条未保存为完整发言，请重试。','MODEL_TRUNCATED');
    const content=result.choices?.[0]?.message?.content;
    if(typeof content!=='string'||!content.trim())throw new ModelRequestError('模型没有返回有效文字，请重试。','MODEL_EMPTY');
    report({event:'model_request_completed',host,role,phase,attempt,headersMs,elapsedMs:Date.now()-started,inputChars:messages.reduce((n,m)=>n+m.content.length,0),outputChars:content.length});
    return content;
  }
}
