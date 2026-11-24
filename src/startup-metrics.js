// In-memory startup marks only; Rust writes them only when a local trace path is set.
const stages=[];
let captured=false;
export function markStartup(stage){if(!captured&&stages.length<40)stages.push({stage,elapsedMs:Math.round(performance.now()*10)/10});}
export function startupTimings(){
  captured=true;
  return {timeOrigin:performance.timeOrigin,stages:[...stages],scripts:performance.getEntriesByType('resource').filter(entry=>/\.js(?:$|\?)/.test(entry.name)).map(entry=>({name:entry.name.split('/').pop(),startMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration),bytes:entry.decodedBodySize}))};
}
