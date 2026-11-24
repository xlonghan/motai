#[path = "../src/files.rs"] mod files;
#[path = "../src/diagram_cache.rs"] mod diagram_cache;
#[path = "../src/pdf.rs"] mod pdf;
#[path = "../src/portable.rs"] mod portable;
#[path = "../src/portable_runtime.rs"] mod portable_runtime;
#[path = "../src/activity.rs"] mod activity;
#[path = "../src/presets.rs"] mod presets;

use tauri::Manager;

fn main() {
    let mut context=tauri::generate_context!();
    let storage=portable_runtime::configure(&mut context).expect("Portable verification directory unavailable");
    let arguments: Vec<String> = std::env::args().collect();
    assert_eq!(arguments.len(), 4, "Expected HTML, PDF and heading JSON paths");
    let html = std::fs::read_to_string(&arguments[1]).unwrap();
    let output = arguments[2].clone();
    let headings: Vec<pdf::Heading> = serde_json::from_str(&std::fs::read_to_string(&arguments[3]).unwrap()).unwrap();
    tauri::Builder::default()
        .manage(storage)
        .manage(files::FileState::default())
        .manage(pdf::PdfState::default())
        .invoke_handler(tauri::generate_handler![
            files::load_workspace, files::save_workspace, files::take_launch_paths,
            pdf::pdf_job, pdf::pdf_ready, pdf::pdf_failed,
        ])
        .setup(move |application| {
            let handle = application.handle().clone();
            let window = application.get_webview_window("main").unwrap();
            window.hide()?;
            tauri::async_runtime::spawn(async move {
                let result = pdf::export_pdf(handle.clone(), window, html, output, headings, None).await;
                println!("NATIVE_PDF_RESULT={result:?}");
                handle.exit(if result.is_ok() { 0 } else { 1 });
            });
            Ok(())
        })
        .run(context)
        .expect("Native PDF check failed to start");
}
