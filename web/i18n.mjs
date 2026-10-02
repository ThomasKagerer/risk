import serverMessages from './server-messages.mjs';
// Source phrases identify messages. Only UI text is translated; interpolated
// values are substituted afterwards, so names, room codes and markup stay intact.
export const languages = Object.freeze([
  {code:'en',name:'English',locale:'en-GB'},
  {code:'de',name:'Deutsch',locale:'de-DE'},
  {code:'fr',name:'Français',locale:'fr-FR'},
  {code:'it',name:'Italiano',locale:'it-IT'},
  {code:'es',name:'Español',locale:'es-ES'},
  {code:'zh',name:'简体中文',locale:'zh-CN'},
  {code:'ja',name:'日本語',locale:'ja-JP'},
]);
export const languageStorageKey='weltspiel-language';
export function validLanguage(code){return languages.some(l=>l.code===code)?code:'en';}
export function readLanguage(storage){try{return validLanguage(storage?.getItem(languageStorageKey));}catch{return 'en';}}
let storage;if(globalThis.window)try{storage=globalThis.localStorage;}catch{}
let language=readLanguage(storage),catalog={},english={};
const load=async code=>(await import(`./locales/${code}.mjs`)).default;
english=await load('en');catalog=language==='en'?english:await load(language);
let phraseIndex=indexPhrases(catalog),englishIndex=indexPhrases(english);
export const currentLanguage=()=>language;
export const currentLocale=()=>languages.find(l=>l.code===language).locale;
export async function setLanguage(code,{persist=true}={}){
  const next=validLanguage(code),nextCatalog=next==='en'?english:await load(next);
  language=next;catalog=nextCatalog;phraseIndex=indexPhrases(catalog);
  if(persist)try{storage?.setItem(languageStorageKey,next);}catch{}
  if(globalThis.document)document.documentElement.lang=next==='zh'?'zh-Hans':next;
  return next;
}
// A text node's interpolation numbers may shift when surrounding markup changes.
// Match its own message shape, then map translated values back to the actual tag.
function messageShape(source){
  const indices=[];
  const key=source.replace(/\{(\d+)\}/g,(_,index)=>{
    if(!indices.includes(index))indices.push(index);
    return `{${indices.indexOf(index)}}`;
  });
  return {key,indices};
}
function indexPhrases(messages){
  const index=new Map();
  for(const [source,value] of Object.entries(messages)){
    const shape=messageShape(source);
    if(!shape.indices.length)continue;
    index.set(shape.key,value.replace(/\{(\d+)\}/g,(_,n)=>`{${shape.indices.indexOf(n)}}`));
  }
  return index;
}
function shapedPhrase(source){
  const {key,indices}=messageShape(source),value=phraseIndex.get(key)??englishIndex.get(key);
  return value?.replace(/\{(\d+)\}/g,(_,n)=>`{${indices[n]}}`);
}
function phrase(source){
  const trimmed=source.trim();
  if(!trimmed)return source;
  const encoded=trimmed.replaceAll('&','&amp;');
  const translated=catalog[trimmed]??english[trimmed]??shapedPhrase(trimmed)??(catalog[encoded]??english[encoded])?.replaceAll('&amp;','&')??trimmed;
  return source.slice(0,source.length-source.trimStart().length)+translated+source.slice(source.trimEnd().length);
}
const markupUnits=/(?:^|>)([^<]+)(?=<|$)|\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g;
function translateTemplate(source){
  if(!source.includes('<'))return phrase(source);
  return source.replace(markupUnits,(match,text,attribute)=>{
    const original=text??attribute;
    return match.replace(original,phrase(original));
  });
}
export function localize(source,...values){
  if(source==null)return '';
  if(typeof source==='number')return String(source);
  if(typeof source==='string')return translateTemplate(source);
  const message=source.map((part,i)=>part+(i<values.length?`{${i}}`:'' )).join('');
  return translateTemplate(message).replace(/\{(\d+)\}/g,(token,i)=>i<values.length?String(values[i]):token);
}
export const formatNumber=(n,options={})=>new Intl.NumberFormat(currentLocale(),options).format(n);

const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let serverPatterns;
// Server strings and old saved logs use the original German text. Matching
// complete messages keeps the save format and different clients independent.
export function serverText(text,protectedNames=[]){
  if(typeof text!=='string')return text;
  if(protectedNames.includes(text))return text;
  if(Object.hasOwn(catalog,text)||Object.hasOwn(english,text))return phrase(text);
  const separator=text.indexOf(' · ');
  if(separator>=0&&protectedNames.includes(text.slice(0,separator)))return text.slice(0,separator+3)+serverText(text.slice(separator+3),protectedNames);
  // Mission descriptions are assembled from these independent server fields.
  const mission=/^Besetze (\d+) Länder deiner Wahl(?: mit jeweils mindestens (\d+) Einheiten)?\.$/.exec(text);
  if(mission){
    return mission[2]?localize`Besetze ${mission[1]} Länder deiner Wahl mit jeweils mindestens ${mission[2]} Einheiten.`:localize`Besetze ${mission[1]} Länder deiner Wahl.`;
  }
  const regions=/^Besetze vollständig: (.*?)( sowie eine weitere Region deiner Wahl)?\.$/.exec(text);
  if(regions){
    const names=regions[1].split(', ').map(phrase).join(['zh','ja'].includes(language)?'、':', ');
    return regions[2]?localize`Besetze vollständig: ${names} sowie eine weitere Region deiner Wahl.`:localize`Besetze vollständig: ${names}.`;
  }
  serverPatterns??=[...serverMessages].sort((a,b)=>b.length-a.length).map(source=>{
    const indices=[...source.matchAll(/\{(\d+)\}/g)].map(m=>Number(m[1]));
    const pattern=source.split(/\{\d+\}/).map(escapeRegExp).join('([\\s\\S]+?)');
    return {source,indices,regex:new RegExp('^'+pattern+'$')};
  });
  for(const p of serverPatterns){
    const match=p.regex.exec(text);if(!match)continue;
    const values={};p.indices.forEach((n,i)=>values[n]=protectedNames.includes(match[i+1])?match[i+1]:serverText(match[i+1],protectedNames));
    return phrase(p.source).replace(/\{(\d+)\}/g,(token,n)=>values[n]??token);
  }
  return text;
}
export function localizeBoard(source){
  return {...source,sourceName:source.name,name:localize(source.name),description:localize(source.description||''),
    countries:source.countries.map(c=>{
      const name=localize(c.name);
      // German abbreviations and split labels are layout hints, not identifiers.
      const labelLines=language==='de'?c.labelLines:name.length>18&&name.includes(' ')?name.split(' '):[name];
      return {...c,sourceName:c.name,name,label:language==='de'?c.label:name,labelLines,
        aliases:c.aliases?.map(localize),polity:c.polity?localize(c.polity):c.polity};
    }),
    continents:source.continents.map(c=>({...c,sourceName:c.name,name:localize(c.name)}))};
}
export function initializeLanguageUI(){
  const root=document.documentElement;root.lang=language==='zh'?'zh-Hans':language;
  document.title=phrase(document.title);
  const description=document.querySelector('meta[name=description]');
  if(description)description.content=phrase(description.content);
  const directions={en:['N','S','W','E'],de:['N','S','W','O'],fr:['N','S','O','E'],it:['N','S','O','E'],es:['N','S','O','E'],zh:['北','南','西','东'],ja:['北','南','西','東']};
  document.querySelectorAll('.compass text').forEach((node,index)=>{node.textContent=directions[language][index];});
  // Only the original static document is walked, never user-generated content.
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let node;node=walker.nextNode();){
    if(node.parentElement?.closest('script,style,.language-picker'))continue;
    node.nodeValue=phrase(node.nodeValue);
  }
  for(const element of document.querySelectorAll('[aria-label],[title],[placeholder]'))for(const attribute of ['aria-label','title','placeholder']){
    if(element.hasAttribute(attribute))element.setAttribute(attribute,phrase(element.getAttribute(attribute)));
  }
  const select=document.querySelector('#language-select');
  if(select){
    select.innerHTML=languages.map(l=>`<option value="${l.code}" lang="${l.code}">${l.name}</option>`).join('');select.value=language;
    select.setAttribute('aria-label',localize('Language'));
    select.onchange=async()=>{select.disabled=true;await setLanguage(select.value);location.reload();};
  }
}
