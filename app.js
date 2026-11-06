/* Eikon Academy portal code. Shared by the student and staff sites. */
function aperture(size, spin, color){
  color = color || 'var(--orange)';
  const blades=8, r1=size*0.46; let paths='';
  for(let i=0;i<blades;i++){
    const a=(i*360/blades)*Math.PI/180, a2=((i+1)*360/blades)*Math.PI/180;
    paths += `<path d="M${size/2} ${size/2} L${size/2+r1*Math.cos(a)} ${size/2+r1*Math.sin(a)} A${r1} ${r1} 0 0 1 ${size/2+r1*Math.cos(a2)} ${size/2+r1*Math.sin(a2)} Z" fill="${color}" opacity="${i%2?0.55:0.9}"/>`;
  }
  return `<svg class="${spin?'spin':''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size/2}" cy="${size/2}" r="${size*0.48}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.3"/>${paths}<circle cx="${size/2}" cy="${size/2}" r="${size*0.16}" fill="#3B3B3D"/></svg>`;
}
function logoMark(size){
  size=size||34;
  return `<svg width="${size}" height="${size*0.6}" viewBox="0 0 100 60" aria-hidden="true"><path d="M5 32 C25 5 55 2 90 28" stroke="#2E3192" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M8 34 C30 55 60 56 92 30" stroke="#3B3B3D" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="52" cy="30" r="15" fill="#E08A2E"/><circle cx="52" cy="30" r="7" fill="#3B3B3D"/></svg>`;
}
let session=null, flash=null;
const PORTAL=window.PORTAL||'student';
async function api(path,opts){
  const r=await fetch(path,opts); let j={};
  try{ j=await r.json(); }catch(e){}
  if(!r.ok) throw new Error(j.error||('Request failed ('+r.status+')'));
  return j;
}
function rpc(action,payload){
  return api('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Portal':window.PORTAL||'student'},body:JSON.stringify(Object.assign({action},payload||{}))});
}
function showError(msg,formEl){
  let el=document.getElementById('inlineErr');
  if(!el){ el=document.createElement('div'); el.id='inlineErr'; el.className='msg err'; el.setAttribute('role','alert'); const back=document.getElementById('backBtn'); if(back) back.after(el); else document.querySelector('main').prepend(el); }
  el.textContent=msg;
  const btn=formEl&&formEl.querySelector('button[type=submit]'); if(btn) btn.disabled=false;
  window.scrollTo(0,0);
}
function uid(){return Math.random().toString(36).slice(2,10);}
function initials(n){return (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();}
function fmtDate(ts){return new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function go(h){location.hash=h;}
const EMAIL_RE=/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const TYPOS={'gmial.com':'gmail.com','gmai.com':'gmail.com','gmail.co':'gmail.com','gmail.con':'gmail.com','gamil.com':'gmail.com','gmil.com':'gmail.com','gmail.cm':'gmail.com','yahho.com':'yahoo.com','yaho.com':'yahoo.com','yahoo.con':'yahoo.com','hotmial.com':'hotmail.com','hotmail.con':'hotmail.com','outlook.con':'outlook.com'};
const DISPOSABLE=['mailinator.com','10minutemail.com','guerrillamail.com','tempmail.com','temp-mail.org','yopmail.com','trashmail.com','sharklasers.com'];
function checkEmail(raw){
  const e=(raw||'').trim().toLowerCase();
  if(!EMAIL_RE.test(e)||e.includes('..')) return 'That email address is not written correctly.';
  const [local,domain]=e.split('@');
  if(TYPOS[domain]) return `Did you mean ${local}@${TYPOS[domain]}? Please correct the email.`;
  if(DISPOSABLE.includes(domain)) return 'Temporary email addresses are not accepted. Use your personal email.';
  if(domain==='gmail.com'){
    const l=local.replace(/\./g,'');
    if(!/^[a-z0-9.]+$/.test(local)||local.startsWith('.')||local.endsWith('.')||l.length<6||l.length>30) return 'That is not a valid Gmail address. Gmail names are 6–30 letters or numbers.';
  }
  return null;
}
function checkPhone(p){ const d=(p||'').replace(/[\s-]/g,''); return /^\+?\d{7,15}$/.test(d)?null:'Enter a valid phone number, digits only (you can start with +).'; }
function avatarHtml(u,size){
  size=size||44;
  if(u&&typeof u.photo==='string'&&u.photo.startsWith('data:image/jpeg;base64,')) return `<img src="${u.photo}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;">`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size/3)}px;">${initials(u&&u.name)}</div>`;
}
function readAsDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('read'));r.readAsDataURL(file);});}
async function resizePhoto(file){
  const src=await readAsDataURL(file);
  return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const s=220,c=document.createElement('canvas');c.width=c.height=s;const m=Math.min(img.width,img.height);c.getContext('2d').drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,s,s);res(c.toDataURL('image/jpeg',0.8));};img.onerror=()=>rej(new Error('image'));img.src=src;});
}
function hourLabel(h){return (h%12||12)+':00 '+(h<12?'AM':'PM');}
function hourShort(h){return (h%12||12)+(h<12?'am':'pm');}
function nav(h){ if(location.hash===h) render(); else go(h); }
function hashParams(){ return new URLSearchParams((location.hash.split('?')[1])||''); }
function deptOptions(sel){ return DEPTS.map(d=>`<option value="${esc(d)}" ${d===sel?'selected':''}>${esc(d)}</option>`).join(''); }
function requireStaff(roles){
  if(!session||session.role==='student'){go('#/admin');return false;}
  if(roles&&!roles.includes(session.role)){go('#/admin/dashboard');return false;}
  return true;
}
function timetableGrid(entries){
  const hours=[]; for(let h=9;h<18;h++) hours.push(h);
  const days=TT_DAYS.filter(d=>d!=='Saturday'||entries.some(e=>e.day==='Saturday'));
  const head='<th>Day</th>'+hours.map(h=>`<th>${hourShort(h)}–${hourShort(h+1)}</th>`).join('');
  const rows=days.map(d=>{
    const list=entries.filter(e=>e.day===d).sort((a,b)=>a.start-b.start);
    let cells='', h=9;
    while(h<18){
      const e=list.find(x=>x.start===h);
      if(e){ const c=cache.directory.courses.find(c=>c.code===e.course);
        cells+=`<td class="ttcell" colspan="${e.end-e.start}"><strong>${esc(e.course)}</strong>${c?`<span>${esc(c.title)}</span>`:''}${e.venue?`<span>${esc(e.venue)}</span>`:''}</td>`; h=e.end; }
      else { cells+='<td class="ttempty"></td>'; h++; }
    }
    return `<tr><th class="ttday">${d}</th>${cells}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="ttgrid"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function pageAdminLogin(){
  return `<div class="eyebrow">Staff only</div><h1 class="pagetitle">Staff login</h1><p class="sub">For heads of department, lecturers and academy coordinators.</p>
  <div class="card" style="max-width:440px;"><form id="staffLogin"><label for="se">Email</label><input id="se" name="email" type="email" required autocomplete="username"><label for="sp">Password</label><input id="sp" name="password" type="password" required autocomplete="current-password"><label for="sk">Access key</label><input id="sk" name="key" placeholder="EK-XXXXXXXX" autocapitalize="characters" autocomplete="off"><p style="font-size:12px;color:var(--muted);margin:6px 0 0;">Get your key from the academy coordinator. The first academy coordinator can leave it empty.</p><button class="btn navy" style="width:100%;margin-top:22px;" type="submit">Log in</button></form>
  <p style="text-align:center;font-size:13px;margin-top:16px;"><a href="#/admin/forgot" style="color:var(--orange);font-weight:700;">Forgot password?</a></p><p style="text-align:center;font-size:13px;color:var(--muted);margin-top:8px;">New staff? <a href="#/admin/register" style="color:var(--orange);font-weight:700;">Register with an access key</a></p></div>`;
}
function pageAdminRegister(){
  const first=!!appStats.firstSetup;
  return `<div class="eyebrow">Staff only</div><h1 class="pagetitle">Staff registration</h1><p class="sub">${first?'First-time setup: no academy coordinator exists yet. Enter the setup code from your Vercel settings (SETUP_CODE) in the box below.':'Collect an access key from the academy coordinator. It decides your role and department.'}</p>
  <div class="card" style="max-width:480px;"><form id="staffReg" novalidate><label for="gn">Full name</label><input id="gn" name="name" required autocomplete="name"><label for="ge">Email</label><input id="ge" name="email" type="email" required autocomplete="email"><label for="gp">Password</label><input id="gp" name="password" type="password" required minlength="8" autocomplete="new-password"><label for="gk">${first?'Setup code':'Access key'}</label><input id="gk" name="key" required placeholder="${first?'Setup code':'EK-XXXXXXXX'}" autocapitalize="characters" autocomplete="off"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Create staff account</button></form>
  <p style="text-align:center;font-size:13px;color:var(--muted);margin-top:16px;">Already registered? <a href="#/admin" style="color:var(--orange);font-weight:700;">Log in</a></p></div>`;
}
function pageAdminTimetable(){
  const p=hashParams(), level=p.get('level')||LEVELS[0], sem=p.get('sem')||'1', open=p.get('open')||'';
  const dept=session.department;
  const tt=cache.academics.timetables.find(t=>t.department===dept&&t.level===level&&t.semester===sem&&Array.isArray(t.entries));
  const entries=tt?tt.entries:[];
  let courses=cache.directory.courses.filter(c=>c.dept===dept&&c.level===level);
  if(!courses.length) courses=cache.directory.courses.filter(c=>c.dept===dept);
  const cOpts=courses.map(c=>`<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.title)}</option>`).join('');
  const sOpts=[9,10,11,12,13,14,15,16,17].map(h=>`<option value="${h}">${hourLabel(h)}</option>`).join('');
  const eOpts=[10,11,12,13,14,15,16,17,18].map(h=>`<option value="${h}">${hourLabel(h)}</option>`).join('');
  const days=TT_DAYS.map((d,i)=>{
    const list=entries.filter(e=>e.day===d).sort((a,b)=>a.start-b.start);
    const isOpen=open===d;
    const items=list.map(e=>{const c=cache.directory.courses.find(c=>c.code===e.course);return `<div class="ttitem"><div><strong>${esc(e.course)}</strong> ${c?'· '+esc(c.title):''}<div style="font-size:12px;color:var(--muted);">${hourLabel(e.start)} to ${hourLabel(e.end)}${e.venue?' · '+esc(e.venue):''}</div></div><button class="btn small danger ttDel" data-id="${esc(e.id)}">Remove</button></div>`;}).join('');
    return `<div class="acc"><button class="acc-head" aria-expanded="${isOpen}" aria-controls="day${i}"><span>${d} <span class="acc-count">${list.length}</span></span><span class="acc-chev" aria-hidden="true">▾</span></button><div class="acc-body" id="day${i}" ${isOpen?'':'hidden'}><div style="padding:6px 18px 0;">${items||'<p style="color:var(--muted);font-size:13px;">No courses on this day yet.</p>'}</div>
    <form class="ttAdd" data-day="${d}" style="padding:4px 18px 18px;"><label for="c${i}">Course</label><select id="c${i}" name="course" required>${cOpts||'<option value="">No courses in your department yet</option>'}</select><div class="grid grid-2" style="gap:12px;"><div><label for="s${i}">Starts</label><select id="s${i}" name="start">${sOpts}</select></div><div><label for="e${i}">Ends</label><select id="e${i}" name="end">${eOpts}</select></div></div><label for="v${i}">Venue (optional)</label><input id="v${i}" name="venue"><button class="btn small" style="margin-top:14px;" type="submit">Add course</button></form></div></div>`;
  }).join('');
  return `<div class="eyebrow">HOD · ${esc(dept)}</div><h1 class="pagetitle">Build timetable</h1><p class="sub">Pick the level and semester, open a day, then choose each course and its time. Students see changes straight away.</p>
  <div class="grid grid-2" style="max-width:520px;margin-bottom:24px;"><div><label for="ttLevel" style="margin-top:0;">Level</label><select id="ttLevel">${LEVELS.map(l=>`<option ${l===level?'selected':''}>${l}</option>`).join('')}</select></div><div><label for="ttSem" style="margin-top:0;">Semester</label><select id="ttSem">${['1','2'].map(s=>`<option ${s===sem?'selected':''}>${s}</option>`).join('')}</select></div></div>
  <div style="max-width:720px;">${days}</div>
  <h3 style="color:var(--navy);margin:36px 0 12px;">Preview · Level ${esc(level)}, Semester ${esc(sem)}</h3><div class="card">${entries.length?timetableGrid(entries):'<div class="empty">Nothing added yet.</div>'}</div>`;
}
function pageAdminIssues(){
  const list=cache.support.issues.slice().sort((a,b)=>b.ts-a.ts).map(i=>`<div class="postcard"><div class="meta"><div class="avatar" style="width:32px;height:32px;font-size:12px;">${initials(i.studentName)}</div><strong>${esc(i.studentName)}</strong><span class="pill ${i.status==='open'?'danger':'good'}">${esc(i.status)}</span><span class="date">${fmtDate(i.ts)}</span></div><h4 style="margin:0 0 6px;color:var(--navy);">${esc(i.subject)}</h4><p style="margin:0 0 12px;font-size:14px;">${esc(i.message)}</p>${i.reply?`<div style="background:var(--ghost);padding:12px 14px;border-radius:10px;"><strong style="font-size:12px;color:var(--navy);">Reply</strong><p style="margin:4px 0 0;font-size:13px;">${esc(i.reply)}</p></div>`:`<form class="replyForm" data-id="${esc(i.id)}"><textarea name="reply" placeholder="Write a reply" required></textarea><button class="btn small" style="margin-top:8px;" type="submit">Send reply and resolve</button></form>`}</div>`).join('');
  return `<div class="eyebrow">Academy coordinator</div><h1 class="pagetitle">Student issues</h1><p class="sub">Replying to an issue marks it resolved.</p>${list||`<div class="empty">${aperture(40)}<h3>No issues reported</h3></div>`}`;
}
function keyTable(list){
  if(!list.length) return '<p style="color:var(--muted);font-size:13px;margin:0;">No keys yet.</p>';
  return `<div class="tablewrap"><table><thead><tr><th>Key</th><th>Used by</th><th>Status</th><th></th></tr></thead><tbody>${list.map(k=>{const u=k.holder?{name:k.holder}:null,on=k.status==='active';return `<tr><td><code>${esc(k.code)}</code></td><td>${u?esc(u.name):'<span style="color:var(--muted);">Not used yet</span>'}</td><td><span class="pill ${on?'good':'danger'}">${on?'Active':'Disabled'}</span></td><td><button class="btn small ${on?'danger':'outline'} keyToggle" data-id="${esc(k.id)}">${on?'Disable':'Enable'}</button></td></tr>`;}).join('')}</tbody></table></div>`;
}
function pageForgot(staff){
  return `<div class="eyebrow">${staff?'Staff':'Account'} help</div><h1 class="pagetitle">Forgot password</h1><p class="sub">Enter the email you registered with. We will send a 6-digit code to it.</p><div class="card" style="max-width:440px;"><form id="forgotForm" data-staff="${staff?1:0}" novalidate><label for="fe">Email</label><input id="fe" name="email" type="email" required autocomplete="email"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Send code</button></form></div>`;
}
function pageReset(staff){
  const email=hashParams().get('email')||'';
  return `<div class="eyebrow">${staff?'Staff':'Account'} help</div><h1 class="pagetitle">Reset password</h1><p class="sub">Open the email we sent to ${esc(email||'your inbox')}, copy the 6-digit code and choose a new password. The code lasts 10 minutes.</p><div class="card" style="max-width:440px;"><form id="resetForm" data-staff="${staff?1:0}" novalidate><label for="rm">Email</label><input id="rm" name="email" type="email" required value="${esc(email)}"><label for="rcd">6-digit code</label><input id="rcd" name="code" required inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456"><label for="rn1">New password</label><input id="rn1" name="password" type="password" required minlength="8" autocomplete="new-password"><label for="rn2">Confirm new password</label><input id="rn2" name="confirm" type="password" required autocomplete="new-password"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Reset password</button></form><p style="text-align:center;font-size:13px;margin-top:16px;"><a href="#/${staff?'admin/':''}forgot" style="color:var(--orange);font-weight:700;">Send a new code</a></p></div>`;
}
function attachReset(){
  const form=(id,fn)=>{const f=document.getElementById(id); if(f) f.onsubmit=async e=>{e.preventDefault(); const btn=f.querySelector('button[type=submit]'); if(btn) btn.disabled=true; try{await fn(new FormData(f),f.dataset.staff==='1');}catch(err){showError(err.message||'Something went wrong. Please try again.',f);}};};
  form('forgotForm',async(f,staff)=>{
    const email=f.get('email').trim().toLowerCase(), err=checkEmail(email); if(err) throw new Error(err);
    await rpc('forgot',{email});
    flash={type:'ok',text:'If that email is registered, a 6-digit code has been sent to it.'};
    go(`#/${staff?'admin/':''}reset?email=${encodeURIComponent(email)}`);
  });
  form('resetForm',async(f,staff)=>{
    const email=f.get('email').trim().toLowerCase(), code=f.get('code').trim(), pw=f.get('password');
    if(!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from your email.');
    if(pw.length<8) throw new Error('Password must be at least 8 characters.');
    if(pw!==f.get('confirm')) throw new Error('The two passwords do not match.');
    await rpc('reset',{email,code,password:pw});
    flash={type:'ok',text:'Password changed. You can log in now.'}; go(staff?'#/admin':'#/login');
  });
}
function dashCard(href,title,text){return `<a href="${href}" class="card" style="display:block;">${aperture(28)}<h4 style="color:var(--navy);margin:10px 0 4px;">${title}</h4><p style="color:var(--muted);font-size:13px;margin:0;">${text}</p></a>`;}
function pageNewsletter(){
  return `<div class="eyebrow">Newsletter</div><h1 class="pagetitle">Subscribe</h1><p class="sub">Enter a real email address you check. Newsletters and academy reports are sent here.</p><div class="card" style="max-width:440px;"><form id="newsForm" novalidate><label for="ne">Email</label><input id="ne" name="email" type="email" required value="${esc(session?session.email:'')}"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Subscribe</button></form></div>`;
}
function row(l,v){return `<div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px;"><span style="color:var(--muted);">${l}</span><strong style="text-align:right;">${v?esc(v):'<span style="color:var(--muted);font-weight:500;">Not added</span>'}</strong></div>`;}
function myTimetable(){return cache.academics.timetables.filter(t=>t.department===session.department&&t.level===session.level&&Array.isArray(t.entries)&&t.entries.length).sort((a,b)=>b.ts-a.ts)[0];}
function pageTimetable(){
  const t=myTimetable();
  return `<div class="eyebrow">Academics</div><h1 class="pagetitle">Class timetable · ${esc(session.department)}</h1><p class="sub">Level ${esc(session.level)}. Published by your head of department each semester.</p>`+
  (t?`<div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;"><span class="pill orange">Level ${esc(t.level)} · Semester ${esc(t.semester)}</span><span style="font-size:12px;color:var(--muted);">Updated ${fmtDate(t.ts)}</span></div>${timetableGrid(t.entries)}<div style="margin-top:18px;"><button class="btn navy" id="ttRem">Set phone reminders for these classes</button></div></div>`:`<div class="empty">${aperture(40)}<h3>No timetable yet</h3><p>Check back once your department publishes this semester’s schedule.</p></div>`);
}
function pageCommunity(f){
  const posts=cache.community.posts.filter(p=>!f||p.type===f).sort((a,b)=>b.ts-a.ts);
  const tabs=[['','All'],['work','Shared work'],['collab','Find collaborators'],['opportunity','Opportunities']].map(([v,l])=>`<a href="#/community${v?'?type='+v:''}" class="${(f||'')===v?'active':''}">${l}</a>`).join('');
  const list=posts.map(p=>`<div class="postcard"><div class="meta"><div class="avatar" style="width:32px;height:32px;font-size:12px;">${initials(p.authorName)}</div><strong>${esc(p.authorName)}</strong><span class="pill ${p.type==='opportunity'?'orange':p.type==='collab'?'navy':'good'}">${p.type==='collab'?'Collaborator':p.type==='opportunity'?'Opportunity':'Work'}</span><span class="date">${fmtDate(p.ts)}</span></div><h4 style="margin:0 0 6px;color:var(--navy);">${esc(p.title)}</h4><p style="margin:0;font-size:14px;line-height:1.6;">${esc(p.body)}</p></div>`).join('');
  return `<div class="eyebrow">Eikon Community</div><div class="toprow"><div><h1 class="pagetitle">Community board</h1><p class="sub">Share your work, find collaborators, and post or find opportunities.</p></div><a href="#/community/new" class="btn small">New post</a></div><div class="tabbar">${tabs}</div>${list||`<div class="empty">${aperture(40)}<h3>Nothing here yet</h3><p>Be the first to post.</p></div>`}`;
}
function pageCommunityNew(){
  return `<div class="eyebrow">Eikon Community</div><h1 class="pagetitle">Create a post</h1><p class="sub">Posts appear on the community board for everyone at the academy.</p><div class="card" style="max-width:560px;"><form id="postForm"><label for="pt">Post type</label><select id="pt" name="type"><option value="work">Share work</option><option value="collab">Find a collaborator</option><option value="opportunity">Announce an opportunity</option></select><label for="ptt">Title</label><input id="ptt" name="title" required><label for="pb">Details</label><textarea id="pb" name="body" required></textarea><button class="btn" style="width:100%;margin-top:22px;" type="submit">Publish post</button></form></div>`;
}
function pageSupportNew(){
  return `<div class="eyebrow">Help</div><h1 class="pagetitle">Raise an issue</h1><p class="sub">Registration problems, wrong results, timetable clashes, anything else. The academy desk will reply.</p><div class="card" style="max-width:520px;"><form id="issueForm"><label for="is">Subject</label><input id="is" name="subject" required><label for="im">Message</label><textarea id="im" name="message" required></textarea><button class="btn" style="width:100%;margin-top:22px;" type="submit">Send</button></form></div>`;
}
/* ===================== state ===================== */
let cache={directory:{users:[],courses:[]},academics:{registrations:{},results:[],timetables:[]},community:{posts:[]},vault:{resources:[]},support:{issues:[]},newsletter:{emails:[]},keys:{keys:[]}}, appStats={}, loaded=false, adminData=null, lastCreated=null;
async function loadState(){
  try{
    const s=await rpc('state');
    cache={directory:s.directory,academics:s.academics,community:s.community,vault:s.vault,support:s.support,newsletter:{emails:[]},keys:s.keys};
    appStats=s.stats||{}; session=s.me||null;
    if(s.disabled&&!flash) flash={type:'err',text:'Your access has been disabled. See the academy coordinator.'};
    if(s.idle&&!flash) flash={type:'err',text:'You were logged out after 10 minutes away. Please log in again.'};
  }catch(e){ console.error('load failed',e); if(!flash) flash={type:'err',text:'Could not load data. Check your connection and refresh.'}; }
  loaded=true;
}

/* ===================== constants and helpers ===================== */
const TT_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DEPTS=['Photography','Video Editing','Graphic Design','Social Media / Content Creation','General Studies'];
const LEVELS=['Beginner','Intermediate','Advanced','Professional'];
const SEMS=['1','2'];
const SEXES=['Male','Female'];
const VAULT_CATS=['Templates','Presets','Fonts','Stock','Editing Assets','Checklists','E-books','Tutorials','Recommended Tools'];
const ROLE_LABEL={hod:'Head of Department',lecturer:'Lecturer',desk_officer:'Academy Coordinator',director:'Academic Director'};
function optionsHtml(list,sel,labelFn){ return list.map(v=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(labelFn?labelFn(v):v)}</option>`).join(''); }
function sessionList(){ const y=new Date().getFullYear(), out=[]; for(let s=y;s>=2020;s--) out.push(s+'/'+(s+1)); return out; }
function ageFrom(dob){ if(!dob) return ''; const d=new Date(dob), n=new Date(); let a=n.getFullYear()-d.getFullYear(); if(n<new Date(n.getFullYear(),d.getMonth(),d.getDate())) a--; return isNaN(a)?'':a; }
function fmtDob(d){ return d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):''; }
function fmtSize(n){ return n>=1024*1024?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'; }
function enc(s){ return encodeURIComponent(s==null?'':s); }
function requireStudent(){ if(!session||session.role!=='student'){go(session?'#/admin/dashboard':(PORTAL==='staff'?'#/admin':'#/login'));return false;} return true; }
function requireLogin(){ if(!session){go(PORTAL==='staff'?'#/admin':'#/login');return false;} return true; }
function isStaff(){ return !!session&&session.role!=='student'; }

/* ---- small PDF writer (text table, no libraries) ---- */
function pdfAscii(s){ return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
function makePdf(title,subtitle,head,rows,xs){
  const W=595,H=842,M=40,RH=16,perPage=Math.floor((H-2*M-70)/RH);
  const maxCh=xs.map((x,k)=>Math.floor(((k+1<xs.length?xs[k+1]:W-M)-x-6)/4.7));
  const clip=(v,k)=>{ v=String(v==null?'':v); return v.length>maxCh[k]?v.slice(0,maxCh[k]-1)+'.':v; };
  const pages=[]; let i=0; do{ pages.push(rows.slice(i,i+perPage)); i+=perPage; }while(i<rows.length);
  const objs=[]; const add=s=>{objs.push(s);return objs.length;};
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('PAGES');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds=[];
  pages.forEach((pr,pi)=>{
    let c=''; const t=(x,y,txt,bold,size)=>{ c+=`BT /${bold?'F2':'F1'} ${size||9} Tf ${x} ${y} Td (${pdfAscii(txt)}) Tj ET\n`; };
    let y=H-M;
    if(pi===0){ t(M,y,title,true,14); y-=18; t(M,y,subtitle,false,9); y-=24; } else { t(M,y,title+' (continued)',true,10); y-=24; }
    head.forEach((h,k)=>t(xs[k],y,h,true,9)); c+=`${M} ${y-4} m ${W-M} ${y-4} l S\n`; y-=RH;
    pr.forEach(r=>{ r.forEach((v,k)=>t(xs[k],y,clip(v,k),false,9)); y-=RH; });
    t(W-M-60,M-14,`Page ${pi+1} of ${pages.length}`,false,8);
    const cid=add(`<< /Length ${c.length} >>\nstream\n${c}endstream`);
    pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`));
  });
  objs[1]=`<< /Type /Pages /Kids [${pageIds.map(n=>n+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
  let out='%PDF-1.4\n'; const offs=[];
  objs.forEach((o,n)=>{ offs.push(out.length); out+=`${n+1} 0 obj\n${o}\nendobj\n`; });
  const xref=out.length;
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  out+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out],{type:'application/pdf'});
}

/* ===================== router ===================== */
async function render(){
  const app=document.getElementById('app');
  let rawHash=location.hash||'#/'; if(/^#admin\/?$/i.test(rawHash)) rawHash='#/admin';
  const [path,qs]=rawHash.slice(1).split('?');
  const params=new URLSearchParams(qs||'');
  if(PORTAL==='student'&&path.startsWith('/admin')){ go('#/'); return; }
  await loadState();
  adminData=null;
  if(isStaff()){
    try{
      const q=(params.get('q')||'').trim();
      if(path==='/admin/results'&&/^\d{2}[A-Za-z]{2}$/.test(q)) adminData=await rpc('searchStudents',{q});
      else if(path==='/admin/results/student') adminData=await rpc('getStudent',{id:params.get('id')});
      else if(path==='/admin/students'){ adminData=await rpc('studentTree'); if(params.get('dept')&&params.get('level')) adminData.list=(await rpc('listStudents',{department:params.get('dept'),level:params.get('level')})).students; }
      else if(path==='/admin/students/view'||path==='/admin/students/edit') adminData=await rpc('studentDetail',{id:params.get('id')});
      else if(path==='/admin/students/database') adminData=await rpc('listStudents',{department:params.get('dept')||'',level:params.get('level')||''});
      else if(path==='/admin/tutors') adminData=await rpc('listStaff');
    }catch(e){ adminData={error:e.message}; }
  }
  if(PORTAL==='staff'&&!path.startsWith('/admin')){
    if(!session||session.role==='student'){ go('#/admin'); return; }
    if(!['/community','/community/new','/vault','/vault/item'].includes(path)){ go('#/admin/dashboard'); return; }
  }
  if(session&&session.role==='student'&&session.mustChange&&path!=='/profile/password'){ go('#/profile/password'); return; }
  let body='', back=null;
  const S=['hod','lecturer','desk_officer','director'];
  switch(path){
    case '/': body=pageHome(); break;
    case '/login': body=pageLogin(); break;
    case '/newsletter': body=pageNewsletter(); break;
    case '/forgot': body=pageForgot(false); back='#/login'; break;
    case '/reset': body=pageReset(false); back='#/forgot'; break;
    case '/admin/forgot': body=pageForgot(true); back='#/admin'; break;
    case '/admin/reset': body=pageReset(true); back='#/admin/forgot'; break;
    case '/admin': if(isStaff()){go('#/admin/dashboard');return;} body=pageAdminLogin(); break;
    case '/admin/register': body=pageAdminRegister(); back='#/admin'; break;
    case '/admin/dashboard': if(!requireStaff(S)) return; body=pageAdminDashboard(); break;
    case '/admin/timetable': if(!requireStaff(['hod'])) return; body=pageAdminTimetable(); break;
    case '/admin/timetables': if(!requireStaff(['director'])) return; body=pageAdminAllTimetables(); break;
    case '/admin/results': if(!requireStaff(['lecturer','desk_officer','director'])) return; body=pageAdminResults(); break;
    case '/admin/results/student': { if(!requireStaff(['lecturer','desk_officer','director'])) return; body=pageAdminStudent(); const b=new URLSearchParams(); ['q','s','l','m'].forEach(k=>{if(params.get(k)) b.set(k,params.get(k));}); back='#/admin/results?'+b.toString(); break; }
    case '/admin/students': { if(!requireStaff(['desk_officer','director'])) return; body=pageAdminStudents(); const d=params.get('dept'), l=params.get('level'); back=l?'#/admin/students?dept='+enc(d):d?'#/admin/students':'#/admin/dashboard'; break; }
    case '/admin/students/new': if(!requireStaff(['desk_officer'])) return; body=pageAdminStudentForm(false); back='#/admin/students'; break;
    case '/admin/students/created': if(!requireStaff(['desk_officer'])) return; body=pageAdminStudentCreated(); back='#/admin/students'; break;
    case '/admin/students/view': { if(!requireStaff(['desk_officer','director'])) return; body=pageAdminStudentView(); const st=adminData&&adminData.student; back=st?`#/admin/students?dept=${enc(st.department)}&level=${enc(st.level)}`:'#/admin/students'; break; }
    case '/admin/students/edit': if(!requireStaff(['desk_officer'])) return; body=pageAdminStudentForm(true); back='#/admin/students/view?id='+enc(params.get('id')); break;
    case '/admin/students/database': if(!requireStaff(['desk_officer','director'])) return; body=pageAdminDatabase(); back='#/admin/students'; break;
    case '/admin/tutors': if(!requireStaff(['director'])) return; body=pageAdminTutors(); back='#/admin/dashboard'; break;
    case '/admin/courses': if(!requireStaff(['desk_officer'])) return; body=pageAdminCourses(); break;
    case '/admin/issues': if(!requireStaff(['desk_officer'])) return; body=pageAdminIssues(); break;
    case '/admin/keys': if(!requireStaff(['desk_officer'])) return; body=pageAdminKeys(); break;
    case '/admin/vault/new': if(!requireStaff(['lecturer'])) return; body=pageAdminVaultNew(); back='#/vault'; break;
    case '/dashboard': if(!requireStudent()) return; body=pageDashboard(); break;
    case '/profile': if(!requireStudent()) return; body=pageProfile(); break;
    case '/profile/edit': if(!requireStudent()) return; body=pageProfileEdit(); back='#/profile'; break;
    case '/profile/password': if(!requireStudent()) return; body=pagePassword(); back=session.mustChange?null:'#/profile'; break;
    case '/courses': if(!requireStudent()) return; body=pageCourses(); break;
    case '/results': if(!requireStudent()) return; body=pageResults(); break;
    case '/timetable': if(!requireStudent()) return; body=pageTimetable(); break;
    case '/reminders': if(!requireStudent()) return; body=pageReminders(); break;
    case '/reminders/new': if(!requireStudent()) return; body=pageReminderNew(); back='#/reminders'; break;
    case '/community': body=pageCommunity(params.get('type')); break;
    case '/community/new': if(!requireLogin()) return; body=pageCommunityNew(); back='#/community'; break;
    case '/vault': if(!requireLogin()) return; body=pageVault(params.get('open')); break;
    case '/vault/item': { if(!requireLogin()) return; const it=cache.vault.resources.find(r=>r.id===params.get('id')); body=pageVaultItem(it); back=it?'#/vault?open='+enc(it.category):'#/vault'; break; }
    case '/support/new': if(!requireStudent()) return; body=pageSupportNew(); back='#/dashboard'; break;
    default: body=`<div class="empty">${aperture(48)}<h3>Page not found</h3><a class="btn" href="#/">Go home</a></div>`;
  }
  app.innerHTML=layout(body,path,back);
  attachHandlers(path);
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',render);

/* ===================== layout ===================== */
function navFor(){
  if(!session) return PORTAL==='staff'?[]:[['#/','Home']];
  const common=[['#/community','Community'],['#/vault','Vault']];
  const r=session.role;
  if(r==='hod') return [['#/admin/dashboard','Dashboard'],['#/admin/timetable','Timetable'],...common];
  if(r==='lecturer') return [['#/admin/dashboard','Dashboard'],['#/admin/results','Results'],['#/admin/vault/new','Upload'],...common];
  if(r==='director') return [['#/admin/dashboard','Dashboard'],['#/admin/results','Results'],['#/admin/timetables','Timetables'],['#/admin/students','Students'],['#/admin/tutors','Tutors'],...common];
  if(r==='desk_officer') return [['#/admin/dashboard','Dashboard'],['#/admin/students','Students'],['#/admin/results','Results'],['#/admin/courses','Courses'],['#/admin/issues','Issues'],['#/admin/keys','Access keys'],...common];
  return [['#/dashboard','Dashboard'],['#/courses','Courses'],['#/results','Results'],['#/timetable','Timetable'],['#/reminders','Reminders'],...common];
}
function layout(body,path,back){
  const staff=isStaff();
  const nav=navFor().map(([h,l])=>`<a href="${h}" class="${('#'+path)===h?'active':''}">${l}</a>`).join('');
  const right=!session?(PORTAL==='staff'?`<a href="#/admin" class="navbtn ghost">Log In</a><a href="#/admin/register" class="navbtn">Register</a>`:`<a href="#/login" class="navbtn">Log In</a>`)
    :staff?`<div class="userchip">${avatarHtml(session,28)}${esc(session.name)} · ${esc(ROLE_LABEL[session.role]||session.role)}</div><button class="navbtn tiny" id="logoutBtn">Log Out</button>`
    :`<div class="userchip">${avatarHtml(session,28)}${esc(session.name)}</div><a href="#/profile" class="navbtn ghost tiny">Profile</a><button class="navbtn tiny" id="logoutBtn">Log Out</button>`;
  const fl=flash?`<div class="msg ${flash.type==='err'?'err':'ok'}" style="max-width:1132px;margin:16px auto 0;" role="status">${esc(flash.text)}</div>`:'';
  flash=null;
  const showBack=!['/','/dashboard','/admin','/admin/dashboard'].includes(path)&&!(path==='/profile/password'&&session&&session.mustChange);
  const backBtn=showBack?`<button class="backbtn" id="backBtn" data-back="${esc(back||'')}">← Back</button>`:'';
  return `<header class="top"><div class="top-inner"><a href="${staff?'#/admin/dashboard':(PORTAL==='staff'?'#/admin':'#/')}" class="brand-wrap">${logoMark(30)}<div><div class="brand">EIKON<span>.</span></div><div class="tagline">Becoming What You See</div></div></a><nav class="mainnav">${nav}</nav><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${right}</div></div></header>
  ${fl}<main class="page-enter">${backBtn}${body}</main><div class="footerbar">Eikon Academy · ${PORTAL==='staff'?'Staff Portal':'Student Portal'}</div>`;
}

/* ===================== student pages ===================== */
function pageHome(){
  return `<div class="hero"><div class="eyebrow" style="color:#F2A93C">Eikon Academy · Student Portal</div><h1>Becoming what you see, together.</h1><p>Register your courses, check your results, follow your timetable and join the Eikon community, all in one place.</p><div class="hero-actions"><a href="#/login" class="btn">Log in</a></div></div>
  <div class="card" style="margin-bottom:20px;"><div class="eyebrow">About the academy</div><h2 style="color:var(--navy);margin:0 0 10px;">Eikon Academy</h2><p style="margin:0;line-height:1.7;color:var(--text);max-width:760px;">Eikon Academy trains creatives in photography, video editing, graphic design and social media content creation. Students learn by doing: in the studio, on location and together as a community. [Replace with the academy’s official description.]</p></div>
  <div class="grid grid-2" style="margin-bottom:20px;"><div class="card"><div class="eyebrow">Our vision</div><p style="margin:0;line-height:1.7;">To be a leading creative academy that helps people see the world clearly and turn what they see into lasting work. [Replace with the official vision.]</p></div><div class="card"><div class="eyebrow">Our mission</div><p style="margin:0;line-height:1.7;">To give every student practical skills, strong mentorship and a creative community that supports them from first class to first client. [Replace with the official mission.]</p></div></div>
  <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;"><div><div class="eyebrow">Newsletter</div><h3 style="margin:0 0 6px;color:var(--navy);">Stay in the loop</h3><p style="margin:0;color:var(--muted);font-size:14px;">Academy news, events and opportunities, sent to your email.</p></div><a href="#/newsletter" class="btn">Subscribe</a></div>`;
}
function pageLogin(){
  return `<div class="eyebrow">Access your account</div><h1 class="pagetitle">Log in</h1><p class="sub">Use your registration number or email, and the password the academy gave you.</p>
  <div class="card" style="max-width:440px;"><form id="loginForm"><label for="li">Registration number or email</label><input id="li" name="id" required placeholder="CRE/123456789AB" autocomplete="username"><label for="lp">Password</label><input id="lp" type="password" name="password" required autocomplete="current-password"><button class="btn navy" style="width:100%;margin-top:22px;" type="submit">Log in</button></form>
  <p style="text-align:center;font-size:13px;margin-top:16px;"><a href="#/forgot" style="color:var(--orange);font-weight:700;">Forgot password?</a></p><p style="text-align:center;font-size:13px;color:var(--muted);margin-top:8px;">Accounts are created by the academy coordinator. Visit the academy office to get yours.</p></div>`;
}
function missingProfile(u){ return u.photo?[]:['picture']; }
function pageDashboard(){
  const reg=cache.academics.registrations[session.id]||[];
  const res=cache.academics.results.filter(r=>r.studentId===session.id);
  const miss=missingProfile(session);
  return `<div class="eyebrow">Welcome back</div><h1 class="pagetitle">${esc(session.name)}</h1><p class="sub">${esc(session.regNo||'')} · ${esc(session.department)} · ${esc(session.level||'')}</p>
  ${miss.length?`<a href="#/profile/edit" class="card" style="display:block;margin-bottom:24px;border-color:var(--orange);"><strong style="color:var(--navy);">Add your picture</strong><p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Your profile has no picture yet.</p></a>`:''}
  <div class="grid grid-4" style="margin-bottom:32px;"><div class="stat"><div class="n">${reg.length}</div><div class="l">Courses registered</div></div><div class="stat"><div class="n">${res.length}</div><div class="l">Results published</div></div><div class="stat"><div class="n">${(session.reminders||[]).length}</div><div class="l">Class reminders</div></div><div class="stat"><div class="n">${cache.community.posts.length}</div><div class="l">Community posts</div></div></div>
  <div class="grid grid-3">${dashCard('#/courses','Register courses','Add or drop this semester’s courses.')}${dashCard('#/results','View results','Choose a session, level and semester.')}${dashCard('#/timetable','Class timetable','See your department’s schedule.')}${dashCard('#/reminders','Class reminders','Get a phone alert 10 minutes before class.')}${dashCard('#/community','Community','Share work, find collaborators, see opportunities.')}${dashCard('#/vault','Resource vault','Files and links shared by your lecturers.')}${dashCard('#/support/new','Raise an issue','Get help from the academy coordinator.')}</div>`;
}
function pageProfile(){
  const u=session, age=ageFrom(u.dob);
  return `<div class="eyebrow">Account</div><div class="toprow"><h1 class="pagetitle">My profile</h1><div style="display:flex;gap:8px;flex-wrap:wrap;"><a href="#/profile/edit" class="btn small">Picture and phone</a><a href="#/profile/password" class="btn small outline">Change password</a></div></div>
  <div class="card" style="max-width:560px;margin-top:16px;"><div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">${avatarHtml(u,72)}<div><div style="font-weight:800;font-size:18px;color:var(--navy);">${esc(u.name)}</div><span class="pill navy">${esc(u.regNo||'')}</span></div></div>
  ${row('Registration number',u.regNo)}${row('Email',u.email)}${row('Department',u.department)}${row('Level',u.level)}${row('Sex',u.sex)}${row('Date of birth',u.dob?fmtDob(u.dob)+(age!==''?` (age ${age})`:''):'')}${row('Nationality',u.nationality)}${row('State of origin',u.state)}${row('Phone number',u.phone)}
  <p style="font-size:12px;color:var(--muted);margin:14px 0 0;">Other details are kept by the academy coordinator. Ask them to correct anything that is wrong.</p></div>`;
}
function pageProfileEdit(){
  const u=session;
  return `<div class="eyebrow">Account</div><h1 class="pagetitle">Picture and phone</h1><p class="sub">The academy coordinator manages your other details.</p>
  <div class="card" style="max-width:520px;"><form id="profileForm" novalidate>
    <div style="display:flex;align-items:center;gap:14px;">${avatarHtml(u,64)}<div style="flex:1;"><label for="pp" style="margin-top:0;">Picture</label><input id="pp" name="photo" type="file" accept="image/*"></div></div>
    <label for="ph">Phone number</label><input id="ph" name="phone" type="tel" required value="${esc(u.phone||'')}" placeholder="+234 801 234 5678">
    <button class="btn" style="width:100%;margin-top:22px;" type="submit">Save</button></form></div>`;
}
function pagePassword(){
  const must=session.mustChange;
  return `<div class="eyebrow">Account</div><h1 class="pagetitle">${must?'Choose your own password':'Change password'}</h1><p class="sub">${must?'You are using a temporary password from the academy. Choose a new one to continue.':'Use at least 8 characters.'}</p>
  <div class="card" style="max-width:440px;"><form id="passwordForm" novalidate><label for="pc" style="margin-top:0;">${must?'Temporary password':'Current password'}</label><input id="pc" name="current" type="password" required autocomplete="current-password"><label for="pn">New password</label><input id="pn" name="password" type="password" required minlength="8" autocomplete="new-password"><label for="pn2">Confirm new password</label><input id="pn2" name="confirm" type="password" required autocomplete="new-password"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Save password</button></form></div>`;
}
function pageCourses(){
  const reg=cache.academics.registrations[session.id]||[];
  const rows=cache.directory.courses.map(c=>`<tr><td><strong>${esc(c.code)}</strong></td><td>${esc(c.title)}</td><td>${esc(c.dept)}</td><td>${esc(c.level)} · Sem ${esc(c.semester)}</td><td style="white-space:nowrap;">${reg.includes(c.code)?`<span class="pill good">Registered</span> <button class="btn small outline dropBtn" data-code="${esc(c.code)}">Drop</button>`:`<button class="btn small regBtn" data-code="${esc(c.code)}">Register</button>`}</td></tr>`).join('');
  return `<div class="eyebrow">Academics</div><h1 class="pagetitle">Course registration</h1><p class="sub">Add the courses you are taking. You can drop a course unless a result is already published for it.</p><div class="card tablewrap"><table><thead><tr><th>Code</th><th>Title</th><th>Department</th><th>Level/Sem</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">The academy has not added any courses yet.</td></tr>'}</tbody></table></div>`;
}
function pageResults(){
  const p=hashParams(), s=p.get('s'), l=p.get('l'), m=p.get('m');
  const sess=sessionList();
  let out='';
  if(s&&l&&m){
    const res=cache.academics.results.filter(r=>r.session===s&&r.level===l&&r.semester===m);
    const rows=res.map(r=>{const c=cache.directory.courses.find(c=>c.code===r.courseId);return `<tr><td><strong>${esc(r.courseId)}</strong></td><td>${esc(c?c.title:'')}</td><td>${esc(r.score)}</td><td><span class="pill ${r.grade==='F'?'danger':'good'}">${esc(r.grade)}</span></td></tr>`;}).join('');
    out=`<h3 style="color:var(--navy);margin:28px 0 12px;">${esc(s)} · ${esc(l)} · Semester ${esc(m)}</h3><div class="card tablewrap"><table><thead><tr><th>Course</th><th>Title</th><th>Score</th><th>Grade</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">No results published for this selection.</td></tr>'}</tbody></table></div>`;
  }
  return `<div class="eyebrow">Academics</div><h1 class="pagetitle">My results</h1><p class="sub">Choose the session, level and semester you want to see.</p>
  <div class="card" style="max-width:480px;"><form id="resultsForm"><label for="rs" style="margin-top:0;">Session</label><select id="rs" name="s">${optionsHtml(sess,s)}</select><label for="rl">Level</label><select id="rl" name="l">${optionsHtml(LEVELS,l||session.level)}</select><label for="rm">Semester</label><select id="rm" name="m"><option value="1" ${m==='1'?'selected':''}>First semester</option><option value="2" ${m==='2'?'selected':''}>Second semester</option></select><button class="btn" style="width:100%;margin-top:20px;" type="submit">View results</button></form></div>${out}`;
}
function pageReminders(){
  const list=session.reminders||[];
  const t12=t=>{const [h,m]=t.split(':').map(Number);return ((h%12)||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM');};
  const rows=list.map(r=>`<tr><td><strong>${esc(r.code)}</strong></td><td>${esc(r.day)} ${esc(t12(r.time))}</td><td>${esc(r.venue||'')}</td><td style="white-space:nowrap;"><a class="btn small" href="/api/calendar?id=${enc(r.id)}">Add to phone</a> <button class="btn small outline delRem" data-id="${esc(r.id)}">Remove</button></td></tr>`).join('');
  return `<div class="eyebrow">Class reminders</div><div class="toprow"><div><h1 class="pagetitle">Reminders</h1><p class="sub">Choose a class, then add it to your phone’s calendar. Your phone alerts you 10 minutes before the class, even without data.</p></div><a href="#/reminders/new" class="btn small">Add a class</a></div>
  <div class="card tablewrap">${list.length?`<table><thead><tr><th>Class</th><th>When</th><th>Venue</th><th></th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:18px;"><a class="btn navy" href="/api/calendar">Add all to phone calendar</a></div>`:`<div class="empty">${aperture(40)}<h3>No classes added yet</h3><p>Add a class to set up its reminder.</p></div>`}</div>
  <p class="sub" style="margin-top:18px;font-size:13px;">Tap <strong>Add to phone</strong>, then choose <strong>Add All</strong> when your phone shows the calendar sheet. The alert sound and look come from your phone’s calendar settings.</p>`;
}
function pageReminderNew(){
  const codes=(cache.academics.registrations[session.id]||[]).map(c=>cache.directory.courses.find(x=>x.code===c)||{code:c,title:''});
  if(!codes.length) return `<div class="eyebrow">Class reminders</div><h1 class="pagetitle">Add a class</h1><div class="empty">${aperture(40)}<h3>Register a course first</h3><p>Reminders are made for the courses you have registered.</p><a href="#/courses" class="btn">Go to courses</a></div>`;
  return `<div class="eyebrow">Class reminders</div><h1 class="pagetitle">Add a class</h1><p class="sub">The reminder will say, for example, “GST 101 holds in 10 minutes, starts by 9:00 AM”.</p><div class="card" style="max-width:480px;"><form id="remForm"><label for="rc">Course</label><select id="rc" name="code" required>${codes.map(c=>`<option value="${esc(c.code)}">${esc(c.code)}${c.title?' · '+esc(c.title):''}</option>`).join('')}</select><label for="rday">Day</label><select id="rday" name="day">${optionsHtml(DAYS)}</select><label for="rt">Start time</label><input id="rt" name="time" type="time" required><label for="rv">Venue (optional)</label><input id="rv" name="venue"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Save class</button></form></div>`;
}

/* ===================== vault (everyone) ===================== */
function canRemove(it){ return session&&((session.role==='lecturer'&&it.by===session.id)||session.role==='director'||session.role==='desk_officer'); }
function pageVault(open){
  const acc=VAULT_CATS.map((c,i)=>{
    const items=cache.vault.resources.filter(r=>r.category===c);
    const isOpen=open===c;
    return `<div class="acc"><button class="acc-head" aria-expanded="${isOpen}" aria-controls="acc${i}"><span>${esc(c)} <span class="acc-count">${items.length}</span></span><span class="acc-chev" aria-hidden="true">▾</span></button><div class="acc-body" id="acc${i}" ${isOpen?'':'hidden'}>${items.length?items.map(r=>`<a class="acc-item" href="#/vault/item?id=${enc(r.id)}"><span>${esc(r.title)}</span><span aria-hidden="true">›</span></a>`).join(''):'<p style="color:var(--muted);font-size:13px;padding:14px 18px;margin:0;">Nothing here yet.</p>'}</div></div>`;
  }).join('');
  const up=session&&session.role==='lecturer'?`<a href="#/admin/vault/new" class="btn small">Upload to the vault</a>`:'';
  return `<div class="eyebrow">Resources</div><div class="toprow"><div><h1 class="pagetitle">Resource vault</h1><p class="sub">Files and links shared by your lecturers. Tap a category, then tap an item.</p></div>${up}</div><div style="max-width:720px;">${acc}</div>`;
}
function pageVaultItem(it){
  if(!it) return `<div class="empty">${aperture(40)}<h3>Resource not found</h3></div>`;
  const action=it.kind==='file'?`<a class="btn" href="/api/file?id=${enc(it.id)}">Download (${esc(fmtSize(it.fileSize||0))})</a>`:`<a class="btn" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Open link</a>`;
  return `<div class="eyebrow">${esc(it.category)}</div><h1 class="pagetitle">${esc(it.title)}</h1><p class="sub">${esc(it.description||'')}</p><div class="card" style="max-width:560px;"><span class="pill orange">${esc(it.category)}</span><p style="color:var(--muted);font-size:13px;margin:14px 0;">Shared by ${esc(it.byName||'a lecturer')} on ${fmtDate(it.ts)}${it.kind==='file'?' · '+esc(it.fileName||''):''}</p><div style="display:flex;gap:10px;flex-wrap:wrap;">${action}${canRemove(it)?`<button class="btn outline danger" id="delResource" data-id="${esc(it.id)}">Remove</button>`:''}</div></div>`;
}

/* ===================== staff pages ===================== */
function pageAdminDashboard(){
  const r=session.role, s=appStats;
  let stats='', cards='';
  if(r==='hod'){
    const n=cache.academics.timetables.filter(t=>t.department===session.department&&Array.isArray(t.entries)).length;
    stats=`<div class="stat"><div class="n">${n}</div><div class="l">Timetables</div></div><div class="stat"><div class="n">${s.students||0}</div><div class="l">Students</div></div>`;
    cards=dashCard('#/admin/timetable','Build timetable','Set the days, courses and times for each level.');
  } else if(r==='lecturer'){
    stats=`<div class="stat"><div class="n">${s.results||0}</div><div class="l">Results published</div></div><div class="stat"><div class="n">${s.students||0}</div><div class="l">Students</div></div>`;
    cards=dashCard('#/admin/results','Enter results','Find a student by their registration number ending.')+dashCard('#/admin/vault/new','Upload to the vault','Share files and links with students.');
  } else if(r==='director'){
    stats=`<div class="stat"><div class="n">${s.students||0}</div><div class="l">Students</div></div><div class="stat"><div class="n">${s.staff||0}</div><div class="l">Staff</div></div><div class="stat"><div class="n">${s.results||0}</div><div class="l">Results</div></div><div class="stat"><div class="n">${cache.academics.timetables.length}</div><div class="l">Timetables</div></div>`;
    cards=dashCard('#/admin/results','Results','Find a student and view or enter results.')+dashCard('#/admin/timetables','All timetables','See every department’s class timetable.')+dashCard('#/admin/students','Students','Browse by department and level.')+dashCard('#/admin/students/database','Student database','Print or download the student list.')+dashCard('#/admin/tutors','Tutors','Lecturers, HODs and coordinators.')+dashCard('#/vault','Resource vault','Everything shared by lecturers.');
  } else {
    const open=cache.support.issues.filter(i=>i.status==='open').length, keys=cache.keys.keys.filter(k=>k.status==='active').length;
    stats=`<div class="stat"><div class="n">${cache.directory.courses.length}</div><div class="l">Courses</div></div><div class="stat"><div class="n">${s.students||0}</div><div class="l">Students</div></div><div class="stat"><div class="n">${open}</div><div class="l">Open issues</div></div><div class="stat"><div class="n">${keys}</div><div class="l">Active keys</div></div>`;
    cards=dashCard('#/admin/students/new','Add a student','Fill in a new student’s details and create their portal account.')+dashCard('#/admin/students','Students','Browse by department and level.')+dashCard('#/admin/students/database','Student database','Print or download the student list.')+dashCard('#/admin/results','Enter results','Find a student by their registration number ending.')+dashCard('#/admin/courses','Manage courses','Add courses to the catalogue.')+dashCard('#/admin/issues','Student issues','Reply to problems students report.')+dashCard('#/admin/keys','Access keys','Generate and disable staff access keys.');
  }
  return `<div class="eyebrow">${esc(ROLE_LABEL[r])}</div><h1 class="pagetitle">Welcome, ${esc(session.name)}</h1><p class="sub">${esc(session.department)}</p><div class="grid grid-4" style="margin-bottom:32px;">${stats}</div><div class="grid grid-2">${cards}</div>`;
}
function pageAdminResults(){
  const p=hashParams(), q=(p.get('q')||'').trim(), s=p.get('s')||sessionList()[0], l=p.get('l')||LEVELS[0], m=p.get('m')||'1';
  let body='';
  if(q){
    if(!/^\d{2}[A-Za-z]{2}$/.test(q)) body=`<div class="msg err">Enter the last two digits and the two letters, for example 89AB.</div>`;
    else if(adminData&&adminData.error) body=`<div class="msg err">${esc(adminData.error)}</div>`;
    else{
      const list=(adminData&&adminData.matches)||[];
      body=list.length?`<div class="acc" style="max-width:520px;">${list.map(x=>`<a class="acc-item" href="#/admin/results/student?id=${enc(x.id)}&q=${enc(q)}&s=${enc(s)}&l=${enc(l)}&m=${enc(m)}"><span>${esc(x.regNo)}</span><span aria-hidden="true">›</span></a>`).join('')}</div>`:`<div class="empty">${aperture(40)}<h3>No student found</h3><p>Check the digits and letters and try again.</p></div>`;
    }
  }
  return `<div class="eyebrow">Results</div><h1 class="pagetitle">Find a student</h1><p class="sub">Choose the session, level and semester. Then type the last two digits and two letters of the student’s registration number, for example 89AB for CRE/123456789AB.</p>
  <div class="card" style="max-width:520px;margin-bottom:24px;"><form id="findForm"><label for="fs" style="margin-top:0;">Session</label><select id="fs" name="s">${optionsHtml(sessionList(),s)}</select><label for="fl">Level</label><select id="fl" name="l">${optionsHtml(LEVELS,l)}</select><label for="fm">Semester</label><select id="fm" name="m"><option value="1" ${m==='1'?'selected':''}>First semester</option><option value="2" ${m==='2'?'selected':''}>Second semester</option></select><label for="fq">Registration number ending</label><input id="fq" name="q" required maxlength="4" value="${esc(q)}" placeholder="89AB" autocapitalize="characters" autocomplete="off"><button class="btn" style="width:100%;margin-top:18px;" type="submit">Search</button></form></div>${body}`;
}
function pageAdminStudent(){
  const a=adminData, p=hashParams();
  if(!a||a.error||!a.student) return `<div class="empty">${aperture(40)}<h3>${a&&a.error?esc(a.error):'Student not found'}</h3></div>`;
  const s=a.student, courses=a.courses||[], res=a.results||[];
  const sv=p.get('s')||sessionList()[0], lv=p.get('l')||s.level, mv=p.get('m')||'1';
  const rows=res.map(r=>`<tr><td><strong>${esc(r.courseId)}</strong></td><td>${esc(r.session)}</td><td>${esc(r.level)}</td><td>${esc(r.semester)}</td><td>${esc(r.score)}</td><td><span class="pill ${r.grade==='F'?'danger':'good'}">${esc(r.grade)}</span></td></tr>`).join('');
  const addable=a.addable||[];
  return `<div class="eyebrow">Student details</div><h1 class="pagetitle">${esc(s.name)}</h1><p class="sub">${esc(s.regNo)} · ${esc(s.department)} · ${esc(s.level)}</p>
  <div class="grid grid-2"><div class="card"><h4 style="margin-top:0;color:var(--navy);">Enter a result</h4>${courses.length?`<form id="resultForm"><input type="hidden" name="studentId" value="${esc(s.id)}"><label for="rc">Course</label><select id="rc" name="course" required>${courses.map(c=>`<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.title)}</option>`).join('')}</select><label for="rss">Session</label><select id="rss" name="session">${optionsHtml(sessionList(),sv)}</select><label for="rll">Level</label><select id="rll" name="level">${optionsHtml(LEVELS,lv)}</select><label for="rsem">Semester</label><select id="rsem" name="semester"><option value="1" ${mv==='1'?'selected':''}>First semester</option><option value="2" ${mv==='2'?'selected':''}>Second semester</option></select><label for="rsc">Score (0–100)</label><input id="rsc" name="score" type="number" min="0" max="100" step="0.5" required><button class="btn" style="width:100%;margin-top:22px;" type="submit">Publish result</button></form>`:`<p style="color:var(--muted);font-size:14px;">This student has no registered course you can enter results for. Add one on the right.</p>`}</div>
  <div class="card"><h4 style="margin-top:0;color:var(--navy);">Add a course for this student</h4>${addable.length?`<form id="addCourseForm"><input type="hidden" name="studentId" value="${esc(s.id)}"><label for="ac" style="margin-top:0;">Course</label><select id="ac" name="code">${addable.map(c=>`<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.title)}</option>`).join('')}</select><button class="btn" style="width:100%;margin-top:18px;" type="submit">Add course</button></form>`:`<p style="color:var(--muted);font-size:14px;">No more courses available to add.</p>`}</div></div>
  <div class="card tablewrap" style="margin-top:20px;"><h4 style="margin-top:0;color:var(--navy);">Results so far</h4><table><thead><tr><th>Course</th><th>Session</th><th>Level</th><th>Sem</th><th>Score</th><th>Grade</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">None yet.</td></tr>'}</tbody></table></div>`;
}
function pageAdminStudents(){
  const p=hashParams(), dept=p.get('dept'), level=p.get('level'), a=adminData||{};
  const isCo=session.role==='desk_officer';
  const top=`<div class="toprow"><div><div class="eyebrow">Students</div><h1 class="pagetitle">${level?esc(dept)+' · '+esc(level):dept?esc(dept):'Departments'}</h1></div><div style="display:flex;gap:8px;flex-wrap:wrap;">${isCo?'<a href="#/admin/students/new" class="btn small">Add a student</a>':''}<a href="#/admin/students/database" class="btn small outline">Database</a></div></div>`;
  if(a.error) return top+`<div class="msg err">${esc(a.error)}</div>`;
  const tree=a.tree||{};
  let body='';
  if(!dept){
    body=`<p class="sub">Choose a department.</p><div class="acc" style="max-width:560px;">${DEPTS.map(d=>{const n=Object.values(tree[d]||{}).reduce((x,y)=>x+y,0);return `<a class="acc-item" href="#/admin/students?dept=${enc(d)}"><span>${esc(d)}</span><span>${n} ›</span></a>`;}).join('')}</div>`;
  } else if(!level){
    body=`<p class="sub">Choose a level.</p><div class="acc" style="max-width:560px;">${LEVELS.map(l=>`<a class="acc-item" href="#/admin/students?dept=${enc(dept)}&level=${enc(l)}"><span>${esc(l)}</span><span>${(tree[dept]||{})[l]||0} ›</span></a>`).join('')}</div>`;
  } else {
    const list=a.list||[];
    body=list.length?`<div class="acc" style="max-width:640px;">${list.map(s=>`<a class="acc-item" href="#/admin/students/view?id=${enc(s.id)}"><span>${esc(s.name)} <span style="color:var(--muted);font-size:12px;">${esc(s.regNo)}</span></span><span aria-hidden="true">›</span></a>`).join('')}</div>`:`<div class="empty">${aperture(40)}<h3>No students here yet</h3></div>`;
  }
  return top+body;
}
function pageAdminStudentForm(edit){
  const a=adminData, p=hashParams();
  if(edit&&(!a||a.error||!a.student)) return `<div class="empty">${aperture(40)}<h3>${a&&a.error?esc(a.error):'Student not found'}</h3></div>`;
  const s=edit?a.student:{};
  return `<div class="eyebrow">Students</div><h1 class="pagetitle">${edit?'Edit student':'Add a student'}</h1><p class="sub">${edit?'Change the details below, then save.':'Fill in the student’s form details, generate a registration number, then save. A temporary password is created for the student.'}</p>
  <div class="card" style="max-width:560px;"><form id="studentForm" data-id="${esc(edit?s.id:'')}" novalidate>
    <label for="sn" style="margin-top:0;">Full name</label><input id="sn" name="name" required value="${esc(s.name||'')}">
    <label for="sd">Department</label><select id="sd" name="department">${optionsHtml(DEPTS,s.department)}</select>
    <label for="sl">Level</label><select id="sl" name="level">${optionsHtml(LEVELS,s.level)}</select>
    <label for="sb">Date of birth</label><input id="sb" name="dob" type="date" required value="${esc(s.dob||'')}" max="${new Date().toISOString().slice(0,10)}">
    <label>Age</label><input id="sa" value="${esc(s.dob?ageFrom(s.dob):'')}" disabled placeholder="Worked out from the date of birth">
    <label for="sx">Sex</label><select id="sx" name="sex">${optionsHtml(SEXES,s.sex)}</select>
    <label for="sna">Nationality</label><input id="sna" name="nationality" required value="${esc(s.nationality||'')}">
    <label for="sst">State of origin</label><input id="sst" name="state" required value="${esc(s.state||'')}">
    <label for="sp">Phone number</label><input id="sp" name="phone" type="tel" required value="${esc(s.phone||'')}" placeholder="+234 801 234 5678">
    <label for="se">Email address</label><input id="se" name="email" type="email" required value="${esc(s.email||'')}">
    <label for="sr">Registration number</label>
    <div style="display:flex;gap:8px;"><input id="sr" name="regNo" value="${esc(s.regNo||'')}" readonly placeholder="Tap Generate" style="flex:1;">${edit?'':'<button class="btn small" type="button" id="genReg">Generate registration number</button>'}</div>
    <button class="btn" style="width:100%;margin-top:22px;" type="submit">${edit?'Save changes':'Save student'}</button></form></div>`;
}
function pageAdminStudentCreated(){
  const c=lastCreated;
  if(!c) return `<div class="empty">${aperture(40)}<h3>Nothing to show</h3><p>The temporary password is only shown once, right after saving.</p><a href="#/admin/students" class="btn">Back to students</a></div>`;
  return `<div class="eyebrow">Student created</div><h1 class="pagetitle">${esc(c.name)} is registered</h1><p class="sub">Give these login details to the student. The temporary password is shown only once, and the student must choose their own at first login.</p>
  <div class="card" style="max-width:520px;"><div style="padding:6px 0;font-size:12px;color:var(--muted);">REGISTRATION NUMBER</div><div style="font-size:22px;font-weight:800;color:var(--navy);letter-spacing:1px;">${esc(c.regNo)}</div><div style="padding:18px 0 6px;font-size:12px;color:var(--muted);">TEMPORARY PASSWORD</div><div style="font-size:22px;font-weight:800;color:var(--navy);letter-spacing:2px;font-family:monospace;">${esc(c.tempPassword)}</div>
  <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;" class="no-print"><button class="btn" id="printBtn">Print</button><a class="btn outline" href="#/admin/students/new">Add another student</a><a class="btn outline" href="#/admin/students/view?id=${enc(c.id)}">View student</a></div></div>`;
}
function pageAdminStudentView(){
  const a=adminData;
  if(!a||a.error||!a.student) return `<div class="empty">${aperture(40)}<h3>${a&&a.error?esc(a.error):'Student not found'}</h3></div>`;
  const s=a.student, isCo=session.role==='desk_officer';
  const regCodes=new Set((a.courses||[]).map(c=>c.code));
  const addable=cache.directory.courses.filter(c=>!regCodes.has(c.code));
  return `<div class="eyebrow">Student details</div><div class="toprow"><h1 class="pagetitle">${esc(s.name)}</h1>${isCo?`<div style="display:flex;gap:8px;"><a class="btn small outline" href="#/admin/students/edit?id=${enc(s.id)}">Edit</a><button class="btn small danger" id="delStudent" data-id="${esc(s.id)}" data-name="${esc(s.name)}">Delete student</button></div>`:''}</div>
  <div class="grid grid-2" style="margin-top:16px;"><div class="card">${row('Registration number',s.regNo)}${row('Email',s.email)}${row('Department',s.department)}${row('Level',s.level)}${row('Sex',s.sex)}${row('Date of birth',s.dob?fmtDob(s.dob)+` (age ${ageFrom(s.dob)})`:'')}${row('Nationality',s.nationality)}${row('State of origin',s.state)}${row('Phone number',s.phone)}</div>
  <div class="card"><h4 style="margin-top:0;color:var(--navy);">Registered courses</h4>${(a.courses||[]).length?(a.courses).map(c=>`<div class="ttitem"><div><strong>${esc(c.code)}</strong> · ${esc(c.title)}</div></div>`).join(''):'<p style="color:var(--muted);font-size:14px;">None yet.</p>'}
  ${addable.length?`<form id="addCourseForm" style="margin-top:16px;"><input type="hidden" name="studentId" value="${esc(s.id)}"><label for="ac">Add a course</label><select id="ac" name="code">${addable.map(c=>`<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.title)}</option>`).join('')}</select><button class="btn small" style="margin-top:12px;" type="submit">Add course</button></form>`:''}</div></div>`;
}
function pageAdminDatabase(){
  const p=hashParams(), dept=p.get('dept')||'', level=p.get('level')||'', a=adminData||{};
  const list=a.students||[];
  const rows=list.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.regNo)}</td><td>${esc(s.phone)}</td><td>${esc(s.email)}</td><td>${esc(s.sex)}</td></tr>`).join('');
  return `<div class="eyebrow">Students</div><h1 class="pagetitle">Student database</h1><p class="sub no-print">Filter, then download or print the list.</p>
  <div class="no-print grid grid-2" style="max-width:560px;margin-bottom:16px;"><div><label for="dbd" style="margin-top:0;">Department</label><select id="dbd"><option value="">All departments</option>${optionsHtml(DEPTS,dept)}</select></div><div><label for="dbl" style="margin-top:0;">Level</label><select id="dbl"><option value="">All levels</option>${optionsHtml(LEVELS,level)}</select></div></div>
  <div class="no-print" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;"><button class="btn small" id="dbPdf" ${list.length?'':'disabled'}>Download PDF</button><button class="btn small outline" id="printBtn" ${list.length?'':'disabled'}>Print</button></div>
  ${a.error?`<div class="msg err">${esc(a.error)}</div>`:''}
  <div class="card tablewrap"><div style="font-size:13px;color:var(--muted);margin-bottom:10px;">${esc(dept||'All departments')} · ${esc(level||'All levels')} · ${list.length} student${list.length===1?'':'s'}</div><table id="dbTable"><thead><tr><th>Student name</th><th>Reg number</th><th>Phone</th><th>Email</th><th>Sex</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">No students found.</td></tr>'}</tbody></table></div>`;
}
function pageAdminTutors(){
  const a=adminData||{};
  if(a.error) return `<div class="empty"><h3>${esc(a.error)}</h3></div>`;
  const rows=(a.staff||[]).map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(ROLE_LABEL[x.role]||x.role)}</td><td>${esc(x.department)}</td><td>${esc(x.email)}</td><td><span class="pill ${x.active?'good':'danger'}">${x.active?'Active':'Disabled'}</span></td></tr>`).join('');
  return `<div class="eyebrow">Academic director</div><h1 class="pagetitle">Tutors</h1><p class="sub">Every lecturer, head of department and coordinator on the portal.</p><div class="card tablewrap"><table><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th><th>Access</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">No staff yet.</td></tr>'}</tbody></table></div>`;
}
function pageAdminAllTimetables(){
  const p=hashParams(), dept=p.get('dept')||DEPTS[0], level=p.get('level')||LEVELS[0], sem=p.get('sem')||'1';
  const tt=cache.academics.timetables.find(t=>t.department===dept&&t.level===level&&t.semester===sem&&Array.isArray(t.entries));
  return `<div class="eyebrow">Academic director</div><h1 class="pagetitle">All timetables</h1><p class="sub">Pick a department, level and semester.</p>
  <div class="grid grid-3" style="max-width:720px;margin-bottom:20px;"><div><label for="tad" style="margin-top:0;">Department</label><select id="tad">${optionsHtml(DEPTS,dept)}</select></div><div><label for="tal" style="margin-top:0;">Level</label><select id="tal">${optionsHtml(LEVELS,level)}</select></div><div><label for="tas" style="margin-top:0;">Semester</label><select id="tas">${optionsHtml(SEMS,sem)}</select></div></div>
  <div class="card">${tt&&tt.entries.length?timetableGrid(tt.entries):`<div class="empty">No timetable published for this selection.</div>`}</div>`;
}
function pageAdminCourses(){
  const rows=cache.directory.courses.map(c=>`<tr><td><strong>${esc(c.code)}</strong></td><td>${esc(c.title)}</td><td>${esc(c.dept)}</td><td>${esc(c.level)} · Sem ${esc(c.semester)}</td></tr>`).join('');
  return `<div class="eyebrow">Academy coordinator</div><h1 class="pagetitle">Manage courses</h1><p class="sub">New courses are open for student registration immediately.</p><div class="grid grid-2"><div class="card"><form id="courseForm"><label for="cc" style="margin-top:0;">Course code</label><input id="cc" name="code" required placeholder="GST 101"><label for="ct">Course title</label><input id="ct" name="title" required><label for="cd">Department</label><select id="cd" name="dept">${deptOptions()}</select><label for="cl">Level</label><select id="cl" name="level">${optionsHtml(LEVELS)}</select><label for="cs">Semester</label><select id="cs" name="semester"><option value="1">First semester</option><option value="2">Second semester</option></select><button class="btn" style="width:100%;margin-top:22px;" type="submit">Add course</button></form></div><div class="card tablewrap"><h4 style="margin-top:0;color:var(--navy);">Current catalogue</h4><table><thead><tr><th>Code</th><th>Title</th><th>Dept</th><th>Level/Sem</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">No courses yet. Add the first one.</td></tr>'}</tbody></table></div></div>`;
}
function pageAdminKeys(){
  const ks=cache.keys.keys.slice().sort((a,b)=>b.createdAt-a.createdAt);
  const groups=[['hod','Heads of department'],['lecturer','Lecturers']].map(([role,label])=>`<h3 style="color:var(--navy);margin:28px 0 12px;">${label}</h3>`+(DEPTS.map(d=>{const l=ks.filter(k=>k.role===role&&k.department===d);return l.length?`<div class="card" style="margin-bottom:14px;"><h4 style="margin:0 0 12px;">${esc(d)}</h4>${keyTable(l)}</div>`:'';}).join('')||'<p style="color:var(--muted);font-size:13px;">No keys yet.</p>')).join('');
  const other=[['director','Academic director'],['desk_officer','Academy coordinators']].map(([role,label])=>{const l=ks.filter(k=>k.role===role);return l.length?`<h3 style="color:var(--navy);margin:28px 0 12px;">${label}</h3><div class="card">${keyTable(l)}</div>`:'';}).join('');
  return `<div class="eyebrow">Academy coordinator</div><h1 class="pagetitle">Access keys</h1><p class="sub">Staff need a key to register and at every login. Disable a key and its owner is locked out. Give each key to one person only.</p>
  <div class="card" style="max-width:480px;"><form id="keyForm"><label for="kr" style="margin-top:0;">Key for</label><select id="kr" name="role"><option value="hod">Head of department</option><option value="lecturer">Lecturer</option><option value="director">Academic director</option><option value="desk_officer">Academy coordinator</option></select><label for="kd">Department (for HODs and lecturers)</label><select id="kd" name="department">${deptOptions()}</select><button class="btn" style="width:100%;margin-top:20px;" type="submit">Generate key</button></form></div>
  ${groups}${other}`;
}
function pageAdminVaultNew(){
  return `<div class="eyebrow">Lecturer</div><h1 class="pagetitle">Upload to the vault</h1><p class="sub">Share a file (up to 500 KB) or paste a link to a bigger file on Google Drive, YouTube or similar. Students will see it in the Resource vault.</p>
  <div class="card" style="max-width:560px;"><form id="vaultForm" novalidate><label for="vc" style="margin-top:0;">Category</label><select id="vc" name="category">${optionsHtml(VAULT_CATS)}</select><label for="vt">Title</label><input id="vt" name="title" required><label for="vd">Short description (optional)</label><textarea id="vd" name="description" style="min-height:70px;"></textarea><label for="vf">File</label><input id="vf" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.zip,.txt,.csv,.docx,.xlsx,.pptx,.ttf,.otf,.woff,.woff2,.mp3,.cube,.xmp"><p style="text-align:center;color:var(--muted);font-size:12px;margin:10px 0 0;">or</p><label for="vl">Link</label><input id="vl" name="link" type="url" placeholder="https://"><button class="btn" style="width:100%;margin-top:22px;" type="submit">Upload</button></form></div>`;
}

/* ===================== idle logout ===================== */
let lastActive=Date.now();
const IDLE_MS=10*60*1000;
['click','keydown','touchstart','scroll','mousemove'].forEach(ev=>window.addEventListener(ev,()=>{ lastActive=Date.now(); },{passive:true}));
async function idleCheck(){
  if(!session||Date.now()-lastActive<=IDLE_MS) return;
  const staff=isStaff();
  try{ await rpc('logout'); }catch(e){}
  session=null; flash={type:'err',text:'You were logged out after 10 minutes away. Please log in again.'};
  nav(staff?'#/admin':'#/login');
}
setInterval(idleCheck,15000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) idleCheck(); });

/* ===================== actions ===================== */
function attachAdmin(path){
  const form=(id,fn)=>{const f=document.getElementById(id); if(f) f.onsubmit=async e=>{e.preventDefault(); const btn=f.querySelector('button[type=submit]'); if(btn) btn.disabled=true; try{await fn(new FormData(f),f);}catch(err){showError(err.message||'Something went wrong. Please try again.',f);}};};
  const ok=(t,h)=>{flash={type:'ok',text:t};nav(h);};
  const act=async(fn)=>{ try{await fn();}catch(err){showError(err.message||'Something went wrong. Please try again.');} };

  form('staffLogin',async f=>{ const r=await rpc('staffLogin',{email:f.get('email').trim(),password:f.get('password'),key:(f.get('key')||'').trim()}); ok(`Welcome, ${r.name}.`,'#/admin/dashboard'); });
  form('staffReg',async f=>{
    const email=f.get('email').trim().toLowerCase(), err=checkEmail(email); if(err) throw new Error(err);
    const r=await rpc('staffRegister',{name:f.get('name').trim(),email,password:f.get('password'),key:(f.get('key')||'').trim()});
    ok(`Account created. You are registered as ${ROLE_LABEL[r.role]}.`,'#/admin/dashboard');
  });
  form('keyForm',async f=>{ const r=await rpc('genKey',{role:f.get('role'),department:f.get('department')}); ok(`New key generated: ${r.code}`,'#/admin/keys'); });
  document.querySelectorAll('.keyToggle').forEach(b=>b.onclick=()=>act(async()=>{ const r=await rpc('toggleKey',{id:b.dataset.id}); ok(r.status==='active'?'Key enabled.':'Key disabled. Its owner can no longer log in.','#/admin/keys'); }));
  form('findForm',async f=>{ nav(`#/admin/results?q=${enc(f.get('q').trim())}&s=${enc(f.get('s'))}&l=${enc(f.get('l'))}&m=${enc(f.get('m'))}`); });
  form('resultForm',async f=>{ await rpc('publishResult',{studentId:f.get('studentId'),course:f.get('course'),session:f.get('session'),level:f.get('level'),semester:f.get('semester'),score:f.get('score')}); ok('Result published to the student.',location.hash); });
  form('addCourseForm',async f=>{ await rpc('staffAddCourse',{studentId:f.get('studentId'),code:f.get('code')}); ok(`${f.get('code')} added for the student.`,location.hash); });
  form('courseForm',async f=>{ const r=await rpc('addCourse',{code:f.get('code'),title:f.get('title'),dept:f.get('dept'),level:f.get('level'),semester:f.get('semester')}); ok(`${r.code} added to the catalogue.`,'#/admin/courses'); });
  document.querySelectorAll('.replyForm').forEach(rf=>rf.onsubmit=e=>{ e.preventDefault(); act(async()=>{ await rpc('replyIssue',{id:rf.dataset.id,reply:new FormData(rf).get('reply')}); ok('Reply sent and issue resolved.','#/admin/issues'); }); });

  /* students (coordinator) */
  const sb=document.getElementById('sb'); if(sb) sb.onchange=()=>{ const a=document.getElementById('sa'); if(a) a.value=ageFrom(sb.value); };
  const gr=document.getElementById('genReg'); if(gr) gr.onclick=()=>act(async()=>{ const r=await rpc('genRegNo'); document.getElementById('sr').value=r.regNo; });
  form('studentForm',async(f,el)=>{
    const email=f.get('email').trim().toLowerCase(), err=checkEmail(email); if(err) throw new Error(err);
    const ph=checkPhone(f.get('phone')); if(ph) throw new Error(ph);
    const body={name:f.get('name').trim(),department:f.get('department'),level:f.get('level'),dob:f.get('dob'),sex:f.get('sex'),nationality:f.get('nationality').trim(),state:f.get('state').trim(),phone:f.get('phone').trim(),email,regNo:f.get('regNo')};
    const id=el.dataset.id;
    if(id){ await rpc('updateStudent',Object.assign(body,{id})); ok('Student details saved.','#/admin/students/view?id='+enc(id)); }
    else { const r=await rpc('createStudent',body); lastCreated=r; go('#/admin/students/created'); }
  });
  const ds=document.getElementById('delStudent'); if(ds) ds.onclick=()=>act(async()=>{
    if(!confirm(`Delete ${ds.dataset.name}? This removes their account, course registrations and results. It cannot be undone.`)) return;
    await rpc('deleteStudent',{id:ds.dataset.id}); ok('Student deleted.','#/admin/students');
  });
  const pb=document.getElementById('printBtn'); if(pb) pb.onclick=()=>window.print();
  const dd=document.getElementById('dbd'), dl=document.getElementById('dbl');
  if(dd&&dl){ const go2=()=>nav(`#/admin/students/database?dept=${enc(dd.value)}&level=${enc(dl.value)}`); dd.onchange=go2; dl.onchange=go2; }
  const pdf=document.getElementById('dbPdf'); if(pdf) pdf.onclick=()=>{
    const list=(adminData&&adminData.students)||[], p=hashParams();
    const sub=`${p.get('dept')||'All departments'} | ${p.get('level')||'All levels'} | ${list.length} students | ${new Date().toLocaleDateString('en-GB')}`;
    const blob=makePdf('Eikon Academy - Student details',sub,['Student name','Reg number','Phone','Email','Sex'],list.map(s=>[s.name,s.regNo,s.phone,s.email,s.sex]),[40,165,265,350,515]);
    const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download='eikon-student-details.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  const tad=document.getElementById('tad');
  if(tad){ const go3=()=>nav(`#/admin/timetables?dept=${enc(tad.value)}&level=${enc(document.getElementById('tal').value)}&sem=${enc(document.getElementById('tas').value)}`); ['tad','tal','tas'].forEach(i=>{document.getElementById(i).onchange=go3;}); }

  /* vault upload (lecturer) */
  form('vaultForm',async(f)=>{
    const file=f.get('file'); let fileName='', fileData='';
    if(file&&file.size){
      if(file.size>500*1024) throw new Error('That file is over 500 KB. Upload a smaller one, or paste a link instead.');
      fileName=file.name; fileData=(await readAsDataURL(file)).split(',')[1]||'';
    }
    await rpc('addResource',{category:f.get('category'),title:f.get('title'),description:f.get('description'),link:(f.get('link')||'').trim(),fileName,fileData});
    ok('Added to the resource vault.','#/vault?open='+enc(f.get('category')));
  });

  /* timetable (HOD) */
  if(path==='/admin/timetable'){
    const p=hashParams(), level=p.get('level')||LEVELS[0], sem=p.get('sem')||'1', dept=session.department;
    const go2=(l,s,o)=>nav(`#/admin/timetable?level=${enc(l)}&sem=${s}${o?'&open='+enc(o):''}`);
    document.getElementById('ttLevel').onchange=e=>go2(e.target.value,sem,'');
    document.getElementById('ttSem').onchange=e=>go2(level,e.target.value,'');
    document.querySelectorAll('.ttAdd').forEach(fm=>fm.onsubmit=e=>{
      e.preventDefault();
      const f=new FormData(fm), day=fm.dataset.day, course=f.get('course');
      act(async()=>{
        if(!course) throw new Error('Ask the academy coordinator to add courses for your department first.');
        await rpc('ttAdd',{level,sem,day,course,start:Number(f.get('start')),end:Number(f.get('end')),venue:(f.get('venue')||'').trim()});
        ok(`${course} added to ${day}.`,`#/admin/timetable?level=${enc(level)}&sem=${sem}&open=${enc(day)}`);
      });
    });
    document.querySelectorAll('.ttDel').forEach(b=>b.onclick=()=>act(async()=>{
      const tt=cache.academics.timetables.find(t=>t.department===dept&&t.level===level&&t.semester===sem&&Array.isArray(t.entries));
      const en=tt&&tt.entries.find(x=>x.id===b.dataset.id);
      await rpc('ttRemove',{level,sem,id:b.dataset.id});
      ok('Class removed.',`#/admin/timetable?level=${enc(level)}&sem=${sem}&open=${enc(en?en.day:'')}`);
    }));
  }
}

function attachHandlers(path){
  attachAdmin(path);
  attachReset();
  const form=(id,fn)=>{const f=document.getElementById(id); if(f) f.onsubmit=async e=>{e.preventDefault(); const btn=f.querySelector('button[type=submit]'); if(btn) btn.disabled=true; try{await fn(new FormData(f),f);}catch(err){showError(err.message||'Something went wrong. Please try again.',f);}};};
  const act=async(fn)=>{ try{await fn();}catch(err){showError(err.message||'Something went wrong. Please try again.');} };

  const lo=document.getElementById('logoutBtn');
  if(lo) lo.onclick=async()=>{ const wasStaff=isStaff(); try{await rpc('logout');}catch(e){} session=null; nav(wasStaff?'#/admin':'#/'); };
  const bb=document.getElementById('backBtn');
  if(bb) bb.onclick=()=>{ const t=bb.dataset.back; if(t) go(t); else if(history.length>1) history.back(); else go(session?(isStaff()?'#/admin/dashboard':'#/dashboard'):'#/'); };

  form('loginForm',async f=>{
    const r=await rpc('login',{id:f.get('id').trim(),password:f.get('password')});
    flash={type:'ok',text:r.mustChange?'Welcome. Please choose your own password.':`Welcome back, ${r.name}.`}; nav(r.mustChange?'#/profile/password':'#/dashboard');
  });
  form('newsForm',async f=>{
    const email=f.get('email').trim().toLowerCase(), err=checkEmail(email); if(err) throw new Error(err);
    await rpc('subscribe',{email});
    flash={type:'ok',text:'Subscribed. You will get academy news at '+email+'.'}; nav('#/');
  });
  form('profileForm',async f=>{
    const ph=checkPhone(f.get('phone')); if(ph) throw new Error(ph);
    const file=f.get('photo'); let photo=null;
    if(file&&file.size){
      if(!file.type.startsWith('image/')) throw new Error('Choose an image file for your picture.');
      try{ photo=await resizePhoto(file); }catch(e){ throw new Error('That picture could not be read. Try another image.'); }
    }
    await rpc('updateProfile',{phone:f.get('phone').trim(),photo});
    flash={type:'ok',text:'Profile saved.'}; nav('#/profile');
  });
  form('passwordForm',async f=>{
    if(f.get('password').length<8) throw new Error('Password must be at least 8 characters.');
    if(f.get('password')!==f.get('confirm')) throw new Error('The two passwords do not match.');
    await rpc('changePassword',{current:f.get('current'),password:f.get('password')});
    flash={type:'ok',text:'Password saved.'}; nav('#/dashboard');
  });
  form('resultsForm',async f=>{ nav(`#/results?s=${enc(f.get('s'))}&l=${enc(f.get('l'))}&m=${enc(f.get('m'))}`); });
  document.querySelectorAll('.regBtn').forEach(b=>b.onclick=()=>act(async()=>{ await rpc('registerCourse',{code:b.dataset.code}); flash={type:'ok',text:`Registered for ${b.dataset.code}.`}; render(); }));
  document.querySelectorAll('.dropBtn').forEach(b=>b.onclick=()=>act(async()=>{ await rpc('dropCourse',{code:b.dataset.code}); flash={type:'ok',text:`Dropped ${b.dataset.code}.`}; render(); }));
  form('remForm',async f=>{
    const list=(session.reminders||[]).concat([{id:uid(),code:f.get('code'),day:f.get('day'),time:f.get('time'),venue:f.get('venue').trim()}]);
    await rpc('setReminders',{reminders:list});
    flash={type:'ok',text:'Class added. Now tap Add to phone.'}; nav('#/reminders');
  });
  document.querySelectorAll('.delRem').forEach(b=>b.onclick=()=>act(async()=>{ await rpc('setReminders',{reminders:(session.reminders||[]).filter(r=>r.id!==b.dataset.id)}); render(); }));
  const tr=document.getElementById('ttRem');
  if(tr) tr.onclick=()=>act(async()=>{
    const t=myTimetable(); if(!t) return;
    const mine=new Set(cache.academics.registrations[session.id]||[]);
    const list=(session.reminders||[]).slice(); let n=0;
    t.entries.forEach(e=>{ if(!mine.has(e.course)) return; const time=String(e.start).padStart(2,'0')+':00'; if(!list.some(r=>r.code===e.course&&r.day===e.day&&r.time===time)){list.push({id:uid(),code:e.course,day:e.day,time,venue:e.venue||''});n++;} });
    if(!n){ throw new Error('No reminders added. Register for the courses first, or they are already added.'); }
    await rpc('setReminders',{reminders:list});
    flash={type:'ok',text:`${n} class reminder${n===1?'':'s'} added. Now tap Add all to phone calendar.`}; nav('#/reminders');
  });
  form('postForm',async f=>{
    await rpc('post',{type:f.get('type'),title:f.get('title'),body:f.get('body')});
    flash={type:'ok',text:'Post published to the community board.'}; nav('#/community');
  });
  form('issueForm',async f=>{
    await rpc('raiseIssue',{subject:f.get('subject'),message:f.get('message')});
    flash={type:'ok',text:'Issue sent. The academy coordinator will reply.'}; nav('#/dashboard');
  });
  const dr=document.getElementById('delResource'); if(dr) dr.onclick=()=>act(async()=>{ if(!confirm('Remove this from the vault?')) return; await rpc('deleteResource',{id:dr.dataset.id}); flash={type:'ok',text:'Removed from the vault.'}; nav('#/vault'); });
  document.querySelectorAll('.acc-head').forEach(h=>h.onclick=()=>{
    const body=document.getElementById(h.getAttribute('aria-controls')); const open=h.getAttribute('aria-expanded')==='true';
    h.setAttribute('aria-expanded',String(!open)); body.hidden=open;
  });
}

render();
