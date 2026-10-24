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
 document:{getElementById:element,addEventListener(){},body:{style:{}},querySelectorAll:()=>['library','home','quiz','wrong','allWrong','bookmarks','analysis'].map(element)},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 fetch:async file=>({ok:fs.existsSync(path.join(root,file)),json:async()=>JSON.parse(read(file))}),
});
context.window = context;
context.scrollTo = ()=>{};
context.alert = ()=>{};
context.confirm = ()=>{throw Error('Unexpected destructive operation')};
for (const file of ['data/exam_catalog.js','complete_questions.js','explanations.js','choice_explanations.js','study_tools.js','study_features.js']) vm.runInContext(read(file),context,{filename:file});
vm.runInContext(inline,context,{filename:'index.html'});
const run = code=>vm.runInContext(code,context);
(async()=>{
 assert.equal(run('screen'),'library');
 assert.equal((element('examCards').innerHTML.match(/class="exam-card"/g)||[]).length,24);
 for(let exam=79;exam>=57;exam--){
  await run(`chooseExam(${exam})`);
  assert.equal(run('round'),exam);
  assert.equal(run('screen'),'home');
  assert.equal(run(`JSON.stringify(CATALOG.find(e=>e.round===${exam}).points)`),run('JSON.stringify(DATA.map(q=>q.points))'));
  const key=`khistory${exam}_mvp_v1`;
  for(let n=1;n<=50;n++){
   run(`moveTo(${n});select(DATA[${n-1}].accept_all?1:DATA[${n-1}].correct_option);submit()`);
   assert.equal(run(`latest(${n}).correct`),true);
   assert.equal((element('choices').innerHTML.match(/class="bubble"/g)||[]).length,5);
   assert.equal((element('choices').innerHTML.match(/class="choice-explanation"/g)||[]).length,5);
   assert.ok(!element('exbox').innerHTML.includes('검토 중'));
  }
  run("view('analysis')");
  assert.equal(element('hScore').textContent,'100점');
  assert.equal(element('hDone').textContent,'50/50');
  assert.equal(element('hWrong').textContent,'0개');
  if(exam===63){
   for(let option=1;option<=5;option++){
    run(`retry(42);select(${option});submit();view('analysis')`);
    assert.equal(run('latest(42).correct'),true);
    assert.equal(element('hScore').textContent,'100점');
    assert.ok(element('fb').innerHTML.includes('전원 정답 처리'));
    assert.ok(!element('choices').innerHTML.includes('right-tag'));
   }
  }
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
 // Global review includes old records without migration and resolved history on demand.
 await run('openAllWrong()');
 assert.ok(element('allWrongList').innerHTML.includes('제80회 1번'));
 assert.ok(element('allWrongSummary').textContent.startsWith('1문항'));
 element('wrongEra').value='3';run('drawAllWrong()');assert.ok(element('allWrongSummary').textContent.startsWith('0문항'));
 element('wrongEra').value='0';run('drawAllWrong()');assert.ok(element('allWrongSummary').textContent.startsWith('1문항'));
 element('wrongEra').value='all';
 element('includeResolved').checked=true;run('drawAllWrong()');
 assert.ok(element('allWrongList').innerHTML.includes('복습 완료'));
 element('includeResolved').checked=false;
 for(let i=0;i<3;i++){
  await run('createMock()');
  assert.ok(run("typeof round==='string'&&round.startsWith('mock-')"));
  const mockId=run('round');
  assert.equal(run('DATA.length'),50);
  assert.equal(run('DATA.reduce((n,q)=>n+q.points,0)'),100);
  assert.equal(run('new Set(DATA.map(q=>`${q.source_round}:${q.source_number}`)).size'),50);
  assert.equal(run('DATA.some(q=>q.accept_all)'),false);
  run('moveTo(1);select(DATA[0].correct_option%5+1);submit();bookmark()');
  assert.equal(run('latest(1).correct'),false);
  await run('openAllWrong()');
  assert.ok(element('allWrongList').innerHTML.includes(`openWrongQuestion('${mockId}',1,true)`));
  await run(`openMock('${mockId}')`);
  assert.equal(run('latest(1).correct'),false);
  assert.equal(run('state.bookmarks.includes(1)'),true);
  run('retry(1);select(DATA[0].correct_option);submit()');
  for(let n=2;n<=50;n++)run(`moveTo(${n});select(DATA[${n-1}].correct_option);submit()`);
  run('view("analysis")');assert.equal(element('hScore').textContent,'100점');
 }
 assert.equal(run('readMocks().length'),3);
 const mockCatalog=storage.get('khistory_mock_catalog_v1');
 const realFetch=context.fetch;
 context.fetch=async()=>({ok:false});run('examCache.delete(57)');
 await run('createMock()');
 assert.equal(storage.get('khistory_mock_catalog_v1'),mockCatalog);
 assert.ok(element('mockStatus').textContent.includes('생성하지 못했습니다'));
 context.fetch=realFetch;
 const cancelled=run('createMock()');await run('chooseExam(80)');await cancelled;
 assert.equal(run('round'),80);assert.equal(storage.get('khistory_mock_catalog_v1'),mockCatalog);
 // Broken individual catalogue rows must not hide valid stored papers.
 storage.set('khistory_mock_catalog_v1',JSON.stringify([...JSON.parse(mockCatalog),null,{id:'mock-123-broken',name:'broken',refs:Array(50).fill(null)}]));
 assert.equal(run('readMocks().length'),3);storage.set('khistory_mock_catalog_v1',mockCatalog);
 assert.equal(storage.get('khistory80_mvp_v1'),original80);
 // Cancelled deletion is read-only; confirmed deletion affects only the selected mock.
 const ids=JSON.parse(mockCatalog).map(m=>m.id),victim=ids[1];
 const beforeDelete=new Map(storage);context.confirm=()=>false;
 run(`deleteMock('${victim}')`);assert.deepEqual(storage,beforeDelete);
 await run(`openMock('${victim}')`);
 context.confirm=()=>true;run(`deleteMock('${victim}')`);
 assert.equal(run('screen'),'library');assert.equal(run('round'),80);
 assert.equal(run('readMocks().length'),2);assert.equal(storage.has(`khistory${victim}_mvp_v1`),false);
 for(const [key,value] of beforeDelete)if(key!=='khistory_mock_catalog_v1'&&key!==`khistory${victim}_mvp_v1`)assert.equal(storage.get(key),value);
 assert.ok(!run('readMocks()').some(m=>m.id===victim));
 run(`deleteMock('${victim}')`);assert.equal(run('readMocks().length'),2);
 const afterDelete=new Map(storage),removeItem=context.localStorage.removeItem;
 context.localStorage.removeItem=()=>{throw Error('Storage blocked')};
 run(`deleteMock('${ids[0]}')`);assert.deepEqual(storage,afterDelete);
 assert.ok(element('mockStatus').textContent.includes('삭제하지 못했습니다'));
 context.localStorage.removeItem=removeItem;
 context.confirm=()=>{throw Error('Unexpected destructive operation')};
 console.log('PASS: mock deletion confirmation, cancellation, active exam reset, other mocks and official records preserved');
 console.log('PASS: 3 persistent 100-point mocks, source references, global wrong review, resolved filter, failed generation preservation');
 await run('chooseExam(70)');
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
 console.log('PASS: 1,150 correct submissions, 46 retries, all five official-credit choices, persistence, protected 80th-exam records, load-failure guards');
})().catch(error=>{console.error(error);process.exitCode=1});
