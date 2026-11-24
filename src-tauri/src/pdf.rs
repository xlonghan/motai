use crate::files::{atomic_write, ensure_main};
use lopdf::{Dictionary, Document, Object, ObjectId, StringFormat, dictionary};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}}, time::Duration};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;

type Completion = Arc<Mutex<Option<oneshot::Sender<Result<(), String>>>>>;

pub struct Job {
    html: String,
    options: PdfOptions,
    raw_path: PathBuf,
    completion: Completion,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct PdfOptions { paper: String, landscape: bool }
impl Default for PdfOptions { fn default() -> Self { Self {paper:"A4".into(),landscape:false} } }
impl PdfOptions { fn dimensions(&self) -> (f64,f64) { if self.paper=="Letter" {(215.9,279.4)} else {(210.0,297.0)} } }

#[derive(Default)]
pub struct PdfState {
    jobs: Mutex<HashMap<String, Job>>,
    next_job: AtomicU64,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Heading {
    id: String,
    text: String,
    level: u8,
}

fn store_destination(result: &mut HashMap<Vec<u8>, Object>, name: &[u8], value: Object) {
    result.insert(name.to_vec(), value.clone());
    if let Ok(name) = std::str::from_utf8(name) {
        let name = name.trim_start_matches('/');
        result.insert(name.as_bytes().to_vec(), value.clone());
        result.insert(crate::files::decode_source(name).into_bytes(), value);
    }
}

fn collect_destinations(document: &Document, object: &Object, result: &mut HashMap<Vec<u8>, Object>, depth: u8) {
    if depth > 20 { return; }
    let object = match object { Object::Reference(id) => match document.get_object(*id) { Ok(value) => value, Err(_) => return }, value => value };
    let Ok(tree) = object.as_dict() else { return; };
    if let Ok(Object::Array(kids)) = tree.get(b"Kids") {
        for kid in kids { collect_destinations(document, kid, result, depth + 1); }
    }
    if let Ok(Object::Array(names)) = tree.get(b"Names") {
        for pair in names.chunks_exact(2) {
            if let Ok(name) = pair[0].as_str() { store_destination(result, name, pair[1].clone()); }
        }
    }
}

fn pdf_title(text: &str) -> Object {
    let mut bytes = vec![0xfe, 0xff];
    for unit in text.encode_utf16() { bytes.extend(unit.to_be_bytes()); }
    Object::String(bytes, StringFormat::Hexadecimal)
}

fn add_outline(path: &PathBuf, headings: &[Heading]) -> Result<Vec<u8>, String> {
    let mut document = Document::load(path).map_err(|error| format!("PDF 读取失败：{error}"))?;
    let first_page = *document.get_pages().first_key_value().ok_or("PDF 没有页面")?.1;
    let mut destinations = HashMap::new();
    if let Ok(catalog) = document.catalog() {
        if let Ok(names) = catalog.get_deref(b"Names", &document).and_then(Object::as_dict) {
            if let Ok(tree) = names.get(b"Dests") { collect_destinations(&document, tree, &mut destinations, 0); }
        }
        if let Ok(legacy) = catalog.get_deref(b"Dests", &document).and_then(Object::as_dict) {
            for (name, value) in legacy.iter() { store_destination(&mut destinations, name, value.clone()); }
        }
    }
    let root = document.new_object_id();
    let ids: Vec<ObjectId> = headings.iter().map(|_| document.new_object_id()).collect();
    for (index, heading) in headings.iter().enumerate() {
        let encoded = heading.id.as_bytes();
        let decoded = crate::files::decode_source(&heading.id);
        let destination = destinations.get(encoded).or_else(|| destinations.get(decoded.as_bytes())).cloned();
        let target = if let Some(destination) = destination {
            let value = match &destination { Object::Reference(id) => document.get_object(*id).unwrap_or(&destination), value => value };
            if let Ok(dictionary) = value.as_dict() { dictionary.get(b"D").cloned().unwrap_or(destination) } else { destination }
        } else {
            Object::Array(vec![Object::Reference(first_page), Object::Name(b"Fit".to_vec())])
        };
        let mut item = dictionary! { "Title" => pdf_title(&heading.text), "Parent" => root, "Dest" => target };
        if index > 0 { item.set("Prev", ids[index - 1]); }
        if index + 1 < ids.len() { item.set("Next", ids[index + 1]); }
        document.objects.insert(ids[index], Object::Dictionary(item));
    }
    if !ids.is_empty() {
        let outline: Dictionary = dictionary! { "Type" => "Outlines", "First" => ids[0], "Last" => *ids.last().unwrap(), "Count" => ids.len() as i64 };
        document.objects.insert(root, Object::Dictionary(outline));
        let catalog_id = document.trailer.get(b"Root").and_then(Object::as_reference).map_err(|error| error.to_string())?;
        document.get_object_mut(catalog_id).and_then(Object::as_dict_mut).map_err(|error| error.to_string())?.set("Outlines", root);
    }
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).map_err(|error| error.to_string())?;
    Ok(bytes)
}

#[tauri::command]
pub async fn export_pdf(app: AppHandle, window: WebviewWindow, html: String, path: String, headings: Vec<Heading>, options: Option<PdfOptions>) -> Result<String, String> {
    ensure_main(&window)?;
    let operation=crate::activity::Operation::new("pdf_export",false);
    let options = options.unwrap_or_default();
    if !["A4","Letter"].contains(&options.paper.as_str()) { return Err("不支持的纸张格式".into()); }
    if !path.to_ascii_lowercase().ends_with(".pdf") { return Err("请选择 .pdf 文件名".into()); }
    if html.len() > 30 * 1024 * 1024 { return Err("文档与图片合计不能超过 30 MB".into()); }
    let id = {
        let state = app.state::<PdfState>();
        if !state.jobs.lock().map_err(|error| error.to_string())?.is_empty() { return Err("另一个 PDF 正在生成，请稍后再试".into()); }
        format!("{}-{}", std::process::id(), state.next_job.fetch_add(1, Ordering::Relaxed))
    };
    let directory = app.path().app_cache_dir().map_err(|error|error.to_string())?.join("pdf-jobs");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let raw_path = directory.join(format!("{id}.pdf"));
    let (sender, receiver) = oneshot::channel();
    app.state::<PdfState>().jobs.lock().map_err(|error| error.to_string())?.insert(id.clone(), Job { html, options, raw_path: raw_path.clone(), completion: Arc::new(Mutex::new(Some(sender))) });
    let label = format!("pdf-{id}");
    let url = format!("pdf.html?job={id}");
    let build = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("PDF export").visible(false).inner_size(960.0, 800.0).skip_taskbar(true).build();
    if let Err(error) = build {
        app.state::<PdfState>().jobs.lock().unwrap().remove(&id);
        return Err(format!("无法创建 PDF 渲染窗口：{error}"));
    }
    let result = match tokio::time::timeout(Duration::from_secs(60), receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("PDF 渲染中断".into()),
        Err(_) => Err("PDF 生成超时，请缩小图片或检查文档后重试".into()),
    };
    if let Some(window) = app.get_webview_window(&label) { let _ = window.destroy(); }
    app.state::<PdfState>().jobs.lock().unwrap().remove(&id);
    let result = result.and_then(|_| {
        let bytes = add_outline(&raw_path, &headings)?;
        atomic_write(&PathBuf::from(&path), &bytes)?;
        Ok(path)
    });
    let _ = fs::remove_file(&raw_path);
    operation.finish(result)
}

#[tauri::command]
pub fn pdf_job(app: AppHandle, window: WebviewWindow, id: String) -> Result<String, String> {
    if window.label() != format!("pdf-{id}") { return Err("无效的 PDF 渲染窗口".into()); }
    app.state::<PdfState>().jobs.lock().map_err(|error| error.to_string())?.get(&id).map(|job| job.html.clone()).ok_or("PDF 任务已结束".into())
}

fn complete(completion: &Completion, result: Result<(), String>) {
    if let Ok(mut sender) = completion.lock() { if let Some(sender) = sender.take() { let _ = sender.send(result); } }
}

#[tauri::command]
pub fn pdf_failed(app: AppHandle, window: WebviewWindow, id: String, message: String) -> Result<(), String> {
    if window.label() != format!("pdf-{id}") { return Err("无效的渲染窗口".into()); }
    if let Some(job) = app.state::<PdfState>().jobs.lock().unwrap().get(&id) { complete(&job.completion, Err(message)); }
    Ok(())
}

#[tauri::command]
pub fn pdf_ready(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    if window.label() != format!("pdf-{id}") { return Err("无效的渲染窗口".into()); }
    let (path, completion, options) = {
        let state = app.state::<PdfState>();
        let jobs = state.jobs.lock().map_err(|error| error.to_string())?;
        let job = jobs.get(&id).ok_or("PDF 任务已结束")?;
        (job.raw_path.clone(), job.completion.clone(), job.options.clone())
    };
    #[cfg(windows)]
    window.with_webview(move |webview| {
        use webview2_com::{Microsoft::Web::WebView2::Win32::{ICoreWebView2_7, ICoreWebView2Environment6, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT}, PrintToPdfCompletedHandler};
        use windows::core::{Interface, PCWSTR};
        let result = (|| -> windows::core::Result<()> {
            unsafe {
                let core: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
                let environment: ICoreWebView2Environment6 = webview.environment().cast()?;
                let settings = environment.CreatePrintSettings()?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                let (width,height) = options.dimensions();
                settings.SetPageWidth(width / 25.4)?;
                settings.SetPageHeight(height / 25.4)?;
                settings.SetOrientation(if options.landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
                settings.SetMarginTop(0.0)?;
                settings.SetMarginBottom(0.0)?;
                settings.SetMarginLeft(0.0)?;
                settings.SetMarginRight(0.0)?;
                let callback_completion = completion.clone();
                let callback = PrintToPdfCompletedHandler::create(Box::new(move |status, success| {
                    complete(&callback_completion, if status.is_ok() && success { Ok(()) } else { Err(format!("WebView2 PDF 导出失败：{status:?}")) });
                    Ok(())
                }));
                let encoded: Vec<u16> = path.to_string_lossy().encode_utf16().chain(Some(0)).collect();
                core.PrintToPdf(PCWSTR(encoded.as_ptr()), &settings, &callback)?;
            }
            Ok(())
        })();
        if let Err(error) = result { complete(&completion, Err(error.to_string())); }
    }).map_err(|error| error.to_string())?;
    #[cfg(not(windows))]
    complete(&completion, Err("当前版本仅支持 Windows 的 PDF 原生导出".into()));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::Stream;

    #[test]
    fn unicode_bookmarks_preserve_exact_section_destinations() {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let content = document.add_object(Stream::new(Dictionary::new(), Vec::new()));
        let first = document.add_object(dictionary! {"Type" => "Page", "Parent" => pages_id, "MediaBox" => vec![0.into(),0.into(),595.into(),842.into()], "Contents" => content});
        let second = document.add_object(dictionary! {"Type" => "Page", "Parent" => pages_id, "MediaBox" => vec![0.into(),0.into(),595.into(),842.into()], "Contents" => content});
        document.objects.insert(pages_id, dictionary! {"Type" => "Pages", "Kids" => vec![Object::Reference(first),Object::Reference(second)], "Count" => 2}.into());
        let destination = Object::Array(vec![second.into(), Object::Name(b"XYZ".to_vec()), 0.into(), 600.into(), Object::Null]);
        let tree = document.add_object(dictionary! {"Names" => vec![Object::string_literal("chapter-two"), destination]});
        let names = document.add_object(dictionary! {"Dests" => tree});
        let legacy = document.add_object(dictionary! {"chapter-%25E4%25B8%25AD" => Object::Array(vec![second.into(), Object::Name(b"Fit".to_vec())])});
        let catalog = document.add_object(dictionary! {"Type" => "Catalog", "Pages" => pages_id, "Names" => names, "Dests" => legacy});
        document.trailer.set("Root", catalog);
        let path = std::env::temp_dir().join(format!("markdown-desk-outline-test-{}.pdf", std::process::id()));
        document.save(&path).unwrap();
        let result = add_outline(&path, &[
            Heading {id:"title".into(), text:"中文文档".into(), level:1},
            Heading {id:"chapter-two".into(), text:"第二章".into(), level:2},
            Heading {id:"chapter-%E4%B8%AD".into(), text:"中文锚点".into(), level:2},
        ]).unwrap();
        let result = Document::load_mem(&result).unwrap();
        let outline = result.catalog().unwrap().get_deref(b"Outlines", &result).unwrap().as_dict().unwrap();
        let first_item = outline.get_deref(b"First", &result).unwrap().as_dict().unwrap();
        assert!(first_item.get(b"Title").unwrap().as_str().unwrap().starts_with(&[0xfe,0xff]));
        let next = first_item.get_deref(b"Next", &result).unwrap().as_dict().unwrap();
        let actual = next.get(b"Dest").unwrap().as_array().unwrap();
        assert_eq!(actual[0].as_reference().unwrap(), second);
        assert_eq!(actual[3].as_i64().unwrap(), 600);
        let legacy_item = next.get_deref(b"Next", &result).unwrap().as_dict().unwrap();
        assert_eq!(legacy_item.get(b"Dest").unwrap().as_array().unwrap()[0].as_reference().unwrap(), second);
        assert_eq!(result.get_pages().len(), 2);
        fs::remove_file(path).unwrap();
    }
}
