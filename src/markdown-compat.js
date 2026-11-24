import { fragmentNames } from './page-navigation.js';
const escapeHtml=value=>String(value).replace(/[&<>"'~]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','~':'&#126;'})[char]);
const noteExtension=/\.(?:md|markdown|mdown|mkd|txt)$/i;
const htmlTags=/(<\/?[A-Za-z](?:[^>'"]|"[^"]*"|'[^']*')*>)/g;
export function replaceInlineText(source,pattern,replacement){return source.split(htmlTags).map((part,index)=>index%2?part:part.replace(pattern,replacement)).join('');}

export function decodeMarkdownEntities(value){
  if(typeof document!=='undefined'){
    const textarea=document.createElement('textarea');textarea.innerHTML=String(value).replace(/</g,'&lt;');return textarea.value;
  }
  return String(value).replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,(all,name)=>{
    if(name[0]!=='#')return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name.toLowerCase()]||all;
    const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
    return code>0&&code<=0x10ffff?String.fromCodePoint(code):all;
  });
}
export function parseWikiLink(value){
  const [rawTarget,...labels]=String(value).split('|'),target=decodeMarkdownEntities(rawTarget).trim();
  if(!target||/[\r\n<>\u0000]/.test(target)||/^[a-z][\w+.-]*:/i.test(target)||target.startsWith('//')||/~~C\d/.test(target))return null;
  const hash=target.indexOf('#'),path=(hash<0?target:target.slice(0,hash)).trim(),fragment=hash<0?'':target.slice(hash+1).trim();
  const filename=path?(noteExtension.test(path)?path:path+'.md'):'';
  const href=(filename.split(/[\\/]/).map(encodeURIComponent).join('/')+(fragment?'#'+encodeURIComponent(fragment):'')).replace(/~/g,'%7E');
  if(!href)return null;
  return {path:filename,fragment,href,label:decodeMarkdownEntities(labels.length?labels.join('|'):target).trim()||target};
}
function normalizePath(value){
  const path=String(value||'').replace(/\\/g,'/').replace(/^\/\/\?\//,'');const parts=[];
  for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}
  return parts.join('/').toLowerCase();
}
export function resolveWikiDocument(documents,current,path){
  if(!path)return {document:current};
  for(const field of ['path','folderKey'])if(current?.[field]){
    const expected=normalizePath(current[field].replace(/[/\\][^/\\]*$/,'/')+path);
    const exact=documents.filter(document=>document[field]&&normalizePath(document[field])===expected);
    if(exact.length===1)return {document:exact[0]};
    if(exact.length>1)return {ambiguous:true};
  }
  if(current?.path||current?.folderKey)return {};
  const candidates=documents.filter(document=>normalizePath(document.name)===normalizePath(path));
  return candidates.length===1?{document:candidates[0]}:candidates.length>1?{ambiguous:true}:{};
}
// Preserve Cherry's multiline definitions, adding a boundary at the next label.
// Unlike inserting blank lines, this keeps source/preview line numbers intact.
export const footnoteDefinitionPattern=()=>/(^|\n)[ \t]*\[\^([^\]\n]+)\]:[ \t]*([\s\S]+?)(?=\s*$|\n[ \t]*\[\^[^\]\n]+\]:|\n\n)/g;

const definitionPattern=/(^|\n)([^\n]+)\n((?::[ \t]+[^\n]*(?:\n[ \t]+[^\n]+)*)(?:\n:[ \t]+[^\n]*(?:\n[ \t]+[^\n]+)*)*)(?=\n|$)/g;
const versePattern=/^[ \t]{0,3}\|[^\n]*(?:\n[ \t]{0,3}\|[^\n]*)*/gm;
const tableDelimiter=/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
export function definitionParts(term,body){
  if(/^\s*(?:[#>|]|[-+*]\s|\d+[.)]\s|~~C\d)/.test(term))return null;
  const definitions=[];
  for(const line of body.split('\n')){
    if(/^:[ \t]+/.test(line))definitions.push(line.replace(/^:[ \t]+/,''));
    else if(definitions.length)definitions[definitions.length-1]+=' '+line.trim();
  }
  return definitions.length?{term:term.trim(),definitions}:null;
}
export function verseLines(source){
  const lines=source.split('\n');if(lines.some(line=>tableDelimiter.test(line)))return null;
  return lines.map(line=>line.replace(/^[ \t]{0,3}\| ?/,''));
}

function keepDetailsTogether(html){
  if(!/<details[\s>]/i.test(html))return html;
  const tags=/<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)(?=\s|\/?>)(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  let depth=0;
  return html.replace(tags,(tag,name)=>{
    if(name?.toLowerCase()==='details')depth=tag.startsWith('</')?Math.max(0,depth-1):depth+1;
    // Cherry 0.11 splits sanitizer batches at the literal '<p data-sign='.
    // Extra whitespace keeps those splits outside details without changing the HTML or sanitizer.
    return depth&&tag.startsWith('<p data-sign=')?'<p '+tag.slice(2):tag;
  });
}

export function createMarkdownCompatibility(Cherry){
  const paragraph=Cherry.constants.HOOKS_TYPE_LIST.PAR,sentence=Cherry.constants.HOOKS_TYPE_LIST.SEN;
  const InlineCache=Cherry.createSyntaxHook('compatibleInlineCache',paragraph,{needCache:true});
  const DetailsCompatibility=Cherry.createSyntaxHook('compatibleDetails',paragraph,{afterMakeHtml:keepDetailsTogether});
  const FootnoteCompatibility=Cherry.createSyntaxHook('compatibleFootnotes',paragraph,{
    beforeMakeHtml(source){const hook=this.$engine.hooks.paragraph.find(hook=>hook.getName()==='footnote');if(hook)hook.RULE.reg=footnoteDefinitionPattern();return source;},
    makeHtml:source=>source,afterMakeHtml:source=>source,
  });
  const DefinitionList=Cherry.createSyntaxHook('definitionList',paragraph,{
    needCache:true,
    beforeMakeHtml(source,inline){
      return source.replace(definitionPattern,(whole,leading,term,body)=>{
        const parts=definitionParts(term,body);if(!parts)return whole;
        const count=this.getLineCount(term+'\n'+body,whole),sign=this.$engine.hash(whole);
        const html=`<dl class="md-definition-list" data-type="definition-list" data-sign="${sign}" data-lines="${count}"><dt>${inline(parts.term).html}</dt>${parts.definitions.map(value=>`<dd>${inline(value).html}</dd>`).join('')}</dl>`;
        return leading+this.pushCache(html,sign,count);
      });
    },
  });
  const Verse=Cherry.createSyntaxHook('verse',paragraph,{
    needCache:true,
    beforeMakeHtml(source,inline){
      return source.replace(versePattern,whole=>{
        const lines=verseLines(whole);if(!lines)return whole;
        const sign=this.$engine.hash(whole),html=`<div class="md-verse" data-type="verse" data-sign="${sign}" data-lines="${lines.length}">${lines.map(line=>inline(line).html).join('<br>')}</div>`;
        return this.pushCache(html,sign,lines.length);
      });
    },
  });
  const WikiLinks=Cherry.createSyntaxHook('wikiLink',sentence,{
    makeHtml(source){return replaceInlineText(source,/(?<![\\!])\[\[([^\]\n]+)\]\]/g,(whole,value)=>{
      const link=parseWikiLink(this.$engine.$decodeReservedKeywords(value));if(!link)return whole;
      const html=`<a class="md-wikilink" data-wikilink="${escapeHtml(link.path)}" data-wiki-fragment="${escapeHtml(link.fragment)}" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;
      const cache=this.$engine.hooks.paragraph.find(hook=>hook.getName()==='compatibleInlineCache');
      return cache.pushCache(html,'!'+this.$engine.hash(whole),0);
    });},
  });
  const Subscript=Cherry.createSyntaxHook('compatibleSubscript',sentence,{
    makeHtml(source){return replaceInlineText(source,/(?<!\\)(?<!~T)~T(?!~T)([^~\s]+?)~T(?!~T)/g,'<sub>$1</sub>');},
  });
  const Highlight=Cherry.createSyntaxHook('compatibleHighlight',sentence,{
    makeHtml(source){return replaceInlineText(source,/(?<![\\=])==(?!=)(\S(?:[^\n]*?\S)?)==(?!=)/g,'<mark>$1</mark>');},
  });
  return {
    compatibleInlineCache:{syntaxClass:InlineCache,before:'codeBlock'},
    // Cherry runs afterMakeHtml hooks in reverse order.
    compatibleDetails:{syntaxClass:DetailsCompatibility,after:'htmlBlock'},
    compatibleFootnotes:{syntaxClass:FootnoteCompatibility,before:'footnote'},
    definitionList:{syntaxClass:DefinitionList,before:'list'},
    verse:{syntaxClass:Verse,before:'list'},
    wikiLink:{syntaxClass:WikiLinks,before:'link'},
    compatibleSubscript:{syntaxClass:Subscript,before:'sub'},
    compatibleHighlight:{syntaxClass:Highlight,before:'highLight'},
  };
}

// Cherry's soft line breaks can add empty rows inside raw HTML image paragraphs.
// Remove only padding around one direct image; retain source-line metadata.
export function cleanHtmlImageSpacing(root){
  for(const paragraph of root.querySelectorAll('p[align]')){
    if(paragraph.closest('svg,figure[data-type="mermaid"]'))continue;
    const images=[...paragraph.children].filter(node=>node.tagName==='IMG');if(images.length!==1)continue;
    const allowed=node=>node===images[0]||node.nodeType===3&&!node.textContent.trim()||node.nodeType===1&&node.tagName==='BR';
    if([...paragraph.childNodes].every(allowed))for(const node of [...paragraph.childNodes])if(node!==images[0])node.remove();
  }
}

// Exported HTML has no workspace router. Point same-note Wiki links at the
// actual generated ID, including headings whose slug differs from their title.
export function normalizeWikiFragments(root){
  const links=[...root.querySelectorAll('a[data-wikilink=""][data-wiki-fragment]')];if(!links.length)return;
  const targets=new Map();
  for(const node of root.querySelectorAll('[id],a[name]'))for(const value of [node.id,node.getAttribute('name')].filter(Boolean))for(const name of fragmentNames('#'+value))if(!targets.has(name))targets.set(name,node);
  for(const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6'))if(!targets.has(heading.textContent.trim()))targets.set(heading.textContent.trim(),heading);
  for(const link of links){
    const target=fragmentNames('#'+link.getAttribute('data-wiki-fragment')).map(name=>targets.get(name)).find(Boolean);
    if(target?.id)link.setAttribute('href','#'+encodeURIComponent(target.id));
  }
}

function flattenTabGroup(tabs,labels,panels){
  const section=tabs.ownerDocument.createElement('section');section.className='md-export-tabs';
  panels.forEach((panel,index)=>{
    const title=tabs.ownerDocument.createElement('div');title.className='md-export-tab-title';title.textContent=labels[index]?.textContent||`标签 ${index+1}`;
    panel.className='md-export-tab-content';section.append(title,panel);
  });
  if(panels.length)tabs.replaceWith(section);
}

function prepareInteractiveTabs(root,tabsGroups){
  if(!tabsGroups.length)return;
  const used=new Set([...root.querySelectorAll('[id],input[name]')].flatMap(node=>[node.id,node.getAttribute('name')]));
  let number=0;
  for(const tabs of tabsGroups){
    const radios=[...tabs.querySelectorAll(':scope > input.cherry-tabs--radio[type="radio"]')];
    const labels=[...tabs.querySelectorAll(':scope > .cherry-tabs--labels > label')];
    const panels=[...tabs.querySelectorAll(':scope > .cherry-tabs--panels > .cherry-tabs--panel')];
    // Cherry's tab styles support ten panels. Keep all content readable if a group exceeds that range.
    if(!radios.length||radios.length!==labels.length||radios.length!==panels.length||radios.length>10){
      flattenTabGroup(tabs,labels,panels);
      continue;
    }
    const selected=radios.find(radio=>radio.checked)??radios.find(radio=>radio.defaultChecked)??radios[0];
    let group,ids;
    do{
      group=`md-export-tab-${++number}`;
      ids=radios.map((_,index)=>`${group}-${index}`);
    }while(used.has(group)||ids.some(id=>used.has(id)));
    used.add(group);
    radios.forEach((radio,index)=>{
      radio.name=group;
      radio.id=ids[index];
      labels[index].htmlFor=radio.id;
      panels[index].setAttribute('data-mt-tab-radio',radio.id);
      radio.defaultChecked=radio===selected;
      radio.checked=radio===selected;
      used.add(radio.id);
    });
  }
}

function prepareTaskList(root) {
  for (const item of root.querySelectorAll('li.check-list-item')) {
    const marker = item.querySelector(':scope > p > span.ch-icon:is(.ch-icon-check,.ch-icon-square)');
    if (!marker) continue;
    const checkbox = root.ownerDocument.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'md-export-task-checkbox';
    checkbox.disabled = true;
    checkbox.defaultChecked = marker.classList.contains('ch-icon-check');
    const label = marker.parentElement.textContent.trim();
    if (label) checkbox.setAttribute('aria-label', label);
    marker.replaceWith(checkbox);
    item.classList.add('md-export-task-item');
  }
}

// HTML keeps native radio controls. PDF needs every panel laid out for printing.
export function prepareReadOnlyMarkdown(root,{pdf=false}={}){
  root.querySelectorAll('[data-type="frontMatter"]').forEach(node=>node.remove());
  // The export UI provides its own configurable TOC; do not duplicate [TOC].
  for(const toc of root.querySelectorAll('.cherry-toc,div.toc,[data-type="toc"]'))if(!toc.closest('svg,figure[data-type="mermaid"]'))toc.remove();
  prepareTaskList(root);
  const tabsGroups=root.querySelectorAll('.cherry-tabs');
  if(!pdf){prepareInteractiveTabs(root,tabsGroups);return;}
  for(const tabs of tabsGroups){
    const labels=[...tabs.querySelectorAll(':scope > .cherry-tabs--labels > label')];
    const panels=[...tabs.querySelectorAll(':scope > .cherry-tabs--panels > .cherry-tabs--panel')];
    flattenTabGroup(tabs,labels,panels);
  }
  for(const details of root.querySelectorAll('details'))details.open=true;
}

export const markdownCompatibilityStyles=`
.cherry-markdown a:not([href]){color:inherit;text-decoration:none}
.cherry-markdown li.md-export-task-item{list-style-type:none}
.cherry-markdown .md-export-task-checkbox{width:.95em;height:.95em;margin:0;margin-inline:-1.4em .45em;vertical-align:-.08em;font-size:inherit}
.cherry-markdown .md-definition-list{margin:14px 0}.cherry-markdown .md-definition-list dt{font-weight:600;margin:10px 0 4px}.cherry-markdown .md-definition-list dd{margin:0 0 10px 1.5em}
.cherry-markdown .md-verse{white-space:break-spaces;font-family:"Cascadia Code",Consolas,monospace;margin:12px 0;line-height:1.7}
.cherry-markdown mark{background:#fff0ac;color:#242424;padding:0 .12em;border-radius:2px}
.cherry-markdown .footnote{border-top:1px solid #d7dfe5;margin-top:24px;padding-top:12px;font-size:.9em}.cherry-markdown a.footnote{border:0;margin:0;padding:0}.cherry-markdown .one-footnote{margin:6px 0}
.cherry-markdown [align=center]{text-align:center}.cherry-markdown [align=right]{text-align:right}.cherry-markdown [align=left]{text-align:left}
.cherry-markdown kbd{border:1px solid #d1d9df;border-radius:3px;padding:1px 5px;font:inherit;font-size:.9em}
.cherry-markdown .cherry-panel{margin:16px 0;border:1px solid #d7e2e8;border-left:3px solid #6d9cb6;padding:12px 16px;background:#f4f8fa;color:#25312f}.cherry-markdown .cherry-panel--title{font-weight:600;margin-bottom:8px}.cherry-markdown .cherry-panel--title:empty{display:none}.cherry-markdown .cherry-panel--body p{margin:6px 0}.cherry-markdown .cherry-panel__warning{border-left-color:#d2a13b;background:#fff8e8}.cherry-markdown .cherry-panel__danger{border-left-color:#cc7474;background:#fff1f1}.cherry-markdown .cherry-panel__success{border-left-color:#68a17c;background:#eff8f1}
body:not(.mt-html-export) .cherry-markdown .cherry-panel-cols{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:20px;margin:16px 0}body:not(.mt-html-export) .cherry-markdown .cherry-panel-cols>div{min-width:0}
.cherry-markdown .md-export-tabs{border:1px solid #d6e1e8;margin:16px 0;padding:12px 16px}.cherry-markdown .md-export-tab-title{font-weight:600;margin:12px 0 6px}.cherry-markdown .md-export-tab-content{display:block!important}
body:not(.mt-html-export) .cherry-markdown .cherry-timeline{border-left:2px solid #ccdbe2;margin:18px 8px;padding:0 0 0 20px}body:not(.mt-html-export) .cherry-markdown .cherry-timeline--header{font-weight:600;margin-bottom:12px}body:not(.mt-html-export) .cherry-markdown .cherry-timeline--item{position:relative;margin:0 0 16px}body:not(.mt-html-export) .cherry-markdown .cherry-timeline--node{position:absolute;left:-26px;top:7px;width:10px;height:10px;border-radius:50%;background:#6c99b1;border:2px solid #fff}body:not(.mt-html-export) .cherry-markdown .cherry-timeline--time{font-size:.85em;color:#71828d}body:not(.mt-html-export) .cherry-markdown .cherry-timeline--title{font-weight:600}
`;
