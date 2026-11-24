use std::{io::Write, sync::Mutex, time::{Duration, Instant}};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State, Theme, WebviewWindow, Window, WindowEvent, window::Color};

#[derive(Default)]
struct Flow {
    attempt: u64,
    complete: bool,
    editor_ready: bool,
    finishing: bool,
    splash_ready: bool,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    attempt: u64,
    complete: bool,
    can_continue: bool,
    error: Option<String>,
}

pub struct StartupState { flow: Mutex<Flow>, started: Instant }
impl Default for StartupState {
    fn default() -> Self { Self { flow: Mutex::new(Flow::default()), started: Instant::now() } }
}
impl StartupState {
    fn change<T>(&self, operation: impl FnOnce(&mut Flow) -> T) -> T {
        operation(&mut self.flow.lock().unwrap_or_else(|error| error.into_inner()))
    }
    fn begin(&self) -> u64 {
        self.change(|flow| { flow.attempt += 1; flow.complete = false; flow.editor_ready = false; flow.finishing = false; flow.error = None; flow.attempt })
    }
    fn current(&self, attempt: u64) -> bool { self.change(|flow| flow.attempt == attempt) }
    fn complete(&self) -> bool { self.change(|flow| flow.complete) }
    fn splash_ready(&self) -> bool { self.change(|flow| flow.splash_ready) }
    fn mark_editor_ready(&self, attempt: u64) -> bool {
        self.change(|flow| { if flow.attempt != attempt || flow.complete { return false; } flow.editor_ready = true; true })
    }
    fn mark_complete(&self, attempt: u64) -> bool {
        self.change(|flow| { if flow.attempt != attempt || flow.error.is_some() { return false; } flow.complete = true; true })
    }
    fn fail(&self, attempt: u64, message: String) -> bool {
        self.change(|flow| { if flow.attempt != attempt || flow.complete { return false; } flow.error = Some(message); true })
    }
    fn status(&self) -> StartupStatus {
        self.change(|flow| StartupStatus { attempt: flow.attempt, complete: flow.complete, can_continue: flow.editor_ready && !flow.finishing && flow.error.is_none() && !flow.complete, error: flow.error.clone() })
    }
    fn trace(&self, window: &WebviewWindow, stage: &str) {
        log::debug!("startup stage={stage} window={} elapsed_ms={}",window.label(),self.started.elapsed().as_millis());
        if let Some(path) = std::env::var_os("MARKDOWN_DESK_STARTUP_TRACE") {
            if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(file, "{}", serde_json::json!({"stage":stage,"window":window.label(),"elapsedMs":self.started.elapsed().as_millis(),"visible":window.is_visible().unwrap_or(false),"complete":self.complete()}));
            }
        }
    }
}

fn ensure_splash(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "splash" { Ok(()) } else { Err("此操作仅允许在启动窗口中执行".into()) }
}
fn reveal(window: &WebviewWindow, focus: bool) -> Result<(), String> {
    if !window.is_visible().unwrap_or(false) { window.show().map_err(|error| error.to_string())?; }
    if focus { let _ = window.set_focus(); }
    Ok(())
}
fn apply_main_theme(window: &WebviewWindow, theme: &str) {
    let light = theme == "light";
    let _ = window.set_theme(Some(if light { Theme::Light } else { Theme::Dark }));
    let _ = window.set_background_color(Some(if light { Color(241, 241, 241, 255) } else { Color(32, 32, 32, 255) }));
}
fn send_status(app: &AppHandle) { let _ = app.emit_to("splash", "startup-status", app.state::<StartupState>().status()); }
fn destroy_splash(app: &AppHandle) { if let Some(splash) = app.get_webview_window("splash") { let _ = splash.destroy(); } }

pub fn focus_existing(app: &AppHandle) {
    let Some(state) = app.try_state::<StartupState>() else { return; };
    let target = app.get_webview_window("main").filter(|main| state.complete() || main.is_visible().unwrap_or(false))
        .or_else(|| app.get_webview_window("splash").filter(|_| state.splash_ready()));
    if let Some(window) = target { let _ = window.unminimize(); let _ = reveal(&window, true); }
}

#[tauri::command]
pub fn splash_ready(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>, theme: String) -> Result<StartupStatus, String> {
    ensure_splash(&window)?;
    if state.complete() { let _ = window.destroy(); return Ok(state.status()); }
    state.change(|flow| flow.splash_ready = true);
    let _ = window.set_theme(Some(if theme == "light" { Theme::Light } else { Theme::Dark }));
    let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
    let _ = window.set_zoom(1.0);
    state.trace(&window, "splash-ready-before-show");
    reveal(&window, true)?;
    state.trace(&window, "splash-presented");
    send_status(&app);
    Ok(state.status())
}

#[tauri::command]
pub fn splash_painted(window: WebviewWindow, state: State<'_, StartupState>) -> Result<(), String> {
    ensure_splash(&window)?; state.trace(&window, "splash-painted"); Ok(())
}

#[tauri::command]
pub async fn show_startup(app: AppHandle, window: WebviewWindow, theme: String) -> Result<u64, String> {
    crate::files::ensure_main(&window)?;
    let attempt = app.state::<StartupState>().begin();
    apply_main_theme(&window, &theme);
    let _ = window.set_zoom(1.0);
    // Splash presentation and editor loading are independent. Readiness still
    // gates the main window, but a splash paint never gates its module loading.
    send_status(&app);
    Ok(attempt)
}

#[tauri::command]
pub fn startup_editor_ready(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>, attempt: u64) -> Result<(), String> {
    crate::files::ensure_main(&window)?;
    if state.mark_editor_ready(attempt) { send_status(&app); }
    Ok(())
}

#[tauri::command]
pub async fn finish_startup(app: AppHandle, window: WebviewWindow, theme: String, attempt: u64, timings: Option<serde_json::Value>) -> Result<(), String> {
    crate::files::ensure_main(&window)?;
    if !app.state::<StartupState>().current(attempt) { return Ok(()); }
    app.state::<StartupState>().change(|flow| flow.finishing = true);
    send_status(&app);
    // Optional bounded QA hold lets visual tests inspect the real native splash.
    if std::env::var_os("MARKDOWN_DESK_STARTUP_TRACE").is_some() {
        if let Ok(value) = std::env::var("MARKDOWN_DESK_STARTUP_QA_HOLD_MS") {
            if let Ok(ms) = value.parse::<u64>() { tokio::time::sleep(Duration::from_millis(ms.min(15000))).await; }
        }
    }
    let state = app.state::<StartupState>();
    if !state.current(attempt) || state.status().error.is_some() { return Ok(()); }
    if let (Some(path), Some(timings)) = (std::env::var_os("MARKDOWN_DESK_STARTUP_TRACE"), timings) {
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", serde_json::json!({"stage":"frontend-timings","timings":timings}));
        }
    }
    apply_main_theme(&window, &theme);
    let focus = app.get_webview_window("splash").map(|splash| splash.is_focused().unwrap_or(false)).unwrap_or(true);
    state.trace(&window, "frontend-ready-before-show");
    reveal(&window, focus)?;
    if !state.mark_complete(attempt) { return Ok(()); }
    log::info!("startup_ready attempt={attempt} elapsed_ms={}",state.started.elapsed().as_millis());
    app.state::<crate::files::FileState>().finish_startup();
    state.trace(&window, "frontend-ready-presented");
    send_status(&app);
    // Frontend dismisses after a main-window frame; this handles a lost reply.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let state = handle.state::<StartupState>();
        if state.current(attempt) && state.complete() { destroy_splash(&handle); }
    });
    Ok(())
}

#[tauri::command]
pub fn dismiss_splash(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>, attempt: u64) -> Result<(), String> {
    crate::files::ensure_main(&window)?;
    if state.current(attempt) && state.complete() { destroy_splash(&app); }
    Ok(())
}

#[tauri::command]
pub fn fail_startup(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>, attempt: u64, theme: String, message: String) -> Result<(), String> {
    crate::files::ensure_main(&window)?;
    if !state.fail(attempt, message) { return Ok(()); }
    log::error!("startup_failed attempt={attempt} elapsed_ms={}",state.started.elapsed().as_millis());
    send_status(&app);
    if state.splash_ready() {
        if let Some(splash) = app.get_webview_window("splash") { reveal(&splash, true)?; }
    } else { apply_main_theme(&window, &theme); reveal(&window, true)?; }
    Ok(())
}

#[tauri::command]
pub fn retry_startup(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>) -> Result<(), String> {
    ensure_splash(&window)?;
    if state.complete() { return Ok(()); }
    log::warn!("startup_retry");
    state.begin(); send_status(&app);
    if let Some(main) = app.get_webview_window("main") { main.eval("window.location.reload()").map_err(|error| error.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn continue_startup(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>) -> Result<(), String> {
    ensure_splash(&window)?;
    if state.status().can_continue {
        if let Some(main) = app.get_webview_window("main") { main.eval("window.markdownDeskBoot?.continueStartup()").map_err(|error| error.to_string())?; }
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_startup(app: AppHandle, window: WebviewWindow, state: State<'_, StartupState>) -> Result<(), String> {
    ensure_splash(&window)?;
    if !state.complete() { app.exit(0); }
    Ok(())
}

#[tauri::command]
pub fn drag_splash(window: WebviewWindow) -> Result<(), String> { ensure_splash(&window)?; window.start_dragging().map_err(|error| error.to_string()) }

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() == "splash" {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if !window.state::<StartupState>().complete() { api.prevent_close(); window.app_handle().exit(0); }
        }
    } else if window.label() == "main" && matches!(event, WindowEvent::Destroyed) { destroy_splash(window.app_handle()); }
}

pub fn install_watchdog(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(main) = app.get_webview_window("main") { app.state::<StartupState>().trace(&main, "created-hidden"); }
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(8)).await;
        let state = handle.state::<StartupState>();
        let visible = ["main", "splash"].iter().filter_map(|label| handle.get_webview_window(label)).any(|window| window.is_visible().unwrap_or(false));
        if !state.complete() && !visible {
            if state.splash_ready() { if let Some(splash) = handle.get_webview_window("splash") { let _ = reveal(&splash, true); } }
            else if let Some(main) = handle.get_webview_window("main") {
                state.trace(&main, "fallback-before-show"); let _ = reveal(&main, true); state.trace(&main, "fallback-presented");
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn splash_and_editor_readiness_do_not_complete_the_main_window() {
        let state = StartupState::default(); let attempt = state.begin();
        state.change(|flow| flow.splash_ready = true); state.mark_editor_ready(attempt);
        assert!(state.splash_ready()); assert!(state.status().can_continue); assert!(!state.complete());
        assert!(state.mark_complete(attempt)); assert!(state.complete()); assert!(!state.status().can_continue);
    }
    #[test]
    fn retry_rejects_late_completion_and_errors_from_the_previous_document() {
        let state = StartupState::default(); let old = state.begin(); let current = state.begin();
        assert!(!state.mark_complete(old)); assert!(!state.fail(old, "late error".into())); assert!(!state.mark_editor_ready(old));
        assert!(state.fail(current, "load failed".into())); assert!(!state.mark_complete(current));
        assert_eq!(state.status().error.as_deref(), Some("load failed"));
        let fresh = state.begin(); assert!(state.status().error.is_none()); assert!(state.mark_complete(fresh));
        assert!(!state.fail(fresh, "late error after ready".into()));
    }
}
