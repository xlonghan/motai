//! Isolated native integration checks. Requires an explicitly supplied QA root.
#[path="../src/files.rs"]mod files;
#[path="../src/portable.rs"]mod portable;
#[path="../src/portable_runtime.rs"]mod portable_runtime;
#[path="../src/diagram_cache.rs"]mod diagram_cache;
#[path="../src/activity.rs"]mod activity;
#[path="../src/presets.rs"]mod presets;
use std::{fs,path::PathBuf};
use tauri::Manager;
use serde_json::json;

fn main(){
    let root=PathBuf::from(std::env::var_os("MARKDOWN_DESK_DATA_DIR").expect("An isolated QA data root is required"));
    assert!(root.is_absolute()&&root.to_string_lossy().contains("verification"));
    assert!(!root.exists(),"Use a fresh QA root; never overwrite an existing workspace");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("workspace.json"),br#"{"documents":[],"legacyFixture":true}"#).unwrap();
    let mut context=tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let storage=portable_runtime::configure(&mut context).unwrap();
    assert!(storage.migrated);
    tauri::Builder::default().plugin(activity::plugin()).manage(storage).manage(files::FileState::default())
        .setup(move|app|{
            activity::started(app)?;
            let window=tauri::WebviewWindowBuilder::new(app,"main",tauri::WebviewUrl::App("pdf.html".into())).visible(false).build()?;
            let app=app.handle().clone();
            tauri::async_runtime::spawn(async move{
                let runner=app.clone();
                let result=tauri::async_runtime::spawn(async move{check(&runner,&window).await}).await.unwrap_or_else(|error|Err(error.to_string()));
                let report=match &result{Ok(value)=>value.clone(),Err(error)=>json!({"passed":false,"error":error})};
                fs::write(root.join("report.json"),serde_json::to_vec_pretty(&report).unwrap()).unwrap();
                log::logger().flush();println!("{report}");app.exit(if result.is_ok(){0}else{1});
            });Ok(())
        }).build(context).unwrap().run(|app,event|if matches!(event,tauri::RunEvent::Exit){activity::stopped(app);});
}
async fn check(app:&tauri::AppHandle,window:&tauri::WebviewWindow)->Result<serde_json::Value,String>{
    let paths=app.state::<portable_runtime::PortableStorage>().paths.clone();
    for(actual,expected)in[(app.path().app_config_dir(),&paths.config),(app.path().app_data_dir(),&paths.drafts),(app.path().app_cache_dir(),&paths.cache),(app.path().app_log_dir(),&paths.logs),(app.path().app_local_data_dir(),&paths.profile)]{assert_eq!(actual.unwrap(),*expected);}
    let startup=serde_json::to_value(files::load_startup_data(app.clone(),window.clone()).await?).unwrap();
    assert_eq!(startup["workspace"]["legacyFixture"],true);
    assert!(paths.root.join("workspace.json").exists());
    assert_eq!(startup["presets"].as_array().unwrap().len(),5);assert!(startup.get("presetDocuments").is_none());
    assert!(startup["presets"].as_array().unwrap().iter().all(|entry|entry.get("markdown").is_none()));
    let original=presets::read_preset(app.clone(),window.clone(),"demo.md".into()).await?;
    assert!(original.preset&&!original.managed);assert_eq!(PathBuf::from(&original.path),fs::canonicalize(paths.builtin.join("demo.md")).unwrap());
    fs::write(paths.builtin.join("demo.md"),"# Updated preset while running\n\n[[2026-Architecture-Blueprint|linked note]]").unwrap();
    presets::seed(&paths)?;
    let updated=presets::read_preset(app.clone(),window.clone(),"demo.md".into()).await?;
    assert!(updated.markdown.starts_with("# Updated preset while running"));
    fs::create_dir_all(paths.builtin.join("团队模板")).unwrap();fs::write(paths.builtin.join("团队模板/报告.md"),"# Report").unwrap();
    assert!(presets::list_presets(app.clone(),window.clone()).await?.iter().any(|entry|entry.relative_path=="团队模板/报告.md"));
    assert!(presets::read_preset(app.clone(),window.clone(),"../workspace.json".into()).await.is_err());
    let settings=json!({"version":1,"values":{"theme":"light","logLevel":"debug"}});
    let preferences=json!({"markdown-desk-recent-emoji":"[\"🍎\"]"});
    portable_runtime::save_preferences(app.clone(),window.clone(),settings.clone(),preferences.clone()).await?;
    assert_eq!(portable_runtime::load_settings(&app.state())?,Some(settings.clone()));
    assert_eq!(portable_runtime::load_preferences(&app.state())?.unwrap()["values"],preferences);
    assert_eq!(portable_runtime::startup_theme(app.clone(),window.clone())?,Some("light".into()));
    let secret="PRIVATE_TEST_MARKDOWN_NEVER_LOG_2d8c39";
    let first=files::create_managed_document(app.clone(),window.clone(),"测试.MD".into(),secret.into())?;
    let second=files::create_managed_document(app.clone(),window.clone(),"测试.md".into(),"second".into())?;
    assert_ne!(first.path,second.path);assert!(first.managed);assert!(first.name.ends_with(".md"));
    assert!(files::rename_managed_document(app.clone(),window.clone(),first.path.clone(),second.name.clone(),first.modified).is_err());
    let renamed=files::rename_managed_document(app.clone(),window.clone(),first.path.clone(),"已重命名".into(),first.modified)?;
    assert!(!PathBuf::from(first.path).exists());assert_eq!(renamed.markdown,secret);
    let export=portable_runtime::default_save_path(app.clone(),window.clone(),"test.html".into(),"html".into())?;
    assert_eq!(PathBuf::from(&export),paths.exports.join("html/test.html"));
    files::write_text(window.clone(),export,"<html><body>test</body></html>".into(),None)?;
    files::save_workspace(app.clone(),window.clone(),json!({"documents":[{"name":renamed.name,"path":renamed.path,"markdown":secret,"managed":true}]})).await?;
    let saved=files::load_workspace(app.clone(),window.clone())?.unwrap();assert_eq!(saved["portableRoot"],paths.root.display().to_string());
    files::save_workspace(app.clone(),window.clone(),json!({"activeId":"preset-check","openDocumentIds":["preset-check"],"documents":[{"id":"preset-check","name":"demo.md","path":updated.path,"markdown":"stale draft","preset":true}]})).await?;
    fs::write(paths.builtin.join("demo.md"),[0xff,0xff]).unwrap();
    let next_start=serde_json::to_value(files::load_startup_data(app.clone(),window.clone()).await?).unwrap();
    assert!(next_start.get("presetDocuments").is_none());assert!(next_start["errors"].as_array().unwrap().is_empty());
    // Invalid content must have no effect on startup, but fail when explicitly opened.
    assert!(presets::read_preset(app.clone(),window.clone(),"demo.md".into()).await.is_err());
    fs::write(paths.builtin.join("demo.md"),&updated.markdown).unwrap();
    let original=fs::metadata(paths.settings()).unwrap().permissions();let mut readonly=original.clone();readonly.set_readonly(true);fs::set_permissions(paths.settings(),readonly).unwrap();
    let failed=portable_runtime::save_preferences(app.clone(),window.clone(),json!({"version":1,"values":{"theme":"dark"}}),preferences).await;
    fs::set_permissions(paths.settings(),original).unwrap();assert!(failed.is_err());
    assert_eq!(portable_runtime::load_settings(&app.state())?,Some(settings));
    // Exercise the actual configured logger and its rotation, not a mock.
    log::info!(target:"untrusted_parser","{secret}");
    log::logger().flush();
    let active_log=paths.logs.join("motai.log");
    assert!(!fs::read_to_string(&active_log).unwrap().contains(secret));
    log::set_max_level(log::LevelFilter::Warn);
    log::info!("qa_info_should_be_filtered");log::warn!("qa_warn_should_be_kept");log::logger().flush();
    let level_check=fs::read_to_string(&active_log).unwrap();assert!(!level_check.contains("qa_info_should_be_filtered"));assert!(level_check.contains("qa_warn_should_be_kept"));
    log::set_max_level(log::LevelFilter::Debug);
    let padding="x".repeat(2048);
    // Upstream names archives by second; spread rotations across distinct seconds
    // so the test also exercises removal beyond the configured retention count.
    for batch in 0..8{for index in 0..520{log::info!("rotation_check batch={batch} index={index} {padding}");}std::thread::sleep(std::time::Duration::from_millis(1100));}
    log::logger().flush();
    let logs:Vec<_>=fs::read_dir(&paths.logs).unwrap().map(|entry|entry.unwrap().path()).filter(|path|path.extension().is_some_and(|ext|ext=="log")).collect();
    assert_eq!(logs.len(),activity::LOG_BACKUPS+1,"Retention must keep exactly 5 historical files plus the active file");
    for path in &logs{let text=fs::read_to_string(path).unwrap();assert!(!text.contains(secret));assert!(fs::metadata(path).unwrap().len()<=activity::LOG_LIMIT as u64+4096);}
    // The next process must append to the remaining active log, not truncate it.
    Ok(json!({"passed":true,"checks":["grouped_path_overrides","legacy_copy_preserves_original","settings_and_emoji_roundtrip","native_new_and_rename","collision_no_overwrite","export_default_subdirectory","workspace_root_metadata","readonly_configuration_failure","actual_logger_rotation_and_redaction","preset_files_extracted_and_user_changes_preserved","live_preset_reload_and_custom_subfolder_discovery","preset_path_scope","startup_metadata_only_preset_content_is_lazy"],"logFiles":logs.len(),"root":paths.root}))
}
