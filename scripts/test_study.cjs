// Integration tests for the real inline app script, without a browser or packages.
// Uses isolated in-memory storage; never touches the user's saved learning data.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const inline = [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const storage = new Map();
const original80 = JSON.stringify({attempts:{1:[{option:1,correct:false,at:'2025-01-01'}]},bookmarks:[7]});
storage.set('khistory80_mvp_v1', original80);
const elements = new Map();
function element(id) {
 if (!elements.has(id)) {
  const classes = new Set();
  elements.set(id, {id,style:{},textContent:'',innerHTML:'',innerText:'',
   classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},
   setAttribute(){},removeAttribute(){}});
 }
 return elements.get(id);
}
const context = vm.createContext({console,Date,Map,Set,JSON,Promise,
 document:{getElementById:element,addEventListener(){},body:{style:{}},querySelectorAll:()=>['library','home','quiz','wrong','bookmarks','analysis'].map(element)},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 fetch:async file=>({ok:fs.existsSync(path.join(root,file)),json:async()=>JSON.parse(read(file))}),
});
context.window = context;
context.scrollTo = ()=>{};
context.alert = ()=>{};
context.confirm = ()=>{throw Error('Unexpected destructive operation')};
for (const file of ['data/exam_catalog.js','complete_questions.js','explanations.js','choice_explanations.js']) vm.runInContext(read(file),context,{filename:file});
vm.runInContext(inline,context,{filename:'index.html'});
const run = code=>vm.runInContext(code,context);
(async()=>{
 assert.equal(run('screen'),'library');
 assert.equal((element('examCards').innerHTML.match(/class="exam-card"/g)||[]).length,11);
 for(let exam=79;exam>=70;exam--){
  await run(`chooseExam(${exam})`);
  assert.equal(run('round'),exam);
  assert.equal(run('screen'),'home');
  assert.equal(run(`JSON.stringify(CATALOG.find(e=>e.round===${exam}).points)`),run('JSON.stringify(DATA.map(q=>q.points))'));
  const key=`khistory${exam}_mvp_v1`;
  for(let n=1;n<=50;n++){
   run(`moveTo(${n});select(DATA[${n-1}].correct_option);submit()`);
   assert.equal(run(`latest(${n}).correct`),true);
   assert.equal((element('choices').innerHTML.match(/class="choice-explanation"/g)||[]).length,5);
   assert.ok(!element('exbox').innerHTML.includes('검토 중'));
  }
  run("view('analysis')");
  assert.equal(element('hScore').textContent,'100점');
  assert.equal(element('hDone').textContent,'50/50');
  assert.equal(element('hWrong').textContent,'0개');
  run('retry(1);select(DATA[0].correct_option%5+1);submit();bookmark();view("wrong")');
  assert.equal(element('hWrong').textContent,'1개');
  assert.equal(run('state.bookmarks.includes(1)'),true);
  assert.equal(JSON.parse(storage.get(key)).attempts[1].length,2);
  const saved=storage.get(key);
  await run('chooseExam(80)');
  assert.equal(storage.get('khistory80_mvp_v1'),original80);
  assert.equal(run('state.bookmarks[0]'),7);
  await run(`chooseExam(${exam})`);
  assert.equal(storage.get(key),saved);
  assert.equal(run('latest(1).correct'),false);
  run('retry(1);select(DATA[0].correct_option);submit();view("home")');
  assert.equal(element('hScore').textContent,'100점');
  assert.equal(element('hWrong').textContent,'0개');
  run('removeBookmark(1)');
  assert.equal(run('state.bookmarks.length'),0);
  console.log(`${exam}: all 50 grades, five explanations, score, retry, wrong notes, bookmark, round isolation PASS`);
 }
 // A failed or incomplete download must not switch the active exam or overwrite records.
 run('examCache.delete(70)');
 context.fetch=async()=>({ok:false});
 await run('chooseExam(70)');
 assert.ok(element('examLoadStatus').textContent.includes('불러오지 못했습니다'));
 run('examCache.delete(71)');
 context.fetch=async file=>({ok:true,json:async()=>file.includes('explanations')?{}:JSON.parse(read(file))});
 await run('chooseExam(71)');
 assert.equal(run('round'),70);
 assert.equal(storage.get('khistory80_mvp_v1'),original80);
 run("view('library')");
 assert.equal(run('screen'),'library');
 console.log('PASS: 500 correct submissions, 20 retries, persistence, protected 80th-exam records, load-failure guards');
})().catch(error=>{console.error(error);process.exitCode=1});
