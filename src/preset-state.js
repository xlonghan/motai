// Only disk I/O boundaries need a digest. Keep one small baseline per document,
// rather than duplicating the full Markdown text in the workspace snapshot.
export async function documentDigest(markdown){
  const bytes=new TextEncoder().encode(markdown.replace(/\r\n?/g,'\n'));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export async function presetRefresh(draft,incoming,baseline){
  const [currentHash,incomingHash]=await Promise.all([documentDigest(draft),documentDigest(incoming)]);
  if(currentHash===incomingHash||baseline===incomingHash)return {replace:false,backup:false,diskHash:incomingHash};
  return {replace:true,backup:baseline!==currentHash,diskHash:incomingHash};
}
// Exact hashes identify untouched defaults from versions that did not tag them.
// Similar names or edited text are insufficient to reclassify a personal draft.
const legacyDefaults={
  '开始使用.md':['welcome','e9e9408a3d68436fd5b9eead2660e228930c611e0c7c2c8f645f3a62af9d62f2'],
  'Mermaid 示例集.md':['diagrams','a280c5a7c6aa150a93bc1a0d18c68b624f042df4cde48b31c48ad3bd5c63b6c7'],
  'Mermaid 常用图表示例.md':['common-diagrams','9f7bc7fac2f44c1d900215e3224cf6d4463675eccf656852d06d304a099e468b'],
};
export async function legacyPresetId(document){
  if(document.path||document.folderKey||document.imported||document.builtinId||document.preset)return null;
  if(!Object.hasOwn(legacyDefaults,document.name))return null;
  const preset=legacyDefaults[document.name];
  const source=document.markdown.replace(/\r\n?/g,'\n').replace(/\n+$/,'');
  return await documentDigest(source)===preset[1]?preset[0]:null;
}
