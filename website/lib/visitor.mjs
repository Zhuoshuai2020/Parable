// The browser holds a random bearer token; only its hash is used as a storage owner.
// Neither the token nor owner is exposed in API JSON or logs.
export async function visitorIdentity(request){
 const secure=new URL(request.url).protocol==='https:';
 const name=secure?'__Host-parable-visitor':'parable-visitor';
 const cookies=(request.headers.get('cookie')||'').split(';').map(part=>part.trim());
 let token=cookies.find(part=>part.startsWith(name+'='))?.slice(name.length+1);
 let setCookie=null;
 if(!token||!/^[a-f0-9]{64}$/.test(token)){
  token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  setCookie=`${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure?'; Secure':''}`;
 }
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const owner='visitor:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {owner,setCookie};
}
