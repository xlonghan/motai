import { BoundedCache } from './bounded-cache.js';

let sanitizer;
async function sanitizeSvgs(svgs){
  if(!svgs.length)return [];
  sanitizer ||= import('dompurify').then(module=>module.default);
  // One parse for the bounded set, preserving SVG/HTML label namespaces.
  const fragment=(await sanitizer).sanitize(svgs.join(''),{USE_PROFILES:{html:true,svg:true,svgFilters:true,mathMl:true},ADD_TAGS:['foreignObject'],HTML_INTEGRATION_POINTS:{foreignobject:true},ADD_ATTR:['dominant-baseline'],RETURN_DOM_FRAGMENT:true});
  const nodes=[...fragment.children];
  if(nodes.length!==svgs.length||nodes.some(node=>node.namespaceURI!=='http://www.w3.org/2000/svg'||node.localName!=='svg'))return [];
  return nodes.map(node=>node.outerHTML);
}
const cacheable=svg=>typeof svg==='string'&&/^<svg[\s>]/i.test(svg)&&!/(?:aria-roledescription=["']error["']|class=["'][^"']*error-icon)/i.test(svg);

// Only generated SVGs are persisted, separately from drafts. Raw source keys
// avoid relying on Cherry's short content hash across sessions.
export class DiagramCache extends BoundedCache {
  constructor(signature,maxEntries=24,maxBytes=6*1024*1024){super(maxEntries,maxBytes);this.signature=signature;this.revision=0;this.savedRevision=0;}
  get dirty(){return this.revision!==this.savedRevision;}
  set(key,svg){
    if(typeof key!=='string'||key.length>65536||!cacheable(svg))return this;
    super.set(key,svg);this.revision++;return this;
  }
  delete(key){const removed=super.delete(key);if(removed)this.revision++;return removed;}
  clear(){super.clear();this.revision++;}
  configure(signature){if(this.signature!==signature){this.signature=signature;this.clear();}}
  markSaved(revision){if(this.revision===revision)this.savedRevision=revision;}
  snapshot(){
    const entries=[];let characters=0;
    for(const entry of [...this].reverse()){
      const size=entry[0].length+entry[1].length;
      if(characters+size>1000000)continue;
      entries.unshift(entry);characters+=size;
    }
    return {schema:1,signature:this.signature,entries,revision:this.revision};
  }
  async restore(record,sanitize=sanitizeSvgs){
    if(record?.schema!==1||record.signature!==this.signature||!Array.isArray(record.entries)||record.entries.length>this.maxEntries)return false;
    const revision=this.revision,signature=this.signature,entries=[];
    for(const entry of record.entries){
      if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[0].length>65536||!cacheable(entry[1])||entry[1].length>1000000)continue;
      entries.push(entry);
    }
    const sanitized=await sanitize(entries.map(entry=>entry[1]));
    if(revision!==this.revision||signature!==this.signature)return false;
    if(!Array.isArray(sanitized)||sanitized.length!==entries.length)return false;
    for(let index=0;index<entries.length;index++)this.set(entries[index][0],sanitized[index]);
    this.savedRevision=this.revision;return true;
  }
}
