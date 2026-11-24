// Cherry can keep its async renderer installed without downloading Mermaid on
// plain documents. Keep this adapter synchronous for initialize(), async for render().
export function createLazyMermaid({load=()=>import('mermaid'),beforeRender=()=>{}}={}) {
  let pending=null,engine=null,options={},revision=0,applied=-1;
  function configure(){if(engine&&applied!==revision){engine.initialize(options);applied=revision;}}
  function preload(){
    if(!pending)pending=Promise.resolve().then(load).then(module=>{engine=module.default||module;configure();return engine;}).catch(error=>{pending=null;engine=null;applied=-1;throw error;});
    return pending;
  }
  return {
    initialize(value){options=value;revision++;configure();},
    preload,
    async render(...args){
      const [api]=await Promise.all([preload(),beforeRender(args[1])]);configure();
      const renderedRevision=revision,result=await api.render(...args);
      if(renderedRevision!==revision)throw new Error('图表配置已变化，已忽略旧的渲染结果');
      return result;
    },
  };
}
