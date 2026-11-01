export const COLORS=['#c72d67','#598c72','#c59050','#768bc3','#bd7c90','#879d55','#5d9da4','#a38bc5','#c77758'];
export const ICONS=['leaf','book','drop','run','sun','moon','heart','dumbbell','coffee','pencil','spark','phone'];
export const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const parseDate=s=>new Date(s+'T12:00:00');
export function addDays(s,n){const d=parseDate(s);d.setDate(d.getDate()+n);return dateKey(d)}
export function freshState(){return {version:1,habits:[],categories:['Pessoal','Saúde','Aprendizado'],settings:{theme:'system',view:'classic',weekStart:1,reminders:false},notifications:{}}}
export function scheduled(h,date){return (h.days||[0,1,2,3,4,5,6]).includes(parseDate(date).getDay())&&date>=(h.startDate||h.createdAt.slice(0,10))}
export function value(h,date){return h.entries[date]?.value||0}
export function done(h,date){return value(h,date)>=h.goal}
export function stats(h,today=dateKey()){
 let total=0,eligible=0,best=0,streak=0,current=0,sum=0;
 const start=h.startDate||h.createdAt.slice(0,10);
 for(let d=start;d<=today;d=addDays(d,1)){
  sum+=value(h,d);
  if(!scheduled(h,d))continue;
  const yes=done(h,d);eligible++;if(yes)total++;
  if(yes){streak++;best=Math.max(best,streak)}else if(d!==today){streak=0}
 }
 current=streak;
 return {total,eligible,best,current,rate:eligible?Math.round(total/eligible*100):0,sum};
}
export function yearDates(end=dateKey()){
 const first=addDays(end,-364);const start=addDays(first,-((parseDate(first).getDay()+6)%7));
 return Array.from({length:Math.ceil((Math.round((parseDate(end)-parseDate(start))/86400000)+1)/7)*7},(_,i)=>addDays(start,i));
}
export function periodData(habits,period='week',end=dateKey()){
 const count=period==='week'?7:30;
 return Array.from({length:count},(_,i)=>{const date=addDays(end,i-count+1);const eligible=habits.filter(h=>scheduled(h,date));return {date,total:eligible.length,done:eligible.filter(h=>done(h,date)).length}});
}
export function validateBackup(data){
 if(!data||data.version!==1||!Array.isArray(data.habits)||!Array.isArray(data.categories)||data.habits.length>1000)throw Error('Formato de backup inválido.');
 const ids=new Set();
 for(const h of data.habits){
  if(!h||typeof h.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(h.id)||ids.has(h.id)||typeof h.name!=='string'||!h.name.trim()||h.name.length>80||!['boolean','count','measure'].includes(h.type)||!Number.isFinite(h.goal)||h.goal<=0||!/^#[0-9a-f]{6}$/i.test(h.color)||!Array.isArray(h.days)||!h.days.length||h.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!h.entries||typeof h.entries!=='object'||Array.isArray(h.entries)||!validDate(h.startDate)||!validDate(h.createdAt?.slice(0,10)))throw Error('Hábitos inválidos no backup.');
  if(h.reminder&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.reminder))throw Error('Lembrete inválido.');
  if(typeof h.unit!=='string'||typeof h.icon!=='string'||(h.emoji&&typeof h.emoji!=='string')||(h.category&&typeof h.category!=='string'))throw Error('Campos inválidos no backup.');
  for(const [d,e] of Object.entries(h.entries)){if(!validDate(d)||!e||!Number.isFinite(e.value)||e.value<0||typeof(e.note||'')!=='string')throw Error('Registros inválidos no backup.');}
  ids.add(h.id);
 }
 if(data.categories.some(c=>typeof c!=='string'||c.length>40))throw Error('Categorias inválidas.');
 const settings=data.settings||{};
 return {...freshState(),...data,notifications:{},settings:{theme:['light','dark','system'].includes(settings.theme)?settings.theme:'system',view:['classic','compact','split'].includes(settings.view)?settings.view:'classic',weekStart:1,reminders:Boolean(settings.reminders)}};
}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dateKey(parseDate(s))===s}
