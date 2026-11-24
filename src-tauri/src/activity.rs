//! Local diagnostic events deliberately contain no user-provided text. Do not
//! forward console output: parser errors can include entire Markdown fragments.
use serde::Deserialize;
use std::time::Instant;
use tauri::{App, AppHandle, Manager, WebviewWindow};

pub const LOG_LIMIT:u128=1024*1024;
pub const LOG_BACKUPS:usize=5;
pub fn plugin()->tauri::plugin::TauriPlugin<tauri::Wry>{
    use tauri_plugin_log::{Builder,RotationStrategy,Target,TargetKind,TimezoneStrategy};
    Builder::new().clear_targets()
        .target(Target::new(TargetKind::LogDir{file_name:Some("motai".into())}))
        .max_file_size(LOG_LIMIT).rotation_strategy(RotationStrategy::KeepSome(LOG_BACKUPS))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .level(log::LevelFilter::Trace)
        .filter(|record|record.target().starts_with(env!("CARGO_CRATE_NAME")))
        .build()
}
pub fn apply_level(settings:Option<&serde_json::Value>){
    let level=match settings.and_then(|v|v.get("values")).and_then(|v|v.get("logLevel")).and_then(|v|v.as_str()){
        Some("error")=>log::LevelFilter::Error,Some("warn")=>log::LevelFilter::Warn,
        Some("debug")=>log::LevelFilter::Debug,_=>log::LevelFilter::Info,
    };log::set_max_level(level);
}
pub fn started(app:&mut App)->Result<(),Box<dyn std::error::Error>>{
    let storage=app.state::<crate::portable_runtime::PortableStorage>();
    let settings=crate::portable_runtime::load_settings(&storage).ok().flatten();apply_level(settings.as_ref());
    log::info!("app_start version={} os={} arch={} migrated={}",app.package_info().version,std::env::consts::OS,std::env::consts::ARCH,storage.migrated);
    prune_archives(&storage.paths.logs);
    // The upstream rotator uses second-resolution archive names and can create
    // .log.bak during a burst. Include those in retention instead of leaving
    // collision backups behind indefinitely.
    let directory=storage.paths.logs.clone();
    tauri::async_runtime::spawn(async move{loop{tokio::time::sleep(std::time::Duration::from_secs(30)).await;let directory=directory.clone();let _=tauri::async_runtime::spawn_blocking(move||prune_archives(&directory)).await;}});
    let previous=std::panic::take_hook();
    std::panic::set_hook(Box::new(move|info|{
        // Panic payloads can also contain document content; record location only.
        if let Some(location)=info.location(){log::error!("native_panic source={}:{}",location.file(),location.line());}
        log::logger().flush();previous(info);
    }));Ok(())
}
pub struct Operation {event:&'static str,started:Instant,ok:bool,verbose:bool}
impl Operation {
    pub fn new(event:&'static str,verbose:bool)->Self{Self{event,started:Instant::now(),ok:false,verbose}}
    pub fn finish<T,E>(mut self,result:Result<T,E>)->Result<T,E>{self.ok=result.is_ok();result}
}
impl Drop for Operation {
    fn drop(&mut self){
        let elapsed=self.started.elapsed().as_millis();
        if !self.ok{log::error!("{} outcome=failed elapsed_ms={elapsed}",self.event);}
        else if self.verbose{log::debug!("{} outcome=ok elapsed_ms={elapsed}",self.event);}
        else{log::info!("{} outcome=ok elapsed_ms={elapsed}",self.event);}
    }
}
#[derive(Deserialize,Debug)]
#[serde(rename_all="snake_case")]
pub enum FrontendEvent {ClientError,UnhandledRejection,Render,HtmlPreview,PdfPreview,WorkspaceRestore}
#[derive(Deserialize,Debug)]
#[serde(rename_all="snake_case")]
pub enum Outcome {Ok,Failed}
#[tauri::command]
pub fn app_event(window:WebviewWindow,event:FrontendEvent,outcome:Outcome,elapsed_ms:Option<u64>)->Result<(),String>{
    crate::files::ensure_main(&window)?;
    let elapsed_ms=elapsed_ms.unwrap_or(0).min(86_400_000);
    if matches!(outcome,Outcome::Failed){log::error!("frontend event={event:?} outcome=failed elapsed_ms={elapsed_ms}");}
    else{log::debug!("frontend event={event:?} outcome=ok elapsed_ms={elapsed_ms}");}Ok(())
}
pub fn prune_archives(directory:&std::path::Path){
    let Ok(entries)=std::fs::read_dir(directory)else{return;};
    let mut archives:Vec<_>=entries.filter_map(Result::ok).filter(|entry|{
        let name=entry.file_name();let name=name.to_string_lossy();
        let Some(date)=name.strip_prefix("motai_").and_then(|name|name.strip_suffix(".log.bak").or_else(||name.strip_suffix(".log")))else{return false;};
        date.len()==19&&date.bytes().all(|byte|byte.is_ascii_digit()||matches!(byte,b'-'|b'_'))&&entry.file_type().is_ok_and(|kind|kind.is_file())
    }).collect();
    archives.sort_by_key(|entry|entry.metadata().and_then(|value|value.modified()).ok());
    let remove=archives.len().saturating_sub(LOG_BACKUPS);
    for entry in archives.into_iter().take(remove){let _=std::fs::remove_file(entry.path());}
}
pub fn stopped(app:&AppHandle){log::info!("app_exit");log::logger().flush();if let Some(storage)=app.try_state::<crate::portable_runtime::PortableStorage>(){prune_archives(&storage.paths.logs);}}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn frontend_events_cannot_carry_arbitrary_document_content(){
        assert!(serde_json::from_str::<FrontendEvent>("\"# private document\"").is_err());
        assert!(serde_json::from_str::<FrontendEvent>("\"render\"").is_ok());
        assert!(serde_json::from_str::<Outcome>("\"document body\"").is_err());
    }
}
