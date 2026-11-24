use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::{fs, io::Write, path::{Path, PathBuf}, sync::{Mutex, atomic::{AtomicU64, Ordering}}, time::UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct FileState {
    pub pending: Mutex<Vec<String>>,
    startup_paths: Mutex<Vec<String>>,
    pub workspace_write: Mutex<()>,
    managed_write: Mutex<()>,
}
impl FileState {
    pub fn with_launch_paths(paths: Vec<String>) -> Self { Self { pending: Mutex::new(paths), ..Self::default() } }
    fn reserve_startup_paths(&self) -> Result<Vec<String>, String> {
        let mut reserved = self.startup_paths.lock().map_err(|error| error.to_string())?;
        reserved.extend(std::mem::take(&mut *self.pending.lock().map_err(|error| error.to_string())?));
        Ok(reserved.clone())
    }
    pub fn finish_startup(&self) { self.startup_paths.lock().unwrap_or_else(|error| error.into_inner()).clear(); }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDocument {
    pub name: String,
    pub path: String,
    pub markdown: String,
    pub modified: u64,
    pub managed: bool,
    pub preset: bool,
}

pub fn ensure_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("此操作仅允许在编辑器中执行".into()) }
}

pub fn data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

pub fn modified(path: &Path) -> u64 {
    fs::metadata(path).and_then(|metadata| metadata.modified()).ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_millis() as u64).unwrap_or(0)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().filter(|parent| parent.is_dir()).ok_or("目标文件夹不存在")?;
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary = parent.join(format!(".markdown-desk-{}-{sequence}.tmp", std::process::id()));
    let result = (|| {
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        if let Ok(metadata) = fs::metadata(path) {
            if metadata.permissions().readonly() {
                return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "文件为只读"));
            }
            fs::set_permissions(&temporary, metadata.permissions())?;
        }
        drop(output);
        fs::rename(&temporary, path)
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result.map_err(|error| format!("保存失败，原文件未被截断：{error}"))
}

pub fn decode_source(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut result = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = ((bytes[index + 1] as char).to_digit(16), (bytes[index + 2] as char).to_digit(16)) {
                result.push((high * 16 + low) as u8); index += 3; continue;
            }
        }
        result.push(bytes[index]); index += 1;
    }
    String::from_utf8_lossy(&result).into_owned()
}

pub fn resolve_relative(document_path: &str, source: &str) -> Result<PathBuf, String> {
    let decoded = decode_source(source.split('#').next().unwrap_or(source).split('?').next().unwrap_or(source));
    let value = decoded.strip_prefix("file:///").unwrap_or(&decoded);
    let path = PathBuf::from(value);
    if path.is_absolute() { Ok(path) }
    else { Ok(Path::new(document_path).parent().ok_or("文档路径无效")?.join(path)) }
}

#[tauri::command]
pub fn read_document(window: WebviewWindow, path: String) -> Result<NativeDocument, String> {
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("document_open",false);
    let path = fs::canonicalize(path).map_err(|error| format!("无法打开文件：{error}"))?;
    let extension = path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
    if !["md", "markdown", "txt", "mdown", "mkd"].contains(&extension.as_str()) { return Err("请选择 Markdown 或文本文件".into()); }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > 15 * 1024 * 1024 { return Err("文档不能超过 15 MB".into()); }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let markdown = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let little = bytes[0] == 0xff;
        let units = bytes[2..].chunks_exact(2).map(|pair| if little { u16::from_le_bytes([pair[0], pair[1]]) } else { u16::from_be_bytes([pair[0], pair[1]]) }).collect::<Vec<_>>();
        String::from_utf16(&units).map_err(|_| "文件编码无效，请转换为 UTF-8")?
    } else {
        String::from_utf8(bytes).map_err(|_| "文件不是 UTF-8/UTF-16 编码，请转换为 UTF-8 后打开")?.trim_start_matches('\u{feff}').to_owned()
    };
    let managed=window.try_state::<crate::portable_runtime::PortableStorage>().and_then(|storage|fs::canonicalize(&storage.paths.documents).ok()).is_some_and(|directory|path.starts_with(directory));
    let preset=window.try_state::<crate::portable_runtime::PortableStorage>().and_then(|storage|fs::canonicalize(&storage.paths.builtin).ok()).is_some_and(|directory|path.starts_with(directory));
    operation.finish(Ok(NativeDocument { name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(), path: path.to_string_lossy().into_owned(), markdown, modified: modified(&path), managed,preset }))
}

#[tauri::command]
pub fn create_managed_document(app:AppHandle,window:WebviewWindow,name:String,content:String)->Result<NativeDocument,String>{
    ensure_main(&window)?;if content.len()>15*1024*1024{return Err("文档不能超过 15 MB".into());}
    let operation=crate::activity::Operation::new("document_create",false);
    let state=app.state::<FileState>();let _lock=state.managed_write.lock().map_err(|error|error.to_string())?;
    let storage=app.state::<crate::portable_runtime::PortableStorage>();
    let path=crate::portable::create_document(&storage.paths,&name,&content)?;
    operation.finish(read_document(window,path.display().to_string()))
}
#[tauri::command]
pub fn rename_managed_document(app:AppHandle,window:WebviewWindow,path:String,name:String,expected_modified:u64)->Result<NativeDocument,String>{
    ensure_main(&window)?;let state=app.state::<FileState>();let _lock=state.managed_write.lock().map_err(|error|error.to_string())?;
    let operation=crate::activity::Operation::new("document_rename",false);
    let storage=app.state::<crate::portable_runtime::PortableStorage>();
    let source=fs::canonicalize(&path).map_err(|error|error.to_string())?;
    let directory=fs::canonicalize(&storage.paths.documents).map_err(|error|error.to_string())?;
    if !source.starts_with(directory){return Err("只能直接重命名此便携目录 documents 中的文档".into());}
    if modified(&source)!=expected_modified{return Err("文件已被其他程序修改，请重新打开后再重命名".into());}
    let target=source.parent().ok_or("无效路径")?.join(crate::portable::safe_document_name(&name)?);
    if source!=target {
        #[cfg(windows)] unsafe {
            use windows::{core::PCWSTR,Win32::Storage::FileSystem::MoveFileW};
            let from:Vec<u16>=source.as_os_str().to_string_lossy().encode_utf16().chain(Some(0)).collect();
            let to:Vec<u16>=target.as_os_str().to_string_lossy().encode_utf16().chain(Some(0)).collect();
            MoveFileW(PCWSTR(from.as_ptr()),PCWSTR(to.as_ptr())).map_err(|error|format!("无法重命名，目标可能已存在或文件被占用：{error}"))?;
        }
        #[cfg(not(windows))] {return Err("当前平台未实现原生重命名".into());}
    }
    operation.finish(read_document(window,target.display().to_string()))
}

#[tauri::command]
pub fn write_text(window: WebviewWindow, path: String, content: String, expected_modified: Option<u64>) -> Result<u64, String> {
    ensure_main(&window)?;
    let path = PathBuf::from(path);
    let extension = path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
    let operation=crate::activity::Operation::new(match extension.as_str(){"html"=>"html_export","svg"=>"svg_export","json"=>"settings_export",_=>"document_save"},false);
    if !["md", "markdown", "mdown", "mkd", "txt", "html", "svg", "json"].contains(&extension.as_str()) { return Err("不支持的保存格式".into()); }
    if let Some(expected) = expected_modified {
        if path.exists() && modified(&path) != expected { return Err("磁盘文件已被其他程序修改。请重新打开或另存为，避免覆盖外部修改。".into()); }
    }
    atomic_write(&path, content.as_bytes())?;
    operation.finish(Ok(modified(&path)))
}

#[tauri::command]
pub fn read_image(window: WebviewWindow, document_path: String, source: String) -> Result<String, String> {
    ensure_main(&window)?;
    let path = resolve_relative(&document_path, &source)?;
    let extension = path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
    let mime = match extension.as_str() { "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "bmp" => "image/bmp", "svg" => "image/svg+xml", "ico" => "image/x-icon", _ => return Err("不支持的图片格式".into()) };
    if fs::metadata(&path).map_err(|error| format!("图片 {source}：{error}"))?.len() > 20 * 1024 * 1024 { return Err("图片不能超过 20 MB".into()); }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn relative_document_path(window: WebviewWindow, document_path: String, source: String) -> Result<String, String> {
    ensure_main(&window)?;
    Ok(resolve_relative(&document_path, &source)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn load_workspace(app: AppHandle, window: WebviewWindow) -> Result<Option<serde_json::Value>, String> {
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("workspace_load",true);
    let path = data_directory(&app)?.join("workspace.json");
    if !path.exists() { return operation.finish(Ok(None)); }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let mut workspace:serde_json::Value=serde_json::from_slice(&bytes).map_err(|error| format!("草稿文件读取失败：{error}"))?;
    let storage=app.state::<crate::portable_runtime::PortableStorage>();relocate_workspace(&mut workspace,&storage.paths.root);
    operation.finish(Ok(Some(workspace)))
}

fn relocate_workspace(workspace:&mut serde_json::Value,root:&Path){
    let Some(old)=workspace.get("portableRoot").and_then(serde_json::Value::as_str).map(String::from)else{return;};
    for field in ["documents","recentFiles"] {if let Some(records)=workspace.get_mut(field).and_then(serde_json::Value::as_array_mut){for record in records{for key in ["path","folderKey","folderLocation"]{if let Some(value)=record.get_mut(key){if let Some(path)=value.as_str(){*value=crate::portable::relocate_path(path,&old,root).into();}}}}}}
    if let Some(value)=workspace.get_mut("folderPath"){if let Some(path)=value.as_str(){*value=crate::portable::relocate_path(path,&old,root).into();}}
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupData {
    workspace: Option<serde_json::Value>,
    diagram_cache: Option<crate::diagram_cache::DiagramCacheData>,
    documents: Vec<NativeDocument>,
    errors: Vec<String>,
    display_scale: f64,
    settings: Option<serde_json::Value>,
    preferences: Option<serde_json::Value>,
    adopt_legacy_browser_state: bool,
    storage: crate::portable_runtime::StorageInfo,
    presets:Vec<crate::presets::PresetEntry>,
}

// Prepare startup data while the editor JavaScript is loading. Read optional
// caches off the UI thread and select launch files before creating Cherry.
#[tauri::command]
pub async fn load_startup_data(app: AppHandle, window: WebviewWindow) -> Result<StartupData, String> {
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("startup_data_load",false);
    let display_scale = window.scale_factor().unwrap_or(1.0);
    let paths = app.state::<FileState>().reserve_startup_paths()?;
    let result=tauri::async_runtime::spawn_blocking(move || {
        let workspace = load_workspace(app.clone(), window.clone())?;
        let diagram_cache = crate::diagram_cache::load(&app);
        let state=app.state::<crate::portable_runtime::PortableStorage>();
        let settings=crate::portable_runtime::load_settings(&state)?;
        let preferences=crate::portable_runtime::load_preferences(&state)?;
        let adopt_legacy_browser_state=!state.paths.initialized().exists();let storage=state.info();
        let mut documents = Vec::new(); let mut errors = Vec::new();
        let presets=match crate::presets::catalog(&state.paths){Ok(entries)=>entries,Err(error)=>{errors.push(error);Vec::new()}};
        for path in paths {
            match read_document(window.clone(), path) { Ok(document) => documents.push(document), Err(error) => errors.push(error) }
        }
        Ok(StartupData { workspace, diagram_cache, documents, errors, display_scale,settings,preferences,adopt_legacy_browser_state,storage,presets })
    }).await.map_err(|error| error.to_string())?;
    operation.finish(result)
}

#[tauri::command]
pub async fn save_workspace(app: AppHandle, window: WebviewWindow, mut workspace: serde_json::Value) -> Result<(), String> {
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("workspace_save",true);
    let directory = data_directory(&app)?;
    if let Some(object)=workspace.as_object_mut(){object.insert("portableRoot".into(),app.state::<crate::portable_runtime::PortableStorage>().paths.root.display().to_string().into());}
    let result=tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<FileState>();
        let _lock = state.workspace_write.lock().map_err(|error| error.to_string())?;
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let bytes = serde_json::to_vec(&workspace).map_err(|error| error.to_string())?;
        atomic_write(&directory.join("workspace.json"), &bytes)
    }).await.map_err(|error| error.to_string())?;
    operation.finish(result)
}

#[tauri::command]
pub fn take_launch_paths(window: WebviewWindow, state: tauri::State<'_, FileState>) -> Result<Vec<String>, String> {
    ensure_main(&window)?;
    Ok(std::mem::take(&mut *state.pending.lock().map_err(|error| error.to_string())?))
}

pub fn launch_paths(arguments: impl Iterator<Item = String>) -> Vec<String> {
    arguments.skip(1).filter(|argument| Path::new(argument).is_file()).collect()
}

#[tauri::command]
pub fn open_external(window: WebviewWindow, url: String) -> Result<(), String> {
    ensure_main(&window)?;
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.contains(['\r', '\n']) { return Err("只允许打开 HTTP/HTTPS 链接".into()); }
    #[cfg(windows)]
    unsafe {
        use windows::{core::{PCWSTR, w}, Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}};
        let value: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
        let result = ShellExecuteW(None, w!("open"), PCWSTR(value.as_ptr()), None, None, SW_SHOWNORMAL);
        if result.0 as isize <= 32 { return Err("无法打开系统浏览器".into()); }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_relocation_preserves_body_and_external_files() {
        let mut value=serde_json::json!({"portableRoot":"D:/old","documents":[{"path":"D:/old/documents/one.md","markdown":"D:/old/documents/one.md"},{"path":"D:/outside/file.md"}],"recentFiles":[{"path":"D:/old/documents/one.md"}],"folderPath":"D:/old/documents"});
        relocate_workspace(&mut value,Path::new("E:/new"));
        assert_eq!(value["documents"][0]["path"],Path::new("E:/new").join("documents/one.md").display().to_string());
        assert_eq!(value["documents"][0]["markdown"],"D:/old/documents/one.md");
        assert_eq!(value["documents"][1]["path"],"D:/outside/file.md");
        assert_eq!(value["recentFiles"][0]["path"],value["documents"][0]["path"]);
    }

    #[test]
    fn startup_files_survive_retries_without_duplicate_delivery() {
        let state = FileState::default(); state.pending.lock().unwrap().push("first.md".into());
        assert_eq!(state.reserve_startup_paths().unwrap(), vec!["first.md"]);
        assert!(state.pending.lock().unwrap().is_empty());
        assert_eq!(state.reserve_startup_paths().unwrap(), vec!["first.md"]);
        state.pending.lock().unwrap().push("second.md".into());
        assert_eq!(state.reserve_startup_paths().unwrap(), vec!["first.md", "second.md"]);
        state.finish_startup(); assert!(state.reserve_startup_paths().unwrap().is_empty());
        state.pending.lock().unwrap().push("new.md".into());
        assert_eq!(*state.pending.lock().unwrap(), vec!["new.md"]);
    }

    fn fixture() -> PathBuf {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("markdown-desk-test-{}-{sequence}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn saving_replaces_an_existing_file_without_leaving_a_partial_file() {
        let directory = fixture();
        let path = directory.join("中文.md");
        fs::write(&path, "原始内容").unwrap();
        atomic_write(&path, "新的 Markdown 内容".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "新的 Markdown 内容");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn a_read_only_file_is_preserved_when_saving_fails() {
        let directory = fixture();
        let path = directory.join("readonly.md");
        fs::write(&path, "保留原文").unwrap();
        let original = fs::metadata(&path).unwrap().permissions();
        let mut read_only = original.clone();
        read_only.set_readonly(true);
        fs::set_permissions(&path, read_only).unwrap();
        assert!(atomic_write(&path, b"replacement").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "保留原文");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::set_permissions(&path, original).unwrap();
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn image_paths_decode_utf8_and_resolve_against_the_document() {
        let path = resolve_relative("D:\\notes\\folder\\example.md", "../images/%E4%B8%AD%E6%96%87%20image.svg#icon").unwrap();
        assert_eq!(path, PathBuf::from("D:\\notes\\folder\\../images/中文 image.svg"));
    }
}
