// Scans only distributable files. Report file names and categories, never matching values.
import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw Error('Stage the intended public files before auditing');
const rules=[
 ['private file',/(?:^|\/)(?:\.local|node_modules|\.cf|\.cloudflare|\.wrangler|__pycache__)(?:\/|$)|(?:^|\/)\.dev\.vars|(?:^|\/)\.env(?!\.example$)|\.(?:pem|key|log)$/i,true],
 ['literal address',/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/],
 ['private path',/\/(?:Users|home)\/[^\s/]+\//],
 ['private key',/-----BEGIN [A-Z ]*PRIVATE KEY-----/],
 ['Alibaba access key',/LTAI[A-Za-z0-9]{12,}/],
 ['live cloud identifier',/\b(?:sg|i|vpc|vsw)-[a-z0-9]{14,}\b/],
 ['live application token',/\bpa_(?:customer|device|session)_[a-zA-Z0-9_-]{40,}\b/],
];
let failures=0;
for(const file of files){const data=execFileSync('git',['show',':'+file],{encoding:'utf8'});for(const [name,pattern,pathOnly] of rules){if(pattern.test(pathOnly?file:data)){console.error(file+': '+name);failures++;}}}
if(failures)process.exitCode=1;else console.log('Public file audit passed: '+files.length+' files; no literal IP addresses or credential patterns.');
