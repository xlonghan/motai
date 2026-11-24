use crate::{files::{ensure_main,NativeDocument},portable::PortablePaths,portable_runtime::PortableStorage};
use serde::Serialize;
use std::{fs,io::Write,path::{Component,Path,PathBuf}};
use tauri::{AppHandle,Manager,WebviewWindow};

const DEFAULTS:&[(&str,&str)]=&[
    ("开始使用.md",include_str!("../../builtin/开始使用.md")),
    ("Mermaid 示例集.md",include_str!("../../builtin/Mermaid 示例集.md")),
    ("Mermaid 常用图表示例.md",include_str!("../../builtin/Mermaid 常用图表示例.md")),
    ("demo.md",include_str!("../../builtin/demo.md")),
    ("2026-Architecture-Blueprint.md",include_str!("../../builtin/2026-Architecture-Blueprint.md")),
    ("assets/demo-illustration.svg",include_str!("../../builtin/assets/demo-illustration.svg")),
];
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PresetEntry {pub name:String,pub relative_path:String,pub modified:u64}

// Missing defaults are installed once with create_new. Never replace an existing
// document or asset, including an intentionally empty or read-only user file.
pub fn seed(paths:&PortablePaths)->Result<(),String>{
    let lock=fs::OpenOptions::new().create(true).truncate(false).read(true).write(true).open(paths.config.join("bootstrap.lock")).map_err(|error|error.to_string())?;
    lock.lock().map_err(|error|error.to_string())?;
    let root=fs::canonicalize(&paths.builtin).map_err(|error|error.to_string())?;
    for (relative,content) in DEFAULTS {
        let target=paths.builtin.join(relative);let parent=target.parent().ok_or("预置文档目录无效")?;
        fs::create_dir_all(parent).map_err(|error|error.to_string())?;
        if !fs::canonicalize(parent).map_err(|error|error.to_string())?.starts_with(&root){return Err("预置资源目录不能指向 builtin 外部".into());}
        if fs::symlink_metadata(&target).is_ok(){continue;}
        match fs::OpenOptions::new().create_new(true).write(true).open(&target){
            Ok(mut file)=>{if let Err(error)=file.write_all(content.as_bytes()).and_then(|_|file.sync_all()){drop(file);let _=fs::remove_file(&target);return Err(format!("无法生成预置文档 {}：{error}",target.display()));}},
            Err(error)if error.kind()==std::io::ErrorKind::AlreadyExists=>{},
            Err(error)=>return Err(format!("无法生成预置文档 {}：{error}",target.display())),
        }
    }Ok(())
}
fn markdown(path:&Path)->bool{path.extension().is_some_and(|extension|matches!(extension.to_string_lossy().to_ascii_lowercase().as_str(),"md"|"markdown"|"mdown"|"mkd"))}
pub fn catalog(paths:&PortablePaths)->Result<Vec<PresetEntry>,String>{
    fn visit(root:&Path,directory:&Path,depth:usize,result:&mut Vec<PresetEntry>)->Result<(),String>{
        for entry in fs::read_dir(directory).map_err(|error|format!("无法读取预置文档目录：{error}"))?{
            let entry=entry.map_err(|error|error.to_string())?;let kind=entry.file_type().map_err(|error|error.to_string())?;let path=entry.path();
            if kind.is_symlink()||entry.file_name().to_string_lossy().starts_with('.') {continue;}
            if !fs::canonicalize(&path).map_err(|error|error.to_string())?.starts_with(root){continue;}
            if kind.is_dir()&&depth<8 {visit(root,&path,depth+1,result)?;}
            else if kind.is_file()&&markdown(&path){
                if result.len()>=500{return Err("预置文档超过 500 个，请精简 builtin 目录".into());}
                result.push(PresetEntry{name:entry.file_name().to_string_lossy().into_owned(),relative_path:path.strip_prefix(root).map_err(|error|error.to_string())?.to_string_lossy().replace('\\',"/"),modified:crate::files::modified(&path)});
            }
        }Ok(())
    }
    let root=fs::canonicalize(&paths.builtin).map_err(|error|error.to_string())?;
    let mut entries=Vec::new();visit(&root,&root,0,&mut entries)?;
    entries.sort_by_key(|entry|entry.relative_path.to_lowercase());Ok(entries)
}
fn resolve(paths:&PortablePaths,relative:&str)->Result<PathBuf,String>{
    let path=Path::new(relative);
    if !markdown(path)||path.components().any(|part|!matches!(part,Component::Normal(_)|Component::CurDir)){return Err("预置文档路径无效".into());}
    let root=fs::canonicalize(&paths.builtin).map_err(|error|error.to_string())?;
    let target=fs::canonicalize(root.join(path)).map_err(|error|format!("预置文档不存在或无法读取：{error}"))?;
    if !target.starts_with(&root)||!target.is_file(){return Err("只能从 builtin 目录读取预置 Markdown".into());}Ok(target)
}
pub fn read(app:&AppHandle,window:WebviewWindow,relative:&str)->Result<NativeDocument,String>{
    let storage=app.state::<PortableStorage>();
    let path=resolve(&storage.paths,relative)?;crate::files::read_document(window,path.display().to_string())
}
#[tauri::command]
pub async fn list_presets(app:AppHandle,window:WebviewWindow)->Result<Vec<PresetEntry>,String>{
    ensure_main(&window)?;
    tauri::async_runtime::spawn_blocking(move||catalog(&app.state::<PortableStorage>().paths)).await.map_err(|error|error.to_string())?
}
#[tauri::command]
pub async fn read_preset(app:AppHandle,window:WebviewWindow,relative_path:String)->Result<NativeDocument,String>{
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("preset_open",false);
    operation.finish(tauri::async_runtime::spawn_blocking(move||read(&app,window,&relative_path)).await.map_err(|error|error.to_string())?)
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn defaults_are_editable_files_and_reseeding_never_replaces_user_changes(){
        let root=std::env::temp_dir().join(format!("markdown-presets-{}",std::process::id()));fs::create_dir_all(&root).unwrap();
        let paths=PortablePaths::new(root.clone(),root.join("data"),"test");paths.prepare(&[],&[]).unwrap();seed(&paths).unwrap();
        let demo=paths.builtin.join("demo.md");fs::write(&demo,"# My updated demo").unwrap();
        fs::write(paths.builtin.join("开始使用.md"),"").unwrap();seed(&paths).unwrap();
        assert_eq!(fs::read_to_string(&demo).unwrap(),"# My updated demo");assert_eq!(fs::read_to_string(paths.builtin.join("开始使用.md")).unwrap(),"");
        assert!(paths.builtin.join("assets/demo-illustration.svg").is_file());
        fs::create_dir_all(paths.builtin.join("我的模板")).unwrap();fs::write(paths.builtin.join("我的模板/报告.md"),"report").unwrap();
        let entries=catalog(&paths).unwrap();assert_eq!(entries.len(),6);assert!(entries.iter().any(|entry|entry.relative_path=="我的模板/报告.md"));
        assert!(resolve(&paths,"../outside.md").is_err());assert!(resolve(&paths,"assets/demo-illustration.svg").is_err());
        assert_eq!(fs::read_to_string(resolve(&paths,"demo.md").unwrap()).unwrap(),"# My updated demo");
        fs::remove_dir_all(root).unwrap();
    }
}
