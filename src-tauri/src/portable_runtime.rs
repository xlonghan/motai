use crate::{files::ensure_main,portable::{PortablePaths,legacy_directories,write_atomic}};
use serde::Serialize;
use serde_json::{Value,json};
use std::{fs,path::Path,sync::Mutex};
use tauri::{AppHandle,Manager,WebviewWindow};

pub struct PortableStorage {pub paths:PortablePaths,pub migrated:bool,write:Mutex<()>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct StorageInfo {root:String,data:String,config:String,drafts:String,cache:String,webview:String,logs:String,documents:String,exports:String,builtin:String,migrated:bool,installed:bool}
impl PortableStorage {
    pub fn info(&self)->StorageInfo {let p=&self.paths;StorageInfo{root:p.root.display().to_string(),data:p.data.display().to_string(),config:p.config.display().to_string(),drafts:p.drafts.display().to_string(),cache:p.cache.display().to_string(),webview:p.webview.display().to_string(),logs:p.logs.display().to_string(),documents:p.documents.display().to_string(),exports:p.exports.display().to_string(),builtin:p.builtin.display().to_string(),migrated:self.migrated,installed:cfg!(all(windows,feature="installed"))}}
}
pub fn configure(context:&mut tauri::Context<tauri::Wry>)->Result<PortableStorage,String> {
    use tauri::utils::config::{AppDirectoriesOverride,AppDirectoryOverrides};
    let paths=PortablePaths::discover()?;let identifier=context.config().identifier.clone();
    let (mut legacy_data,legacy_profiles)=legacy_directories(&identifier);
    // Accept old flat user-provided snapshots without changing their originals.
    legacy_data.insert(0,paths.root.clone());legacy_data.insert(1,paths.data.clone());
    let migrated=paths.prepare(&legacy_data,&legacy_profiles)?;
    crate::presets::seed(&paths)?;
    context.config_mut().app.app_directories_override=Some(AppDirectoriesOverride::Directories(AppDirectoryOverrides{
        config:Some(paths.config.clone()),data:Some(paths.drafts.clone()),local_data:Some(paths.profile.clone()),cache:Some(paths.cache.clone()),log:Some(paths.logs.clone()),
    }));
    for window in &mut context.config_mut().app.windows {window.data_directory=Some(paths.profile.clone());}
    context.config_mut().identifier=paths.instance_identifier(&identifier);
    Ok(PortableStorage{paths,migrated,write:Mutex::new(())})
}
fn read_json(path:&Path)->Result<Option<Value>,String> {
    if !path.exists(){return Ok(None);}
    let bytes=fs::read(path).map_err(|error|format!("无法读取 {}：{error}",path.display()))?;
    serde_json::from_slice(&bytes).map(Some).map_err(|error|format!("配置文件不是有效 JSON：{}（{error}）。请修复或移走该文件后重试。",path.display()))
}
pub fn load_settings(storage:&PortableStorage)->Result<Option<Value>,String> {
    let value=read_json(&storage.paths.settings())?;
    if value.as_ref().is_some_and(|value|value.get("version").and_then(Value::as_u64)!=Some(1)||!value.get("values").is_some_and(Value::is_object)){return Err(format!("配置格式或版本不受支持：{}",storage.paths.settings().display()));}
    Ok(value)
}
pub fn load_preferences(storage:&PortableStorage)->Result<Option<Value>,String> {
    let value=read_json(&storage.paths.preferences())?;
    if value.as_ref().is_some_and(|value|value.get("version").and_then(Value::as_u64)!=Some(1)||!value.get("values").is_some_and(Value::is_object)){return Err(format!("偏好文件格式或版本不受支持：{}",storage.paths.preferences().display()));}
    Ok(value)
}
#[tauri::command]
pub fn startup_theme(app:AppHandle,window:WebviewWindow)->Result<Option<String>,String>{
    if !matches!(window.label(),"main"|"splash"){return Err("此窗口不能读取启动配置".into());}
    let storage=app.state::<PortableStorage>();let settings=load_settings(&storage)?;
    let theme=settings.as_ref().and_then(|v|v.get("values")).and_then(|v|v.get("theme")).and_then(Value::as_str).map(String::from);
    Ok(theme.or_else(||storage.paths.initialized().exists().then(||"dark".into())))
}
#[tauri::command]
pub async fn save_preferences(app:AppHandle,window:WebviewWindow,settings:Value,preferences:Value)->Result<(),String>{
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("preferences_save",true);
    if settings.get("version").and_then(Value::as_u64)!=Some(1)||!settings.get("values").is_some_and(Value::is_object){return Err("设置格式无效".into());}
    let values=preferences.as_object().ok_or("偏好格式无效")?;
    if values.len()>100||values.iter().any(|(key,value)|!key.starts_with("markdown-desk-")||key=="markdown-desk-settings-v1"||!value.is_string()){return Err("偏好字段无效".into());}
    let preferences=json!({"version":1,"values":preferences});
    if serde_json::to_vec(&settings).map_err(|e|e.to_string())?.len()>256*1024||serde_json::to_vec(&preferences).map_err(|e|e.to_string())?.len()>256*1024{return Err("配置文件超过容量限制".into());}
    let result=tauri::async_runtime::spawn_blocking(move||{
        let storage=app.state::<PortableStorage>();let _lock=storage.write.lock().map_err(|error|error.to_string())?;
        save_if_changed(&storage.paths.settings(),&settings)?;save_if_changed(&storage.paths.preferences(),&preferences)?;
        if !storage.paths.initialized().exists(){write_atomic(&storage.paths.initialized(),b"portable-preferences-v1\n")?;}
        crate::activity::apply_level(Some(&settings));
        Ok(())
    }).await.map_err(|error|error.to_string())?;
    operation.finish(result)
}
fn save_if_changed(path:&Path,value:&Value)->Result<(),String>{
    if read_json(path)?.as_ref()==Some(value){return Ok(());}
    write_atomic(path,&serde_json::to_vec_pretty(value).map_err(|error|error.to_string())?)
}
#[tauri::command]
pub fn default_save_path(app:AppHandle,window:WebviewWindow,filename:String,extension:String)->Result<String,String>{
    ensure_main(&window)?;
    if filename.is_empty()||filename.contains(['/', '\\',':']){return Err("无效的文件名".into());}
    let storage=app.state::<PortableStorage>();
    let directory=if extension=="md"{storage.paths.documents.clone()}else{storage.paths.export_directory(&extension)?};
    Ok(directory.join(filename).display().to_string())
}
#[tauri::command]
pub fn open_storage_folder(app:AppHandle,window:WebviewWindow,folder:String)->Result<(),String>{
    ensure_main(&window)?;let storage=app.state::<PortableStorage>();
    let path=match folder.as_str(){"root"=>&storage.paths.root,"data"=>&storage.paths.data,"documents"=>&storage.paths.documents,"exports"=>&storage.paths.exports,"logs"=>&storage.paths.logs,"builtin"=>&storage.paths.builtin,_=>return Err("不支持的目录".into())};
    #[cfg(windows)] unsafe {
        use windows::{core::{PCWSTR,w},Win32::UI::{Shell::ShellExecuteW,WindowsAndMessaging::SW_SHOWNORMAL}};
        let wide:Vec<u16>=path.as_os_str().to_string_lossy().encode_utf16().chain(Some(0)).collect();
        if ShellExecuteW(None,w!("open"),PCWSTR(wide.as_ptr()),None,None,SW_SHOWNORMAL).0 as isize<=32{return Err("无法打开便携目录".into());}
    }
    Ok(())
}
pub fn show_startup_error(message:&str){
    #[cfg(windows)] unsafe {
        use windows::{core::{PCWSTR,w},Win32::UI::WindowsAndMessaging::{MessageBoxW,MB_OK,MB_ICONERROR}};
        let wide:Vec<u16>=message.encode_utf16().chain(Some(0)).collect();MessageBoxW(None,PCWSTR(wide.as_ptr()),w!("墨台 · 便携目录不可用"),MB_OK|MB_ICONERROR);
    }
    #[cfg(not(windows))] eprintln!("{message}");
}
