use std::{env, fs, io::Write, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug)]
pub struct PortablePaths {
    pub root: PathBuf,
    pub data: PathBuf,
    pub config: PathBuf,
    pub drafts: PathBuf,
    pub cache: PathBuf,
    pub webview: PathBuf,
    pub profile: PathBuf,
    pub logs: PathBuf,
    pub documents: PathBuf,
    pub exports: PathBuf,
    pub builtin: PathBuf,
}
impl PortablePaths {
    pub fn new(root: PathBuf, data: PathBuf, machine: &str) -> Self {
        Self { config:data.join("config"), drafts:data.join("drafts"), cache:data.join("cache"), profile:data.join("webview").join(format!("{:016x}",stable_hash(machine))), webview:data.join("webview"), logs:data.join("logs"), documents:root.join("documents"), exports:root.join("exports"),builtin:root.join("builtin"), root, data }
    }
    pub fn discover() -> Result<Self,String> {
        let executable=env::current_exe().map_err(|error|error.to_string())?;
        let directory=executable.parent().ok_or("无法确定程序目录")?;
        let root=match env::var_os("MARKDOWN_DESK_DATA_DIR") {
            Some(path)=>PathBuf::from(path),
            None if cfg!(all(windows,feature="installed"))=>{
                env::var_os("LOCALAPPDATA").map(PathBuf::from).filter(|path|path.is_absolute())
                    .ok_or("无法确定当前用户的 LocalAppData 目录")?.join("MarkdownDesk")
            }
            None=>directory.to_path_buf(),
        };
        let root=if root.is_absolute(){root}else{env::current_dir().map_err(|error|error.to_string())?.join(root)};
        let machine=format!("{}|{}",env::var("COMPUTERNAME").unwrap_or_default(),env::var("USERNAME").unwrap_or_default());
        Ok(Self::new(root.clone(),root.join("data"),&machine))
    }
    pub fn workspace(&self)->PathBuf {self.drafts.join("workspace.json")}
    pub fn settings(&self)->PathBuf {self.config.join("settings.json")}
    pub fn preferences(&self)->PathBuf {self.config.join("preferences.json")}
    pub fn initialized(&self)->PathBuf {self.config.join("preferences-initialized")}
    pub fn migration_marker(&self)->PathBuf {self.config.join("migration-v1.done")}
    pub fn prepare(&self,legacy_data:&[PathBuf],legacy_profiles:&[PathBuf])->Result<bool,String> {
        for directory in [&self.data,&self.config,&self.drafts,&self.cache,&self.webview,&self.logs,&self.documents,&self.exports,&self.builtin] {
            fs::create_dir_all(directory).map_err(|error|format!("无法创建墨台数据目录 {}：{error}。请确认该目录可写。",directory.display()))?;
            let canonical=fs::canonicalize(directory).map_err(|error|error.to_string())?;
            let root=fs::canonicalize(&self.root).map_err(|error|error.to_string())?;
            if !canonical.starts_with(&root){return Err(format!("数据目录指向墨台数据根目录外部：{}",directory.display()));}
        }
        for directory in [&self.config,&self.drafts,&self.cache,&self.webview,&self.logs,&self.documents,&self.exports] {probe_writable(directory)?;}
        let lock=fs::OpenOptions::new().create(true).truncate(false).read(true).write(true).open(self.config.join("bootstrap.lock")).map_err(|error|error.to_string())?;
        lock.lock().map_err(|error|error.to_string())?;
        if self.migration_marker().exists(){return Ok(false);}
        let mut copied=false;
        // Check/copy the locked browser preference store before copying drafts.
        // A still-running old app must not leave a half-adopted workspace behind.
        if !self.profile.exists()&&!self.settings().exists()&&!legacy_data.iter().any(|legacy|legacy.join("settings.json").is_file()){
            for legacy in legacy_profiles {if copy_profile_preferences(legacy,&self.profile,&self.cache)?{copied=true;break;}}
        }
        for legacy in legacy_data {
            copied|=copy_new(&legacy.join("workspace.json"),&self.workspace())?;
            copied|=copy_new(&legacy.join("diagram-cache.json"),&self.cache.join("diagram-cache.json"))?;
            copied|=copy_new(&legacy.join("settings.json"),&self.settings())?;
        }
        write_atomic(&self.migration_marker(),b"markdown-desk-portable-v1\n")?;
        Ok(copied)
    }
    pub fn export_directory(&self,extension:&str)->Result<PathBuf,String> {
        let folder=match extension {"html"=>"html","pdf"=>"pdf","svg"=>"svg","json"=>"settings",_=>return Err("不支持的导出格式".into())};
        let directory=self.exports.join(folder);fs::create_dir_all(&directory).map_err(|error|error.to_string())?;Ok(directory)
    }
    pub fn instance_identifier(&self,base:&str)->String {format!("{base}.portable-{:016x}",stable_hash(&normalized_path(&self.root.to_string_lossy())))}
}

pub fn stable_hash(value:&str)->u64 {value.as_bytes().iter().fold(0xcbf29ce484222325u64,|hash,byte|(hash^u64::from(*byte)).wrapping_mul(0x100000001b3))}
pub fn legacy_directories(identifier:&str)->(Vec<PathBuf>,Vec<PathBuf>) {
    if cfg!(all(windows,feature="installed"))||env::var_os("MARKDOWN_DESK_DATA_DIR").is_some(){return (Vec::new(),Vec::new());}
    let data=env::var_os("APPDATA").map(|base|vec![PathBuf::from(base).join(identifier)]).unwrap_or_default();
    let profiles=env::var_os("LOCALAPPDATA").map(|base|vec![PathBuf::from(base).join(identifier)]).unwrap_or_default();
    (data,profiles)
}
fn probe_writable(directory:&Path)->Result<(),String> {
    let file=directory.join(format!(".write-check-{}-{}",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));
    let result=fs::OpenOptions::new().create_new(true).write(true).open(&file);
    match result {Ok(handle)=>{drop(handle);fs::remove_file(file).map_err(|error|error.to_string())},Err(error)=>Err(format!("墨台数据目录不可写：{}（{error}）",directory.display()))}
}
pub fn write_atomic(path:&Path,bytes:&[u8])->Result<(),String> {
    let directory=path.parent().ok_or("无效的保存目录")?;
    let temporary=directory.join(format!(".portable-{}-{}.tmp",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));
    let result=(||{let mut file=fs::OpenOptions::new().create_new(true).write(true).open(&temporary).map_err(|error|error.to_string())?;file.write_all(bytes).map_err(|error|error.to_string())?;file.sync_all().map_err(|error|error.to_string())?;drop(file);
        if fs::metadata(path).is_ok_and(|metadata|metadata.permissions().readonly()){return Err(format!("文件为只读：{}",path.display()));}
        fs::rename(&temporary,path).map_err(|error|format!("无法保存 {}：{error}",path.display()))})();
    if result.is_err(){let _=fs::remove_file(&temporary);}result
}
fn copy_new(source:&Path,target:&Path)->Result<bool,String> {
    if !source.is_file()||fs::symlink_metadata(target).is_ok(){return Ok(false);}
    let bytes=fs::read(source).map_err(|error|format!("无法读取旧数据 {}：{error}",source.display()))?;
    write_atomic(target,&bytes)?;Ok(true)
}
fn copy_tree(source:&Path,target:&Path)->Result<(),String> {
    fs::create_dir_all(target).map_err(|error|error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error|error.to_string())? {
        let entry=entry.map_err(|error|error.to_string())?;let kind=entry.file_type().map_err(|error|error.to_string())?;
        if kind.is_symlink()||entry.file_name()=="LOCK" {continue;}
        let destination=target.join(entry.file_name());
        if kind.is_dir(){copy_tree(&entry.path(),&destination)?;}else if kind.is_file(){fs::copy(entry.path(),destination).map_err(|error|format!("无法迁移旧偏好：{error}。请先退出旧版墨台后重试。"))?;}
    }Ok(())
}
fn copy_profile_preferences(source:&Path,target:&Path,cache:&Path)->Result<bool,String> {
    let relative=["Default/Local Storage","EBWebView/Default/Local Storage"];
    let folders:Vec<_>=relative.iter().filter(|relative|source.join(relative).is_dir()).collect();
    if folders.is_empty(){return Ok(false);}
    // Do not copy Chromium caches/cookies. Local Storage is enough to adopt old
    // settings and Emoji history before the JSON files become authoritative.
    #[cfg(windows)]
    let _locks:Vec<_>=folders.iter().filter_map(|relative|{
        let lock=source.join(relative).join("leveldb/LOCK");if !lock.exists(){return None;}
        use std::os::windows::fs::OpenOptionsExt;
        Some(fs::OpenOptions::new().read(true).write(true).share_mode(0).open(&lock).map_err(|error|format!("旧版偏好数据仍在使用：{error}。请先退出旧版墨台。")))
    }).collect::<Result<_,_>>()?;
    let stage=cache.join(format!(".profile-migration-{}-{}",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));
    fs::create_dir(&stage).map_err(|error|error.to_string())?;
    let result=(||{for relative in folders {copy_tree(&source.join(relative),&stage.join(relative))?;}if target.exists(){return Ok(false);}fs::rename(&stage,target).map_err(|error|error.to_string())?;Ok(true)})();
    if stage.starts_with(cache)&&stage.exists(){let _=fs::remove_dir_all(stage);}result
}
fn normalized_path(path:&str)->String {path.trim_start_matches(r"\\?\").replace('\\',"/").trim_end_matches('/').to_lowercase()}
pub fn relocate_path(value:&str,old_root:&str,new_root:&Path)->String {
    let cleaned=value.trim_start_matches(r"\\?\").replace('\\',"/");let old=old_root.trim_start_matches(r"\\?\").replace('\\',"/");let old=old.trim_end_matches('/');
    let normalized=normalized_path(&cleaned);let base=normalized_path(old);
    if normalized==base{return new_root.to_string_lossy().into_owned();}
    if normalized.starts_with(&(base+"/")){return new_root.join(&cleaned[old.len()+1..]).to_string_lossy().into_owned();}value.into()
}
pub fn safe_document_name(name:&str)->Result<String,String> {
    let name=name.trim();if name.is_empty()||name.contains(['/', '\\', ':','*','?','"','<','>','|'])||name.chars().any(char::is_control){return Err("文档名称包含无效字符".into());}
    let base=if name.to_ascii_lowercase().ends_with(".md"){&name[..name.len()-3]}else{name};let base=base.trim_end_matches(['.',' ']);
    let reserved=base.split('.').next().unwrap_or("").to_ascii_uppercase();
    if base.is_empty()||matches!(reserved.as_str(),"CON"|"PRN"|"AUX"|"NUL")||(reserved.len()==4&&(reserved.starts_with("COM")||reserved.starts_with("LPT"))&&matches!(reserved.as_bytes()[3],b'1'..=b'9')){return Err("文档名称不可用".into());}
    Ok(format!("{base}.md"))
}
pub fn create_document(paths:&PortablePaths,name:&str,content:&str)->Result<PathBuf,String> {
    let name=safe_document_name(name)?;let stem=name.trim_end_matches(".md");
    for index in 1..10000 {
        let path=paths.documents.join(if index==1{name.clone()}else{format!("{stem} ({index}).md")});
        match fs::OpenOptions::new().create_new(true).write(true).open(&path){
            Ok(mut file)=>{if let Err(error)=file.write_all(content.as_bytes()).and_then(|_|file.sync_all()){drop(file);let _=fs::remove_file(&path);return Err(error.to_string());}return Ok(path);},
            Err(error) if error.kind()==std::io::ErrorKind::AlreadyExists=>continue,
            Err(error)=>return Err(format!("无法新建文档：{error}")),
        }
    }Err("同名文档过多，请更换名称".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->PathBuf {let path=env::temp_dir().join(format!("markdown-portable-{}-{}",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));fs::create_dir_all(&path).unwrap();path}
    #[test] fn layout_is_grouped_and_machine_profiles_are_separate(){let root=fixture();let paths=PortablePaths::new(root.clone(),root.join("data"),"machine-a");assert_eq!(paths.workspace(),root.join("data/drafts/workspace.json"));assert_eq!(paths.settings(),root.join("data/config/settings.json"));assert_ne!(paths.profile,PortablePaths::new(root.clone(),root.join("data"),"machine-b").profile);fs::remove_dir_all(root).unwrap();}
    #[test] fn migration_copies_without_overwriting_and_never_deletes_legacy(){let root=fixture();let legacy=root.join("legacy");fs::create_dir(&legacy).unwrap();fs::write(legacy.join("workspace.json"),b"legacy").unwrap();let paths=PortablePaths::new(root.clone(),root.join("data"),"a");paths.prepare(&[legacy.clone()],&[]).unwrap();assert_eq!(fs::read(paths.workspace()).unwrap(),b"legacy");fs::write(paths.workspace(),b"current").unwrap();paths.prepare(&[legacy.clone()],&[]).unwrap();assert_eq!(fs::read(paths.workspace()).unwrap(),b"current");assert!(legacy.join("workspace.json").exists());fs::remove_dir_all(root).unwrap();}
    #[test] fn new_documents_never_replace_existing_files(){let root=fixture();let paths=PortablePaths::new(root.clone(),root.join("data"),"a");paths.prepare(&[],&[]).unwrap();let first=create_document(&paths,"笔记.md","first").unwrap();let second=create_document(&paths,"笔记.md","second").unwrap();assert_ne!(first,second);assert_eq!(fs::read_to_string(first).unwrap(),"first");assert!(safe_document_name("../escape").is_err());assert!(safe_document_name("CON.md").is_err());fs::remove_dir_all(root).unwrap();}
    #[test] fn moving_a_folder_only_rebases_managed_paths(){assert_eq!(relocate_path("D:/old/documents/note.md","D:/old",Path::new("E:/new")),Path::new("E:/new").join("documents/note.md").to_string_lossy());assert_eq!(relocate_path("D:/elsewhere/note.md","D:/old",Path::new("E:/new")),"D:/elsewhere/note.md");assert_eq!(relocate_path("D:/older/note.md","D:/old",Path::new("E:/new")),"D:/older/note.md");}
    #[test] fn profile_migration_only_copies_local_storage(){let root=fixture();let legacy=root.join("legacy");fs::create_dir_all(legacy.join("Default/Local Storage/leveldb")).unwrap();fs::create_dir_all(legacy.join("Default/Cache")).unwrap();fs::write(legacy.join("Default/Local Storage/leveldb/000001.log"),b"prefs").unwrap();fs::write(legacy.join("Default/Cache/large"),b"cache").unwrap();let paths=PortablePaths::new(root.clone(),root.join("data"),"a");paths.prepare(&[],&[legacy]).unwrap();assert!(paths.profile.join("Default/Local Storage/leveldb/000001.log").exists());assert!(!paths.profile.join("Default/Cache").exists());fs::remove_dir_all(root).unwrap();}
}
