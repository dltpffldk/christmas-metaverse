const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const helper = html.slice(html.indexOf('function validPhotoPose('), html.indexOf('class LiveNetwork extends'));
const network = html.slice(html.indexOf('class LiveNetwork extends'), html.indexOf('\nclass ', html.indexOf('class LiveNetwork extends')+10));
const context = vm.createContext({console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
  NetworkAdapter:class { constructor(){this.events=[];} emit(...args){this.events.push(args);} },
  sanitizeRoom:x=>x, LIVE_TOPIC_ROOT:'qa', clamp:(x,a,b)=>Math.min(b,Math.max(a,x))});
vm.runInContext(helper + network + '\nglobalThis.Live = LiveNetwork;', context);
const json = x => JSON.parse(JSON.stringify(x));
const merge = (a,b) => json(context.mergeOrnamentEntries(a,b));
const a=[{id:'a',kind:'star'}], b=[{id:'b',kind:'bell'}];
assert.deepEqual(merge(a,b),merge(b,a),'simultaneous different ornaments converge');
assert.equal(merge(a,b).length,2,'both contributions survive');
assert.deepEqual(merge(merge(a,b),a),merge(a,b),'duplicate delivery is idempotent');
assert.deepEqual(merge(a,[{id:'a',kind:'bell'}]),merge([{id:'a',kind:'bell'}],a),'conflicting IDs resolve consistently');
assert.equal(merge(a,[{id:'<script>',kind:'star'},{id:'bad',kind:'unknown'},null]).length,1,'invalid payloads rejected');
const many=Array.from({length:20},(_,i)=>({id:String(i).padStart(2,'0'),kind:'star'}));
assert.equal(merge(many,[]).length,8,'bounded capacity');
assert.deepEqual(merge(merge(many.slice(0,10),b),many.slice(10)),merge(many,b),'bounded union associative');
assert.deepEqual(merge(context.legacyOrnaments(['star','bell']),[]),[{id:'legacy:0',kind:'star'},{id:'legacy:1',kind:'bell'}]);
assert.equal(context.validPhotoPose('heart'),'heart');assert.equal(context.validPhotoPose('bad'),'stand');
const sender=new context.Live('qa'), receiver=new context.Live('qa');
sender.cid='sender';receiver.cid='receiver';sender.connected=receiver.connected=true;
let packet;
sender.mqtt={publish:(topic,payload)=>{packet=JSON.parse(payload);}};
receiver._touchPeer=()=>({nickname:'QA'});
for(const pose of ['wave','jump','heart','stand']) {
  sender._pending={x:1,z:2,yaw:0,moving:false,pp:pose};sender._publishState();
  receiver._onMessage('qa/s/sender',JSON.stringify(packet),false);
  assert.equal(receiver.events.at(-1)[1].players[0].photoPose,pose,'pose survives real serializer/parser');
}
sender.sendTree({decor:2,lit:false,kinds:['star','bell'],entries:merge(a,b)});
receiver._onMessage('qa/e/tree',JSON.stringify(packet),true);
assert.deepEqual(json(receiver.events.at(-1)[1].entries),merge(a,b),'ornament IDs survive retained packet');
console.log('PASS: concurrent merge, duplicates, capacity, legacy migration, input validation, photo pose round trips, retained tree packet');
