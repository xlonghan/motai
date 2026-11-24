use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationStatus {
    supported: bool,
    registered: bool,
    has_owned_registration: bool,
    is_default: bool,
    default_known: bool,
    default_handler_retained: bool,
    registered_elsewhere: bool,
    open_with_history: Vec<String>,
    default_executable: Option<String>,
    #[cfg(windows)]
    legacy_open_with_apps: Vec<crate::legacy_open_with::LegacyApplication>,
}

#[tauri::command]
pub fn markdown_association_status(window: WebviewWindow) -> Result<AssociationStatus, String> {
    crate::files::ensure_main(&window)?;
    platform::status()
}

#[tauri::command]
pub fn register_markdown_association(window: WebviewWindow) -> Result<AssociationStatus, String> {
    crate::files::ensure_main(&window)?;
    platform::register()
}

#[tauri::command]
pub fn unregister_markdown_association(window: WebviewWindow) -> Result<AssociationStatus, String> {
    crate::files::ensure_main(&window)?;
    platform::unregister()
}

#[tauri::command]
pub fn open_markdown_default_apps(window: WebviewWindow) -> Result<(), String> {
    crate::files::ensure_main(&window)?;
    platform::open_default_apps()
}

#[tauri::command]
pub fn clear_markdown_open_with_history(
    window: WebviewWindow,
    executable_names: Vec<String>,
) -> Result<AssociationStatus, String> {
    crate::files::ensure_main(&window)?;
    platform::clear_history(executable_names)
}

#[tauri::command]
pub fn clear_legacy_markdown_open_with_apps(
    window: WebviewWindow,
    executable_names: Vec<String>,
) -> Result<AssociationStatus, String> {
    crate::files::ensure_main(&window)?;
    platform::clear_legacy_apps(executable_names)
}

#[cfg(not(windows))]
mod platform {
    use super::AssociationStatus;

    pub fn status() -> Result<AssociationStatus, String> {
        Ok(AssociationStatus::default())
    }

    pub fn register() -> Result<AssociationStatus, String> {
        Err("此平台不支持 Windows 文件关联".into())
    }

    pub fn unregister() -> Result<AssociationStatus, String> {
        register()
    }

    pub fn open_default_apps() -> Result<(), String> {
        Err("此平台不支持 Windows 默认应用设置".into())
    }

    pub fn clear_history(_: Vec<String>) -> Result<AssociationStatus, String> {
        register()
    }

    pub fn clear_legacy_apps(_: Vec<String>) -> Result<AssociationStatus, String> {
        register()
    }
}

#[cfg(windows)]
mod platform {
    use super::AssociationStatus;
    use std::{borrow::Cow, io, path::Path, sync::Mutex};
    use windows::{
        Win32::{
            Foundation::{ERROR_NO_ASSOCIATION, RPC_E_CHANGED_MODE},
            System::Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance,
                CoInitializeEx, CoTaskMemFree, CoUninitialize,
            },
            UI::{
                Shell::{
                    AL_EFFECTIVE, ASSOCF_NONE, ASSOCSTR_EXECUTABLE, AT_FILEEXTENSION,
                    ApplicationAssociationRegistration, AssocQueryStringW,
                    IApplicationAssociationRegistration, SHChangeNotify, SHCNE_ASSOCCHANGED,
                    SHCNF_IDLIST, ShellExecuteW,
                },
                WindowsAndMessaging::SW_SHOWNORMAL,
            },
        },
        core::{HRESULT, PCWSTR, PWSTR, w},
    };
    use winreg::{
        RegKey, RegValue,
        enums::{HKEY_CURRENT_USER, KEY_CREATE_SUB_KEY, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_NONE, REG_SZ},
        types::FromRegValue,
    };

    const EXTENSION: &str = ".md";
    const PROG_ID_PREFIX: &str = "MarkdownDesk.MD.";
    const APP_ROOT: &str = r"Software\MarkdownDesk\FileAssociations";
    const OPEN_WITH: &str = r"Software\Classes\.md\OpenWithProgids";
    const EXPLORER_HISTORY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\OpenWithList";
    const MRU_LIST: &str = "MRUList";
    const REGISTERED_APPS: &str = r"Software\RegisteredApplications";
    const OWNER: &str = "MarkdownDeskExecutable";
    const DEFAULT_APPS: &str = "ms-settings:defaultapps";
    static ASSOCIATION_LOCK: Mutex<()> = Mutex::new(());

    struct Registration {
        executable: String,
        prog_id: String,
        application_name: String,
        program_key: String,
        app_key: String,
        capabilities_key: String,
    }

    impl Registration {
        fn current() -> Result<Self, String> {
            let executable = std::env::current_exe().and_then(|path| path.canonicalize())
                .map_err(|error| format!("无法确定墨台程序路径：{error}"))?;
            let executable = display_path(&executable)?;
            Ok(Self::for_path(executable))
        }

        fn for_path(executable: String) -> Self {
            // Windows directories can distinguish two names that differ only in case.
            let hash = crate::portable::stable_hash(&executable);
            let prog_id = format!("{PROG_ID_PREFIX}{hash:016x}");
            let application_name = format!("墨台 ({hash:016x})");
            let program_key = format!(r"Software\Classes\{prog_id}");
            let app_key = format!(r"{APP_ROOT}\{prog_id}");
            let capabilities_key = format!(r"{app_key}\Capabilities");
            Self { executable, prog_id, application_name, program_key, app_key, capabilities_key }
        }

        fn command(&self) -> String {
            format!(r#""{}" "%1""#, self.executable)
        }

        fn status(&self, user: &RegKey) -> Result<AssociationStatus, String> {
            let effective = EffectiveAssociation::query().ok();
            self.status_with_effective(user, effective.as_ref())
        }

        fn status_with_effective(
            &self,
            user: &RegKey,
            effective: Option<&EffectiveAssociation>,
        ) -> Result<AssociationStatus, String> {
            let registered_app = read_string(user, REGISTERED_APPS, &self.application_name)?;
            let command_key = format!(r"{}\shell\open\command", self.program_key);
            let file_associations = format!(r"{}\FileAssociations", self.capabilities_key);
            let open_with = optional(user.open_subkey_with_flags(OPEN_WITH, KEY_QUERY_VALUE)).map_err(registry_error)?;
            let advertised = match &open_with {
                Some(key) => optional(key.get_raw_value(&self.prog_id)).map_err(registry_error)?.is_some(),
                None => false,
            };
            let program_owned = read_string(user, &self.program_key, OWNER)?.as_deref() == Some(self.executable.as_str());
            let app_owned = read_string(user, &self.app_key, OWNER)?.as_deref() == Some(self.executable.as_str());
            let command_matches = program_owned
                && matches_text(read_string(user, &command_key, "")?.as_deref(), &self.command());
            let registered = advertised
                && matches_text(registered_app.as_deref(), &self.capabilities_key)
                && command_matches
                && app_owned
                && matches_text(read_string(user, &file_associations, EXTENSION)?.as_deref(), &self.prog_id);
            let mut registered_elsewhere = false;
            if let Some(open_with) = open_with {
                for entry in open_with.enum_values() {
                    let (name, _) = entry.map_err(registry_error)?;
                    if name.starts_with(PROG_ID_PREFIX) && !name.eq_ignore_ascii_case(&self.prog_id) {
                        let program_key = format!(r"Software\Classes\{name}");
                        if read_string(user, &program_key, OWNER)?.is_some() {
                            registered_elsewhere = true;
                            break;
                        }
                    }
                }
            }
            Ok(AssociationStatus {
                supported: true,
                registered,
                has_owned_registration: program_owned || app_owned,
                is_default: effective.is_some_and(|association| self.is_default(association)),
                default_known: effective.is_some(),
                default_handler_retained: command_matches && !advertised && !app_owned
                    && registered_app.is_none() && self.requires_program_key(effective),
                registered_elsewhere,
                open_with_history: visible_history(user)?,
                default_executable: effective.and_then(|association| association.markdown_executable_name(user)),
                legacy_open_with_apps: crate::legacy_open_with::candidates(
                    user, Path::new(&self.executable), registered && effective.is_some(),
                ).unwrap_or_default(),
            })
        }

        fn is_default(&self, effective: &EffectiveAssociation) -> bool {
            // Windows can also remember an executable selected through “Open with”.
            // Compare the executable, since different portable copies may share a file name.
            matches_text(effective.prog_id.as_deref(), &self.prog_id)
                || effective.executable.as_deref() == Some(self.executable.as_str())
        }

        fn requires_program_key(&self, effective: Option<&EffectiveAssociation>) -> bool {
            effective.is_none_or(|association| match association.prog_id.as_deref() {
                Some(prog_id) => prog_id.eq_ignore_ascii_case(&self.prog_id),
                None => association.executable.as_deref() == Some(self.executable.as_str()),
            })
        }
    }

    struct EffectiveAssociation {
        prog_id: Option<String>,
        executable: Option<String>,
    }

    impl EffectiveAssociation {
        fn query() -> Result<Self, String> {
            let prog_id = effective_prog_id()?;
            let executable = default_executable().map(|path| {
                Path::new(&path).canonicalize().ok()
                    .and_then(|path| display_path(&path).ok()).unwrap_or(path)
            });
            Ok(Self { prog_id, executable })
        }

        fn markdown_executable_name(&self, user: &RegKey) -> Option<String> {
            if let Some(prog_id) = self.prog_id.as_deref() {
                if let Some((namespace, name)) = prog_id.split_once('\\') {
                    if namespace.eq_ignore_ascii_case("Applications") && known_history_name(name) {
                        return Some(name.to_owned());
                    }
                }
                if let Some(suffix) = prog_id.to_ascii_lowercase().strip_prefix(&PROG_ID_PREFIX.to_ascii_lowercase()) {
                    if suffix.len() == 16 && suffix.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                        let program_key = format!(r"Software\Classes\{prog_id}");
                        let owner = read_string(user, &program_key, OWNER).ok().flatten();
                        if let Some(name) = owner.as_deref().and_then(executable_name).filter(|name| known_history_name(name)) {
                            return Some(name.to_owned());
                        }
                    }
                }
            }
            self.executable.as_deref().and_then(executable_name)
                .filter(|name| known_history_name(name)).map(String::from)
        }
    }

    fn executable_name(path: &str) -> Option<&str> {
        let path = Path::new(path);
        if !path.extension()?.to_str()?.eq_ignore_ascii_case("exe") {
            return None;
        }
        path.file_name()?.to_str()
    }

    fn known_history_name(name: &str) -> bool {
        let folded = name.to_ascii_lowercase();
        if matches!(folded.as_str(), "墨台.exe" | "墨台-关联修复.exe") {
            return true;
        }
        let Some(version) = folded.strip_prefix("墨台-v").and_then(|value| value.strip_suffix(".exe")) else {
            return false;
        };
        let mut components = version.split('.');
        (0..3).all(|_| components.next().is_some_and(|part| {
            !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())
        })) && components.next().is_none()
    }

    struct HistorySlot {
        letter: String,
        executable: String,
    }

    fn history_slots(key: &RegKey) -> Result<Vec<HistorySlot>, String> {
        let mut slots = Vec::new();
        for record in key.enum_values() {
            let (letter, value) = record.map_err(registry_error)?;
            if letter.len() != 1 || !letter.as_bytes()[0].is_ascii_alphabetic() || value.vtype != REG_SZ {
                continue;
            }
            let executable = String::from_reg_value(&value).map_err(registry_error)?;
            if known_history_name(&executable) {
                slots.push(HistorySlot { letter, executable });
            }
        }
        Ok(slots)
    }

    fn visible_history(user: &RegKey) -> Result<Vec<String>, String> {
        let Some(key) = optional(user.open_subkey_with_flags(EXPLORER_HISTORY, KEY_QUERY_VALUE)).map_err(registry_error)? else {
            return Ok(Vec::new());
        };
        let mut names: Vec<String> = history_slots(&key)?.into_iter()
            .map(|slot| slot.executable)
            .collect();
        names.sort_by_key(|name| name.to_ascii_lowercase());
        names.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
        Ok(names)
    }

    fn read_mru_list(key: &RegKey) -> io::Result<Option<String>> {
        let Some(value) = optional(key.get_raw_value(MRU_LIST))? else { return Ok(None); };
        if value.vtype != REG_SZ {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "Windows 打开方式的历史顺序格式不受支持"));
        }
        String::from_reg_value(&value).map(Some)
    }

    fn remove_history_entries(user: &RegKey, selected: &[String]) -> Result<bool, String> {
        if selected.is_empty() {
            return Ok(false);
        }
        if selected.iter().any(|name| !known_history_name(name)) {
            return Err("请选择可清理的墨台 .md 历史记录".into());
        }
        let Some(key) = optional(user.open_subkey_with_flags(EXPLORER_HISTORY, KEY_QUERY_VALUE | KEY_SET_VALUE)).map_err(registry_error)? else {
            return Ok(false);
        };
        let slots = history_slots(&key)?;
        let mut requested = slots.into_iter().filter(|slot| {
            selected.iter().any(|name| name.eq_ignore_ascii_case(&slot.executable))
        }).peekable();
        if requested.peek().is_none() {
            return Ok(false);
        }
        read_mru_list(&key).map_err(registry_error)?;

        let mut removed = Vec::new();
        let deletion = (|| -> io::Result<()> {
            for slot in requested {
                let Some(value) = optional(key.get_raw_value(&slot.letter))? else { continue; };
                if value.vtype != REG_SZ || !String::from_reg_value(&value)?.eq_ignore_ascii_case(&slot.executable) {
                    continue;
                }
                if optional(key.delete_value(&slot.letter))?.is_some() {
                    removed.push(slot.letter);
                }
            }
            Ok(())
        })();
        // Explorer can change the ordering or reuse a letter while the window is open.
        // Update the latest ordering and keep any letter that now belongs to another entry.
        if !removed.is_empty() {
            let mut empty = Vec::new();
            for letter in &removed {
                if optional(key.get_raw_value(letter)).map_err(registry_error)?.is_none() {
                    empty.push(letter.as_bytes()[0].to_ascii_lowercase());
                }
            }
            if let Some(mru) = read_mru_list(&key).map_err(registry_error)? {
                let remaining: String = mru.chars().filter(|ch| {
                    !ch.is_ascii() || !empty.contains(&(*ch as u8).to_ascii_lowercase())
                }).collect();
                if remaining != mru {
                    key.set_value(MRU_LIST, &remaining).map_err(registry_error)?;
                }
            }
        }
        deletion.map_err(registry_error)?;
        Ok(!removed.is_empty())
    }

    fn display_path(path: &Path) -> Result<String, String> {
        let path = path.to_str().ok_or("墨台程序路径不是有效 Unicode")?;
        // Shell association strings generally use ordinary drive and UNC paths.
        // Preserve Windows extended-length syntax when a path needs it.
        if path.encode_utf16().count() >= 260 {
            return Ok(path.into());
        }
        if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
            return Ok(format!(r"\\{unc}"));
        }
        Ok(path.strip_prefix(r"\\?\").unwrap_or(path).into())
    }

    fn optional<T>(result: io::Result<T>) -> io::Result<Option<T>> {
        match result {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn registry_error(error: io::Error) -> String {
        format!("无法访问当前用户的 .md 文件关联：{error}")
    }

    fn matches_text(actual: Option<&str>, expected: &str) -> bool {
        actual.is_some_and(|value| value.to_lowercase() == expected.to_lowercase())
    }

    fn app_settings_url(application_name: &str) -> String {
        use std::fmt::Write;
        let mut url = format!("{DEFAULT_APPS}?registeredAppUser=");
        for byte in application_name.bytes() {
            if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
                url.push(char::from(byte));
            } else {
                write!(url, "%{byte:02X}").expect("writing to a String cannot fail");
            }
        }
        url
    }

    fn read_string(user: &RegKey, path: &str, name: &str) -> Result<Option<String>, String> {
        let Some(key) = optional(user.open_subkey_with_flags(path, KEY_QUERY_VALUE)).map_err(registry_error)? else { return Ok(None); };
        optional(key.get_value(name)).map_err(registry_error)
    }

    #[derive(PartialEq, Eq)]
    enum KeyOwner {
        Missing,
        Empty,
        Current,
    }

    fn key_owner(user: &RegKey, path: &str, executable: &str) -> Result<KeyOwner, String> {
        let Some(key) = optional(user.open_subkey_with_flags(path, KEY_QUERY_VALUE)).map_err(registry_error)? else { return Ok(KeyOwner::Missing); };
        let owner: Option<String> = optional(key.get_value(OWNER)).map_err(registry_error)?;
        if owner.as_deref() == Some(executable) {
            return Ok(KeyOwner::Current);
        }
        if owner.is_none() {
            let info = key.query_info().map_err(registry_error)?;
            if info.values == 0 && info.sub_keys == 0 {
                return Ok(KeyOwner::Empty);
            }
        }
        Err("已有不同来源的文件关联注册，无法覆盖或删除".into())
    }

    fn remove_value(user: &RegKey, path: &str, name: &str) -> io::Result<()> {
        if let Some(key) = optional(user.open_subkey_with_flags(path, KEY_SET_VALUE))? {
            optional(key.delete_value(name))?;
        }
        Ok(())
    }

    fn notify_shell() {
        unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
    }

    struct ComApartment(bool);
    impl Drop for ComApartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    fn effective_prog_id() -> Result<Option<String>, String> {
        let query_error = |error| format!("无法查询 Windows 的 .md 默认应用：{error}");
        unsafe {
            let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if initialized != RPC_E_CHANGED_MODE {
                initialized.ok().map_err(query_error)?;
            }
            let _apartment = ComApartment(initialized.is_ok());
            let associations: IApplicationAssociationRegistration =
                CoCreateInstance(&ApplicationAssociationRegistration, None, CLSCTX_INPROC_SERVER).map_err(query_error)?;
            match associations.QueryCurrentDefault(w!(".md"), AT_FILEEXTENSION, AL_EFFECTIVE) {
                Ok(value) => {
                    let prog_id = value.to_string();
                    CoTaskMemFree(Some(value.0.cast()));
                    prog_id.map(Some).map_err(|error| format!("无法读取 Windows 默认应用标识：{error}"))
                }
                Err(error) if error.code() == HRESULT::from_win32(ERROR_NO_ASSOCIATION.0) => Ok(None),
                Err(error) => Err(query_error(error)),
            }
        }
    }

    fn default_executable() -> Option<String> {
        let mut size = 0;
        unsafe {
            let query = AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_EXECUTABLE, w!(".md"), PCWSTR::null(), None, &mut size);
            if query.is_err() || size == 0 || size > 32_768 {
                return None;
            }
            let mut data = vec![0u16; size as usize];
            AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_EXECUTABLE, w!(".md"), PCWSTR::null(), Some(PWSTR(data.as_mut_ptr())), &mut size)
                .ok().ok()?;
            let end = data.iter().position(|&unit| unit == 0)?;
            String::from_utf16(&data[..end]).ok()
        }
    }

    pub fn status() -> Result<AssociationStatus, String> {
        let _lock = ASSOCIATION_LOCK.lock().map_err(|error| error.to_string())?;
        Registration::current()?.status(&RegKey::predef(HKEY_CURRENT_USER))
    }

    pub fn register() -> Result<AssociationStatus, String> {
        let _lock = ASSOCIATION_LOCK.lock().map_err(|error| error.to_string())?;
        let entry = Registration::current()?;
        let user = RegKey::predef(HKEY_CURRENT_USER);
        let result = write_registration(&user, &entry);
        notify_shell();
        result?;
        entry.status(&user)
    }

    fn write_registration(user: &RegKey, entry: &Registration) -> Result<(), String> {
        let program_owner = key_owner(user, &entry.program_key, &entry.executable)?;
        let app_owner = key_owner(user, &entry.app_key, &entry.executable)?;
        let published_app = read_string(user, REGISTERED_APPS, &entry.application_name)?;
        if published_app.is_some() && !matches_text(published_app.as_deref(), &entry.capabilities_key) {
            return Err("已有不同来源的应用注册，无法覆盖".into());
        }
        let open_with = optional(user.open_subkey_with_flags(OPEN_WITH, KEY_QUERY_VALUE)).map_err(registry_error)?;
        let had_open_with = match open_with {
            Some(key) => optional(key.get_raw_value(&entry.prog_id)).map_err(registry_error)?.is_some(),
            None => false,
        };
        if had_open_with && program_owner != KeyOwner::Current {
            return Err("已有不同来源的打开方式，无法覆盖".into());
        }
        if published_app.is_some() && app_owner != KeyOwner::Current {
            return Err("已有不同来源的应用注册，无法覆盖".into());
        }

        let mut phase = "写入 Markdown 文件类型";
        let result = (|| -> io::Result<()> {
            let marker = RegValue { bytes: Cow::Borrowed(&[]), vtype: REG_NONE };
            let (program, _) = user.create_subkey_with_flags(&entry.program_key, KEY_SET_VALUE | KEY_CREATE_SUB_KEY)?;
            program.set_value(OWNER, &entry.executable)?;
            program.set_value("", &"Markdown 文档")?;
            program.set_raw_value("AllowSilentDefaultTakeOver", &marker)?;
            let icon = format!(r#""{}",0"#, entry.executable);
            program.create_subkey_with_flags("DefaultIcon", KEY_SET_VALUE)?.0.set_value("", &icon)?;
            program.create_subkey_with_flags(r"shell\open\command", KEY_SET_VALUE)?.0.set_value("", &entry.command())?;

            phase = "写入墨台的默认应用信息";
            user.create_subkey_with_flags(&entry.app_key, KEY_SET_VALUE)?.0.set_value(OWNER, &entry.executable)?;
            let (capabilities, _) = user.create_subkey_with_flags(&entry.capabilities_key, KEY_SET_VALUE | KEY_CREATE_SUB_KEY)?;
            capabilities.set_value("ApplicationName", &entry.application_name)?;
            capabilities.set_value("ApplicationDescription", &format!("使用墨台打开 Markdown (.md) 文档。程序位置：{}", entry.executable))?;
            capabilities.set_value("ApplicationIcon", &icon)?;
            capabilities.create_subkey_with_flags("FileAssociations", KEY_SET_VALUE)?.0.set_value(EXTENSION, &entry.prog_id)?;

            phase = "添加到 .md 文件的打开方式";
            user.create_subkey_with_flags(OPEN_WITH, KEY_SET_VALUE)?.0.set_raw_value(&entry.prog_id, &marker)?;
            phase = "登记到 Windows 默认应用";
            user.create_subkey_with_flags(REGISTERED_APPS, KEY_SET_VALUE)?.0.set_value(&entry.application_name, &entry.capabilities_key)
        })();

        if let Err(error) = result {
            // Remove only new entries from a failed attempt. Existing registrations can be retried.
            if !had_open_with { let _ = remove_value(user, OPEN_WITH, &entry.prog_id); }
            if published_app.is_none() { let _ = remove_value(user, REGISTERED_APPS, &entry.application_name); }
            if app_owner == KeyOwner::Missing { let _ = user.delete_subkey_all(&entry.app_key); }
            if program_owner == KeyOwner::Missing { let _ = user.delete_subkey_all(&entry.program_key); }
            return Err(format!("{phase}失败：{error}"));
        }

        Ok(())
    }

    pub fn unregister() -> Result<AssociationStatus, String> {
        let _lock = ASSOCIATION_LOCK.lock().map_err(|error| error.to_string())?;
        let entry = Registration::current()?;
        let user = RegKey::predef(HKEY_CURRENT_USER);
        let effective = EffectiveAssociation::query().ok();
        let result = remove_registration(&user, &entry, effective.as_ref());
        notify_shell();
        result?;
        entry.status(&user)
    }

    pub fn clear_history(executable_names: Vec<String>) -> Result<AssociationStatus, String> {
        let _lock = ASSOCIATION_LOCK.lock().map_err(|error| error.to_string())?;
        let entry = Registration::current()?;
        let user = RegKey::predef(HKEY_CURRENT_USER);
        if remove_history_entries(&user, &executable_names)? {
            notify_shell();
        }
        entry.status(&user)
    }

    pub fn clear_legacy_apps(executable_names: Vec<String>) -> Result<AssociationStatus, String> {
        let _lock = ASSOCIATION_LOCK.lock().map_err(|error| error.to_string())?;
        let entry = Registration::current()?;
        let user = RegKey::predef(HKEY_CURRENT_USER);
        let status = entry.status(&user)?;
        if crate::legacy_open_with::remove(
            &user, Path::new(&entry.executable), status.registered && status.default_known, &executable_names,
        )? {
            notify_shell();
        }
        entry.status(&user)
    }

    fn remove_registration(
        user: &RegKey,
        entry: &Registration,
        effective: Option<&EffectiveAssociation>,
    ) -> Result<(), String> {
        let program_owned = key_owner(user, &entry.program_key, &entry.executable)? == KeyOwner::Current;
        let app_owned = key_owner(user, &entry.app_key, &entry.executable)? == KeyOwner::Current;
        let published_app = read_string(user, REGISTERED_APPS, &entry.application_name)?;
        if published_app.is_some() && !matches_text(published_app.as_deref(), &entry.capabilities_key) {
            return Err("已有不同来源的应用注册，无法删除".into());
        }
        let result = (|| -> io::Result<()> {
            if program_owned {
                remove_value(user, OPEN_WITH, &entry.prog_id)?;
            }
            if app_owned {
                remove_value(user, REGISTERED_APPS, &entry.application_name)?;
                optional(user.delete_subkey_all(&entry.app_key))?;
            }
            if program_owned && !entry.requires_program_key(effective) {
                optional(user.delete_subkey_all(&entry.program_key))?;
            }
            Ok(())
        })();
        result.map_err(registry_error)
    }

    pub fn open_default_apps() -> Result<(), String> {
        let user = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(entry) = Registration::current() {
            if let Ok(Some(registered)) = read_string(&user, REGISTERED_APPS, &entry.application_name) {
                if matches_text(Some(&registered), &entry.capabilities_key)
                    && launch_settings(&app_settings_url(&entry.application_name))
                {
                    return Ok(());
                }
            }
        }
        if launch_settings(DEFAULT_APPS) {
            Ok(())
        } else {
            Err("无法打开 Windows 默认应用设置".into())
        }
    }

    fn launch_settings(url: &str) -> bool {
        let utf16: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
        let result = unsafe { ShellExecuteW(None, w!("open"), PCWSTR(utf16.as_ptr()), None, None, SW_SHOWNORMAL) };
        result.0 as isize > 32
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::{fs, path::PathBuf, process, time::{SystemTime, UNIX_EPOCH}};

        struct TestHiveDirectory(PathBuf);
        impl TestHiveDirectory {
            fn load() -> (Self, RegKey) {
                let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
                let directory = std::env::temp_dir().join(format!("motai-association-{}-{nonce}", process::id()));
                fs::create_dir(&directory).unwrap();
                let directory = Self(directory);
                let user = RegKey::load_app_key(directory.0.join("association.hiv"), true).unwrap();
                (directory, user)
            }
        }

        impl Drop for TestHiveDirectory {
            fn drop(&mut self) {
                if let Ok(files) = fs::read_dir(&self.0) {
                    for file in files.flatten() {
                        let _ = fs::remove_file(file.path());
                    }
                }
                let _ = fs::remove_dir(&self.0);
            }
        }

        #[test]
        fn portable_copies_register_distinct_progid_and_open_command() {
            let first = Registration::for_path(r"C:\Apps\墨台.exe".into());
            let second = Registration::for_path(r"C:\Other Apps\墨台.exe".into());
            assert_ne!(first.prog_id, second.prog_id);
            assert_ne!(first.capabilities_key, second.capabilities_key);
            assert_ne!(first.application_name, second.application_name);
            assert_eq!(second.command(), r#""C:\Other Apps\墨台.exe" "%1""#);
            assert_ne!(Registration::for_path(r"C:\apps\墨台.exe".into()).prog_id, first.prog_id);
        }

        #[test]
        fn short_canonical_paths_use_normal_shell_path_syntax() {
            assert_eq!(display_path(Path::new(r"\\?\C:\Apps\墨台.exe")).unwrap(), r"C:\Apps\墨台.exe");
            assert_eq!(display_path(Path::new(r"\\?\UNC\server\share\墨台.exe")).unwrap(), r"\\server\share\墨台.exe");
        }

        #[test]
        fn settings_link_encodes_the_registered_application_name() {
            assert_eq!(app_settings_url("墨台 (abc)"), "ms-settings:defaultapps?registeredAppUser=%E5%A2%A8%E5%8F%B0%20%28abc%29");
        }

        #[test]
        fn private_hive_registers_and_removes_only_the_current_copy() {
            let (_directory, user) = TestHiveDirectory::load();
            let first = Registration::for_path(r"C:\First copy\墨台.exe".into());
            let second = Registration::for_path(r"C:\Second copy\墨台.exe".into());

            user.create_subkey(&first.program_key).unwrap(); // an empty key left by a failed registration
            let open_with = user.create_subkey(OPEN_WITH).unwrap().0;
            open_with.set_value("Unrelated.1", &"").unwrap();
            let apps = user.create_subkey(REGISTERED_APPS).unwrap().0;
            apps.set_value("Unrelated", &r"Software\Unrelated\Capabilities").unwrap();

            write_registration(&user, &first).unwrap();
            write_registration(&user, &first).unwrap(); // retry is idempotent
            write_registration(&user, &second).unwrap();
            assert_eq!(read_string(&user, &format!(r"{}\shell\open\command", first.program_key), "").unwrap(), Some(first.command()));
            let marker = open_with.get_raw_value(&first.prog_id).unwrap();
            assert_eq!(marker.vtype, REG_NONE);
            assert!(marker.bytes.is_empty());

            let other_default = EffectiveAssociation { prog_id: Some("Unrelated.1".into()), executable: None };
            remove_registration(&user, &first, Some(&other_default)).unwrap();
            remove_registration(&user, &first, Some(&other_default)).unwrap();
            assert!(read_string(&user, &first.program_key, OWNER).unwrap().is_none());
            assert!(read_string(&user, REGISTERED_APPS, &first.application_name).unwrap().is_none());
            assert!(optional(open_with.get_raw_value(&first.prog_id)).unwrap().is_none());
            assert!(open_with.get_raw_value(&second.prog_id).is_ok());
            assert!(open_with.get_raw_value("Unrelated.1").is_ok());
            assert!(read_string(&user, REGISTERED_APPS, "Unrelated").unwrap().is_some());

            let collision = user.create_subkey(&first.program_key).unwrap().0;
            collision.set_value("UnrelatedData", &"keep").unwrap();
            assert!(write_registration(&user, &first).is_err());
            assert!(remove_registration(&user, &first, Some(&other_default)).is_err());
            assert_eq!(collision.get_value::<String, _>("UnrelatedData").unwrap(), "keep");
        }

        #[test]
        fn private_hive_cleans_selected_markdown_history_without_touching_default() {
            let (_directory, user) = TestHiveDirectory::load();
            let history = user.create_subkey(EXPLORER_HISTORY).unwrap().0;
            for (letter, executable) in [
                ("a", "OtherApp.exe"),
                ("b", "墨台.exe"),
                ("c", "OtherEditor.exe"),
                ("d", "墨台-v0.5.0.exe"),
                ("e", "墨台-v0.6.1.exe"),
                ("f", "墨台-v0.5.0.EXE"),
                ("g", "墨台-v2.0.0.exe"),
            ] {
                history.set_value(letter, &executable).unwrap();
            }
            history.set_value(MRU_LIST, &"ebfgdac").unwrap();

            let other_history = user.create_subkey(EXPLORER_HISTORY.replace(r"\.md\", r"\.txt\")).unwrap().0;
            other_history.set_value("b", &"墨台.exe").unwrap();
            other_history.set_value(MRU_LIST, &"b").unwrap();
            let choice = user.create_subkey(EXPLORER_HISTORY.replace("OpenWithList", "UserChoice")).unwrap().0;
            let default_prog_id = r"Applications\墨台-v0.6.1.exe";
            choice.set_value("ProgId", &default_prog_id).unwrap();
            choice.set_value("Hash", &"fixture").unwrap();
            let default_command = user.create_subkey(format!(r"Software\Classes\{default_prog_id}\shell\open\command")).unwrap().0;
            default_command.set_value("", &r#""C:\Apps\墨台-v0.6.1.exe" "%1""#).unwrap();
            let original_choice = choice.get_raw_value("ProgId").unwrap();
            let original_hash = choice.get_raw_value("Hash").unwrap();
            let original_command = default_command.get_raw_value("").unwrap();

            let effective = EffectiveAssociation {
                prog_id: Some(default_prog_id.into()),
                executable: Some(r"C:\Apps\墨台-v0.6.1.exe".into()),
            };
            let current = Registration::for_path(r"C:\Apps\墨台.exe".into());
            let known = current.status_with_effective(&user, Some(&effective)).unwrap();
            assert!(known.default_known);
            assert_eq!(known.default_executable.as_deref(), Some("墨台-v0.6.1.exe"));
            let unknown = current.status_with_effective(&user, None).unwrap();
            assert!(!unknown.default_known);
            assert!(unknown.default_executable.is_none());
            assert_eq!(known.open_with_history, unknown.open_with_history);
            let candidates = known.open_with_history;
            assert_eq!(candidates.len(), 4);
            assert!(candidates.iter().any(|name| name.eq_ignore_ascii_case("墨台-v0.5.0.exe")));
            assert!(candidates.iter().any(|name| name == "墨台-v0.6.1.exe"));
            assert_eq!(candidates.last().map(String::as_str), Some("墨台.exe"));

            let selected: [String; 3] = ["墨台.exe".into(), "墨台-v0.5.0.exe".into(), "墨台-v0.6.1.exe".into()];
            for forbidden in ["OtherApp.exe", r"C:\Apps\墨台.exe"] {
                let both = [selected[0].clone(), forbidden.into()];
                assert!(remove_history_entries(&user, &both).is_err());
                assert_eq!(read_mru_list(&history).unwrap().as_deref(), Some("ebfgdac"));
                assert!(history.get_raw_value("b").is_ok());
            }

            assert!(remove_history_entries(&user, &selected).unwrap());
            assert!(!remove_history_entries(&user, &selected).unwrap());
            for letter in ["b", "d", "e", "f"] {
                assert!(optional(history.get_raw_value(letter)).unwrap().is_none());
            }
            assert_eq!(read_mru_list(&history).unwrap().as_deref(), Some("gac"));
            assert_eq!(history.get_raw_value(MRU_LIST).unwrap().vtype, REG_SZ);
            assert_eq!(history.get_value::<String, _>("g").unwrap(), "墨台-v2.0.0.exe");
            assert_eq!(history.get_value::<String, _>("a").unwrap(), "OtherApp.exe");
            assert_eq!(history.get_value::<String, _>("c").unwrap(), "OtherEditor.exe");
            assert_eq!(other_history.get_value::<String, _>("b").unwrap(), "墨台.exe");
            assert_eq!(read_mru_list(&other_history).unwrap().as_deref(), Some("b"));
            assert_eq!(choice.get_raw_value("ProgId").unwrap(), original_choice);
            assert_eq!(choice.get_raw_value("Hash").unwrap(), original_hash);
            assert_eq!(default_command.get_raw_value("").unwrap(), original_command);
        }

        #[test]
        fn private_hive_removes_advertisements_but_retains_required_handlers() {
            let (_directory, user) = TestHiveDirectory::load();
            let entry = Registration::for_path(r"C:\Apps\墨台.exe".into());
            let exact = EffectiveAssociation { prog_id: Some(entry.prog_id.clone()), executable: None };
            let command_key = format!(r"{}\shell\open\command", entry.program_key);
            let choice = user.create_subkey(EXPLORER_HISTORY.replace("OpenWithList", "UserChoice")).unwrap().0;
            choice.set_value("ProgId", &entry.prog_id).unwrap();
            let original_choice = choice.get_raw_value("ProgId").unwrap();

            for effective in [Some(&exact), None] {
                write_registration(&user, &entry).unwrap();
                remove_registration(&user, &entry, effective).unwrap();
                let status = entry.status_with_effective(&user, effective).unwrap();
                assert_eq!(status.default_known, effective.is_some());
                assert_eq!(status.is_default, effective.is_some());
                assert!(!status.registered);
                assert!(status.has_owned_registration);
                assert!(status.default_handler_retained);
                assert!(read_string(&user, REGISTERED_APPS, &entry.application_name).unwrap().is_none());
                assert!(optional(user.open_subkey(&entry.app_key)).unwrap().is_none());
                let open_with = user.open_subkey(OPEN_WITH).unwrap();
                assert!(optional(open_with.get_raw_value(&entry.prog_id)).unwrap().is_none());
                assert_eq!(read_string(&user, &command_key, "").unwrap(), Some(entry.command()));
                assert_eq!(choice.get_raw_value("ProgId").unwrap(), original_choice);
            }

            let alias_prog_id = r"Applications\墨台.exe";
            choice.set_value("ProgId", &alias_prog_id).unwrap();
            let alias_choice = choice.get_raw_value("ProgId").unwrap();
            let alias_command = user.create_subkey(format!(r"Software\Classes\{alias_prog_id}\shell\open\command")).unwrap().0;
            alias_command.set_value("", &entry.command()).unwrap();
            let original_alias_command = alias_command.get_raw_value("").unwrap();
            let alias = EffectiveAssociation {
                prog_id: Some(alias_prog_id.into()),
                executable: Some(entry.executable.clone()),
            };
            write_registration(&user, &entry).unwrap();
            remove_registration(&user, &entry, Some(&alias)).unwrap();
            let status = entry.status_with_effective(&user, Some(&alias)).unwrap();
            assert!(status.is_default);
            assert!(!status.registered);
            assert!(!status.has_owned_registration);
            assert!(!status.default_handler_retained);
            assert!(optional(user.open_subkey(&entry.program_key)).unwrap().is_none());
            assert_eq!(alias_command.get_raw_value("").unwrap(), original_alias_command);
            assert_eq!(choice.get_raw_value("ProgId").unwrap(), alias_choice);
        }
    }
}
