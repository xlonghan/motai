#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod files;
mod pdf;
mod folders;
mod startup;
mod diagram_cache;
mod portable;
mod portable_runtime;
mod activity;
mod presets;
mod file_association;
#[cfg(windows)]
mod legacy_open_with;

use tauri::{Emitter, Manager};

fn main() {
    let mut context=tauri::generate_context!();
    let storage=match portable_runtime::configure(&mut context){Ok(storage)=>storage,Err(error)=>{portable_runtime::show_startup_error(&error);return;}};
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, arguments, _| {
            let paths = files::launch_paths(arguments.into_iter());
            if !paths.is_empty() {
                app.state::<files::FileState>().pending.lock().unwrap().extend(paths);
                let _ = app.emit("open-documents", ());
            }
            startup::focus_existing(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(activity::plugin())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(files::FileState::with_launch_paths(files::launch_paths(std::env::args())))
        .manage(pdf::PdfState::default())
        .manage(folders::FolderState::default())
        .manage(startup::StartupState::default())
        .manage(diagram_cache::DiagramCacheState::default())
        .manage(storage)
        .setup(|app|{activity::started(app)?;startup::install_watchdog(app)})
        .on_window_event(startup::on_window_event)
        .invoke_handler(tauri::generate_handler![
            files::read_document, files::write_text, files::read_image,
            files::relative_document_path, files::load_workspace, files::save_workspace,
            files::take_launch_paths, files::open_external,
            files::load_startup_data, diagram_cache::save_diagram_cache,
            files::create_managed_document,files::rename_managed_document,
            portable_runtime::save_preferences,portable_runtime::startup_theme,portable_runtime::default_save_path,portable_runtime::open_storage_folder,
            activity::app_event,
            presets::list_presets,presets::read_preset,
            file_association::markdown_association_status, file_association::register_markdown_association,
            file_association::unregister_markdown_association, file_association::open_markdown_default_apps,
            file_association::clear_markdown_open_with_history, file_association::clear_legacy_markdown_open_with_apps,
            folders::open_folder, folders::list_folder,
            pdf::export_pdf, pdf::pdf_job, pdf::pdf_ready, pdf::pdf_failed,
            startup::show_startup, startup::finish_startup, startup::splash_ready, startup::splash_painted,
            startup::startup_editor_ready, startup::dismiss_splash, startup::fail_startup,
            startup::retry_startup, startup::continue_startup, startup::cancel_startup, startup::drag_splash,
        ])
        .build(context)
        .expect("Unable to launch Markdown Desk")
        .run(|app,event|{if matches!(event,tauri::RunEvent::Exit){activity::stopped(app);}});
}
