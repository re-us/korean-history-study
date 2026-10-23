let eraMetadata=null,creatingMock=false;
const MOCK_CATALOG_KEY='khistory_mock_catalog_v1';
function readMocks(){
 try{const rows=JSON.parse(localStorage.getItem(MOCK_CATALOG_KEY)||'[]');return Array.isArray(rows)?rows.filter(m=>m&&/^mock-\d+-[a-z0-9]+$/.test(m.id)&&typeof m.name==='string'&&Array.isArray(m.refs)&&m.refs.length===50&&m.refs.every(x=>Array.isArray(x)&&x.length===2&&Number.isInteger(x[0])&&x[0]>=57&&x[0]<=80&&Number.isInteger(x[1])&&x[1]>=1&&x[1]<=50)&&new Set(m.refs.map(x=>x.join(':'))).size===50):[]}catch{return []}
}
async function loadEras(){
 if(eraMetadata)return eraMetadata;
 const response=await fetch('data/question_eras.json');if(!response.ok)throw Error('시대 분류를 불러오지 못했습니다.');
 const data=await response.json();
 if(data.eras?.length!==8||CATALOG.some(e=>data.rounds?.[e.round]?.length!==50||data.rounds[e.round].some(x=>!Number.isInteger(x)||x<0||x>=8)))throw Error('시대 분류 데이터가 불완전합니다.');
 return eraMetadata=data;
}
function drawStudyFeatures(){
 const mocks=readMocks();
 el('mockList').innerHTML=mocks.map(m=>{const saved=readState(m.id),done=Object.values(saved.attempts).filter(a=>a.length).length;return `<div class="item"><div><b>${escape(m.name)}</b><p class="muted">50문항 · 100점 · ${done}문항 완료</p></div><button class="outline" onclick="openMock('${m.id}')">이어서 풀기</button></div>`}).join('');
 const total=[...CATALOG.map(e=>e.round),...mocks.map(m=>m.id)].reduce((n,id)=>n+STUDY_TOOLS.wrongEntries(readState(id)).length,0);
 el('allWrongCount').textContent=`${total}개 복습 필요`;
}
async function createMock(){
 if(creatingMock)return;creatingMock=true;const token=++examLoadToken,status=el('mockStatus');el('createMock').disabled=true;status.textContent='시대별 분포와 배점을 맞추고 있습니다…';
 try{
  const metadata=await loadEras(),pool=[];
  // Bounded concurrent downloads; images load only when a question is opened.
  const pending=[...CATALOG];await Promise.all(Array.from({length:4},async()=>{while(pending.length){const entry=pending.shift(),exam=await loadExam(entry.round);pool.push(...exam.questions.map(q=>({...q,era:metadata.rounds[entry.round][q.question_number-1]})))}}));
  if(token!==examLoadToken)return;
  const result=STUDY_TOOLS.generate(pool,metadata.eras.length);
  const id=`mock-${Date.now()}-${Math.random().toString(36).slice(2,10)||'0'}`,mocks=readMocks();
  const mock={id,name:`자체 모의고사 ${mocks.length+1}`,createdAt:new Date().toISOString(),refs:result.questions.map(q=>[q.exam_round,q.question_number]),counts:result.counts,poolSize:result.poolSize};
  // Save the immutable source references before opening; existing exams keep their keys.
  localStorage.setItem(MOCK_CATALOG_KEY,JSON.stringify([...mocks,mock]));
  await openMock(id);status.textContent='';
 }catch(error){status.textContent=`생성하지 못했습니다. ${error.message||'연결이나 기기 저장 공간을 확인해 주세요.'}`}
 finally{creatingMock=false;el('createMock').disabled=false}
}
async function openMock(id){
 const mock=readMocks().find(m=>m.id===id);if(!mock)return false;
 const token=++examLoadToken,status=el('mockStatus');status.textContent='모의고사를 불러오고 있습니다…';
 try{
  const metadata=await loadEras(),sources=new Map();
  for(const r of new Set(mock.refs.map(x=>x[0])))sources.set(r,await loadExam(r));
  const questions=[],explanations={},choice_explanations={};
  mock.refs.forEach(([r,n],i)=>{const source=sources.get(r),q=source.questions[n-1];if(!q||q.accept_all)throw Error('사용할 수 없는 문항입니다.');questions.push({...q,source_round:r,source_number:n,question_number:i+1,era:metadata.rounds[r][n-1]});explanations[i+1]=source.explanations[n];choice_explanations[i+1]=source.choice_explanations[n]});
  if(questions.reduce((n,q)=>n+q.points,0)!==100)throw Error('총 배점이 100점이 아닙니다.');
  if(token!==examLoadToken)return false;
  activateExam(id,{questions,explanations,choice_explanations},mock.name);
  el('mockBreakdown').innerHTML='<p class="muted">등록 기출의 문항 비율을 50문항에 맞춰 반올림했습니다. 공식 출제 비율이 아니며, 원문 배점 합계는 100점입니다.</p><div class="era-chips">'+metadata.eras.map((label,era)=>`<span>${escape(label)} <b>${questions.filter(q=>q.era===era).length}문항</b></span>`).join('')+'</div>';
  status.textContent='';return true;
 }catch(error){status.textContent=`모의고사를 불러오지 못했습니다. ${error.message}`;return false}
}
async function openAllWrong(){
 const token=++examLoadToken;let eraFailed=false;try{await loadEras()}catch{eraFailed=true}if(token!==examLoadToken)return;view('allWrong');
 const needed=new Set(),mocks=readMocks();
 for(const entry of [...CATALOG.map(e=>({id:e.round})),...mocks])for(const wrong of STUDY_TOOLS.wrongEntries(readState(entry.id),true)){
  const source=typeof entry.id==='number'?entry.id:entry.refs[wrong.number-1]?.[0];if(source)needed.add(source);
 }
 el('reviewStatus').textContent='문제 제목을 불러오고 있습니다…';
 const results=await Promise.allSettled([...needed].map(loadExam));
 if(token!==examLoadToken)return;drawAllWrong();
 if(eraFailed||results.some(r=>r.status==='rejected'))el('reviewStatus').textContent='일부 제목 또는 시대 정보를 불러오지 못했습니다. 저장된 오답 기록은 그대로 유지됩니다.';
}
function drawAllWrong(){
 el('reviewStatus').textContent='';
 const includeResolved=!!el('includeResolved').checked,eraFilter=el('wrongEra').value||'all',mocks=readMocks();
 if(!el('wrongEra').innerHTML&&eraMetadata)el('wrongEra').innerHTML='<option value="all">모든 시대</option>'+eraMetadata.eras.map((name,i)=>`<option value="${i}">${escape(name)}</option>`).join('');
 const rows=[...CATALOG.map(e=>({id:e.round,name:`제${e.round}회 심화`})),...mocks].flatMap(item=>STUDY_TOOLS.wrongEntries(readState(item.id),includeResolved).map(entry=>{
  const ref=typeof item.id==='number'?[item.id,entry.number]:item.refs[entry.number-1];if(!ref)return null;
  const era=eraMetadata?.rounds[ref[0]]?.[ref[1]-1];return {...entry,...item,ref,era};
 }).filter(Boolean)).filter(row=>eraFilter==='all'||String(row.era)===eraFilter).sort((a,b)=>String(b.last.at).localeCompare(String(a.last.at)));
 el('allWrongSummary').textContent=`${rows.length}문항 · 마지막 풀이가 정답이면 복습 완료로 분류합니다.`;
 el('allWrongList').innerHTML=rows.length?rows.map(row=>{
  const cached=examCache.get(row.ref[0])?.questions[row.ref[1]-1],source=`제${row.ref[0]}회 ${row.ref[1]}번`,id=typeof row.id==='number'?row.id:`'${row.id}'`;
  return `<article class="review-entry"><div><span class="sectiontag">${escape(row.name)} · ${row.number}번</span><h2>${escape(cached?.question_text||source)}</h2><p class="muted">${escape(eraMetadata?.eras[row.era]||'시대 미분류')} · ${source} · 누적 오답 ${row.wrongCount}회 · ${row.resolved?'복습 완료':'복습 필요'}</p></div><div class="review-actions"><button class="outline" onclick="openWrongQuestion(${id},${row.number},false)">문제·해설 보기</button><button class="primary" onclick="openWrongQuestion(${id},${row.number},true)">다시 풀기</button></div></article>`;
 }).join(''):'<p class="muted">해당하는 오답이 없습니다. 문제를 풀면 여기에 자동으로 모입니다.</p>';
}
async function openWrongQuestion(id,n,again){const loaded=typeof id==='number'?await chooseExam(id):await openMock(id);if(!loaded){el('reviewStatus').textContent='문제를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';return}if(again)retry(n);else moveTo(n)}
