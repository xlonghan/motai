use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tauri::{AppHandle, Manager, WebviewWindow};

const MAX_BYTES: u64 = 4 * 1024 * 1024;
#[derive(Default)]
pub struct DiagramCacheState { write: Mutex<()> }
#[derive(Serialize, Deserialize)]
pub struct DiagramCacheData { schema: u8, signature: String, entries: Vec<(String, String)> }
impl DiagramCacheData {
    fn valid(&self) -> bool { self.schema == 1 && self.signature.len() <= 16384 && self.entries.len() <= 24 && self.entries.iter().all(|(key, svg)| key.chars().count() <= 65536 && svg.chars().count() <= 1000000) }
}
fn read_cache(path: &Path) -> Option<DiagramCacheData> {
    if fs::metadata(path).ok()?.len() > MAX_BYTES { return None; }
    let cache: DiagramCacheData = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    cache.valid().then_some(cache)
}
pub fn load(app: &AppHandle) -> Option<DiagramCacheData> { read_cache(&app.path().app_cache_dir().ok()?.join("diagram-cache.json")) }

#[tauri::command]
pub async fn save_diagram_cache(app: AppHandle, window: WebviewWindow, cache: DiagramCacheData) -> Result<(), String> {
    crate::files::ensure_main(&window)?;
    let operation=crate::activity::Operation::new("diagram_cache_save",true);
    if !cache.valid() { return Err("图表缓存格式无效".into()); }
    let directory = app.path().app_cache_dir().map_err(|error|error.to_string())?;
    let result=tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DiagramCacheState>();
        let _lock = state.write.lock().map_err(|error| error.to_string())?;
        let bytes = serde_json::to_vec(&cache).map_err(|error| error.to_string())?;
        if bytes.len() as u64 > MAX_BYTES { return Err("图表缓存超过容量限制".into()); }
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        crate::files::atomic_write(&directory.join("diagram-cache.json"), &bytes)
    }).await.map_err(|error| error.to_string())?;
    operation.finish(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn corrupt_or_obsolete_optional_cache_is_ignored() {
        let path = std::env::temp_dir().join(format!("markdown-desk-cache-test-{}.json", std::process::id()));
        fs::write(&path, b"invalid json").unwrap(); assert!(read_cache(&path).is_none());
        fs::write(&path, br#"{"schema":0,"signature":"old","entries":[]}"#).unwrap(); assert!(read_cache(&path).is_none());
        fs::write(&path, br#"{"schema":1,"signature":"current","entries":[["flowchart LR","<svg/>"]]}"#).unwrap();
        assert_eq!(read_cache(&path).unwrap().entries.len(), 1); fs::remove_file(path).unwrap();
    }
}
