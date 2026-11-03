import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async source=>{const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});return import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));};
const {messages,translate,errorText,plusDays,betweenDays,errorMessages,localizeScript}=await load("export * from './web/i18n';export {errorMessages} from './shared/errors';export {localizeScript} from './src/script-locale';");
const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
test('every product label and API error has complete English/Chinese placeholders',()=>{
 for(const [key,pair]of Object.entries(messages)){assert.equal(pair.length,2,key);assert.ok(pair.every(s=>typeof s==='string'&&s.trim()),key);assert.equal(/\p{Script=Han}/u.test(pair[0]),false,'Chinese leaked into English label: '+key);assert.deepEqual(placeholders(pair[0]),placeholders(pair[1]),key);}
 for(const [code,pair]of Object.entries(errorMessages)){assert.deepEqual(Object.keys(pair).sort(),['en','zh-CN']);assert.ok(pair.en&&pair['zh-CN'],code);assert.equal(/\p{Script=Han}/u.test(pair.en),false,code);assert.deepEqual(placeholders(pair.en),placeholders(pair['zh-CN']),code);}
 assert.equal(translate('en','quota',{used:4,max:100}),'4 / 100');assert.match(errorText('zh-CN','NUMBER_OUT_OF_RANGE',{min:1,max:365}),/1–365/);assert.equal(errorText('en','UNTRUSTED_PROVIDER_MESSAGE'),errorMessages.SERVICE_UNAVAILABLE.en);
});
test('calendar helpers preserve the selected business date across language-independent month boundaries',()=>{assert.equal(plusDays('2026-12-31',1),'2027-01-01');assert.equal(betweenDays('2026-12-31','2027-01-30'),30);});
test('both updater scripts download in either language without untranslated prompts',async()=>{const{readFile}=await import('node:fs/promises');for(const name of ['update-ip.sh','update-ip.ps1']){const source=await readFile('public/scripts/'+name,'utf8');assert.equal(/\p{Script=Han}/u.test(localizeScript(source,'en')),false,name);assert.ok(/\p{Script=Han}/u.test(localizeScript(source,'zh-CN')),name);assert.equal(localizeScript(source,'unexpected'),localizeScript(source,'en'));}});
