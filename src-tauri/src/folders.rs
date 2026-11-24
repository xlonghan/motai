use crate::files::ensure_main;
use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Default)]
pub struct FolderState { roots: Mutex<Vec<PathBuf>> }

#[derive(Serialize)]
pub struct Entry { name: String, path: String, kind: String }

pub fn entries(root: &Path, path: &Path) -> Result<Vec<Entry>, String> {
    let path = fs::canonicalize(path).map_err(|error| format!("无法读取文件夹：{error}"))?;
    if !path.starts_with(root) || !path.is_dir() { return Err("请选择已打开文件夹内的目录".into()); }
    let mut result = Vec::new();
    for item in fs::read_dir(path).map_err(|error| error.to_string())? {
        let Ok(item) = item else { continue; };
        let Ok(kind) = item.file_type() else { continue; };
        if kind.is_symlink() { continue; }
        let name = item.file_name().to_string_lossy().into_owned();
        if [".git", ".svn", "node_modules", "target", ".cache"].contains(&name.as_str()) { continue; }
        let item_path = item.path();
        let extension = item_path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
        if !kind.is_dir() && !["md","markdown","txt","mdown","mkd"].contains(&extension.as_str()) { continue; }
        result.push(Entry {name,path:item_path.to_string_lossy().into_owned(),kind:if kind.is_dir(){"directory".into()}else{"file".into()}});
        if result.len() >= 2500 { break; }
    }
    result.sort_by(|a,b| (a.kind != "directory", a.name.to_lowercase()).cmp(&(b.kind != "directory", b.name.to_lowercase())));
    Ok(result)
}

#[tauri::command]
pub async fn open_folder(app: AppHandle, window: WebviewWindow, path: String) -> Result<Entry, String> {
    ensure_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = fs::canonicalize(path).map_err(|error| format!("无法打开文件夹：{error}"))?;
        if !path.is_dir() { return Err("请选择文件夹".into()); }
        let state = app.state::<FolderState>();
        let mut roots = state.roots.lock().map_err(|error| error.to_string())?;
        roots.clear(); roots.push(path.clone());
        Ok(Entry {name:path.file_name().unwrap_or(path.as_os_str()).to_string_lossy().into_owned(),path:path.to_string_lossy().into_owned(),kind:"directory".into()})
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_folder(app: AppHandle, window: WebviewWindow, path: String) -> Result<Vec<Entry>, String> {
    ensure_main(&window)?;
    let root = app.state::<FolderState>().roots.lock().map_err(|error| error.to_string())?.first().cloned().ok_or("请先打开文件夹")?;
    tauri::async_runtime::spawn_blocking(move || entries(&root, Path::new(&path))).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn folder_listing_is_lazy_filtered_and_stays_inside_the_selected_root() {
        let temp = std::env::temp_dir();
        let root = temp.join(format!("markdown-desk-folder-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        fs::create_dir(root.join("chapters")).unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join("a.md"),"# Document").unwrap();
        fs::write(root.join("note.txt"),"Text").unwrap();
        fs::write(root.join("ignored.bin"),"ignored").unwrap();
        let canonical = fs::canonicalize(&root).unwrap();
        let result = entries(&canonical,&canonical).unwrap();
        assert_eq!(result.iter().map(|entry|entry.name.as_str()).collect::<Vec<_>>(),vec!["chapters","a.md","note.txt"]);
        assert!(entries(&canonical,canonical.parent().unwrap()).is_err());
        assert!(canonical.starts_with(fs::canonicalize(&temp).unwrap()));
        assert!(canonical.file_name().unwrap().to_string_lossy().starts_with("markdown-desk-folder-test-"));
        fs::remove_dir_all(canonical).unwrap();
    }
}
