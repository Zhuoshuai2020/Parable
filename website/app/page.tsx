import {shell} from './shell';
export const dynamic='force-dynamic';
export default async function Page(){
 return <><div dangerouslySetInnerHTML={{__html:shell}}/><script type="module" src="/parable-app.js"/></>;
}
