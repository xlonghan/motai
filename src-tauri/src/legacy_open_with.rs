#![cfg(windows)]

use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Component, Path, Prefix},
};
use windows::{Win32::Storage::FileSystem::GetDriveTypeW, core::PCWSTR};
use winreg::{
    RegKey,
    enums::{HKEY_LOCAL_MACHINE, KEY_ENUMERATE_SUB_KEYS, KEY_QUERY_VALUE, REG_EXPAND_SZ, REG_MULTI_SZ, REG_SZ},
    types::FromRegValue,
};

const APPLICATIONS: &str = r"Software\Classes\Applications";
const CLASSES: &str = r"Software\Classes";
const SYSTEM_ASSOCIATIONS: &str = r"Software\Classes\SystemFileAssociations";
const FILE_EXTENSIONS: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts";
const DRIVE_FIXED: u32 = 3;
const LOOKUP_ACCESS: u32 = KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS;

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct LegacyApplication {
    pub name: String,
    pub path: String,
    pub duplicate: bool,
}

pub fn candidates(user: &RegKey, current: &Path, allow_duplicates: bool) -> Result<Vec<LegacyApplication>, String> {
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    find_candidates(user, &machine, current, allow_duplicates).map_err(lookup_error)
}

pub fn remove(user: &RegKey, current: &Path, allow_duplicates: bool, requested_names: &[String]) -> Result<bool, String> {
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    remove_selected(user, &machine, current, allow_duplicates, requested_names)
}

fn lookup_error(error: io::Error) -> String {
    format!("无法核对 Windows 打开方式登记：{error}")
}

fn open_optional(key: &RegKey, path: &str) -> io::Result<Option<RegKey>> {
    match key.open_subkey_with_flags(path, LOOKUP_ACCESS) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn version(text: &str) -> Option<(u32, u32, u32)> {
    let mut parts = text.split('.');
    let mut number = || {
        let part = parts.next()?;
        if part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        part.parse().ok()
    };
    let version = (number()?, number()?, number()?);
    parts.next().is_none().then_some(version)
}

fn release_version_order(name: &str) -> Option<std::cmp::Ordering> {
    let name = name.to_ascii_lowercase();
    let release = version(name.strip_prefix("墨台-v")?.strip_suffix(".exe")?)?;
    Some(release.cmp(&version(env!("CARGO_PKG_VERSION"))?))
}

fn fixed_drive(path: &Path) -> bool {
    let Some(Component::Prefix(prefix)) = path.components().next() else { return false; };
    let drive = match prefix.kind() {
        Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => drive,
        _ => return false,
    };
    let root = [u16::from(drive), u16::from(b':'), u16::from(b'\\'), 0];
    path.is_absolute() && unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) == DRIVE_FIXED }
}

fn executable_is_missing(path: &Path) -> bool {
    if path.components().any(|part| matches!(part, Component::ParentDir))
        || !fixed_drive(path)
        || !matches!(fs::symlink_metadata(path), Err(error) if error.kind() == io::ErrorKind::NotFound)
    {
        return false;
    }
    // Validate the nearest existing parent before believing NotFound. An unplugged
    // drive or dangling junction does not establish that its executable is gone.
    for ancestor in path.ancestors().skip(1) {
        match fs::symlink_metadata(ancestor) {
            Ok(_) => {
                return fs::canonicalize(ancestor)
                    .is_ok_and(|parent| fixed_drive(&parent) && parent.is_dir());
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return false,
        }
    }
    false
}

fn only_child(key: &RegKey, name: &str) -> io::Result<Option<RegKey>> {
    let info = key.query_info()?;
    if info.values != 0 || info.sub_keys != 1 {
        return Ok(None);
    }
    open_optional(key, name)
}

fn duplicate_directory(current: &Path, allowed: bool) -> Option<std::path::PathBuf> {
    current.parent().filter(|_| allowed).and_then(|path| fs::canonicalize(path).ok())
}

fn inspect_application(applications: &RegKey, name: &str, duplicate_dir: Option<&Path>) -> io::Result<Option<LegacyApplication>> {
    let Some(order) = release_version_order(name) else { return Ok(None); };
    if order.is_gt() || (order.is_eq() && duplicate_dir.is_none()) {
        return Ok(None);
    }
    let Some(app) = open_optional(applications, name)? else { return Ok(None); };
    let Some(shell) = only_child(&app, "shell")? else { return Ok(None); };
    let Some(open) = only_child(&shell, "open")? else { return Ok(None); };
    let Some(command) = only_child(&open, "command")? else { return Ok(None); };
    let info = command.query_info()?;
    if info.values != 1 || info.sub_keys != 0 {
        return Ok(None);
    }
    let value = match command.get_raw_value("") {
        Ok(value) if value.vtype == REG_SZ => value,
        Ok(_) => return Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let command = String::from_reg_value(&value)?;
    let Some(path) = command.strip_prefix('"').and_then(|text| text.strip_suffix("\" \"%1\"")) else {
        return Ok(None);
    };
    let file = Path::new(path);
    let matching_name = file.file_name().and_then(|file| file.to_str())
        .is_some_and(|file| file.eq_ignore_ascii_case(name));
    if path.contains('"') || !matching_name {
        return Ok(None);
    }
    let duplicate = duplicate_dir.is_some_and(|directory| {
        fixed_drive(file)
            && fs::symlink_metadata(file).is_ok_and(|metadata| metadata.file_type().is_file())
            && fs::canonicalize(file).is_ok_and(|path| path.parent() == Some(directory))
    });
    if !duplicate && !(order.is_lt() && executable_is_missing(file)) {
        return Ok(None);
    }
    Ok(Some(LegacyApplication { name: name.into(), path: path.into(), duplicate }))
}

fn exclude_mentions(text: &str, candidates: &mut Vec<LegacyApplication>) {
    let text = text.to_ascii_lowercase();
    candidates.retain(|candidate| !text.contains(&candidate.name.to_ascii_lowercase()));
}

fn exclude_tree_references(
    key: &RegKey,
    omit_md_history: bool,
    candidates: &mut Vec<LegacyApplication>,
) -> io::Result<()> {
    // Windows registry names can contain unpaired UTF-16 surrogates.
    for entry in key.enum_values_os_string() {
        let (name, value) = entry?;
        exclude_mentions(&name.to_string_lossy(), candidates);
        match value.vtype {
            REG_SZ | REG_EXPAND_SZ => exclude_mentions(&String::from_reg_value(&value)?, candidates),
            REG_MULTI_SZ => {
                for text in Vec::<String>::from_reg_value(&value)? {
                    exclude_mentions(&text, candidates);
                }
            }
            _ => {}
        }
        if candidates.is_empty() {
            return Ok(());
        }
    }
    for child in key.enum_keys_os_string() {
        let child = child?;
        let child_name = child.to_string_lossy();
        if omit_md_history && child_name.eq_ignore_ascii_case("OpenWithList") {
            continue;
        }
        exclude_mentions(&child_name, candidates);
        if candidates.is_empty() {
            break;
        }
        exclude_tree_references(&key.open_subkey_with_flags(child, LOOKUP_ACCESS)?, false, candidates)?;
    }
    Ok(())
}

fn exclude_extension_references(
    root: &RegKey,
    path: &str,
    candidates: &mut Vec<LegacyApplication>,
) -> io::Result<()> {
    if candidates.is_empty() {
        return Ok(());
    }
    let Some(root) = open_optional(root, path)? else { return Ok(()); };
    for extension in root.enum_keys_os_string() {
        let extension = extension?;
        let extension_name = extension.to_string_lossy();
        if !extension_name.starts_with('.') {
            continue;
        }
        let key = root.open_subkey_with_flags(&extension, LOOKUP_ACCESS)?;
        let omit_md_history = path == FILE_EXTENSIONS && extension_name.eq_ignore_ascii_case(".md");
        exclude_tree_references(&key, omit_md_history, candidates)?;
        if candidates.is_empty() {
            break;
        }
    }
    Ok(())
}

fn find_candidates(user: &RegKey, machine: &RegKey, current: &Path, allow_duplicates: bool) -> io::Result<Vec<LegacyApplication>> {
    let Some(applications) = open_optional(user, APPLICATIONS)? else { return Ok(Vec::new()); };
    let current_name = current.file_name().and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "无法确认当前墨台程序名称"))?;
    let duplicate_dir = duplicate_directory(current, allow_duplicates);
    let mut candidates = Vec::new();
    for name in applications.enum_keys_os_string() {
        let name = name?;
        let Some(name) = name.to_str() else { continue; };
        if !name.eq_ignore_ascii_case(current_name) {
            candidates.extend(inspect_application(&applications, name, duplicate_dir.as_deref())?);
        }
    }
    // Only Explorer's .md MRU is separate. Keep candidates referenced by actual
    // choices, other extensions, or either registry source of merged Classes.
    for (root, key) in [
        (user, FILE_EXTENSIONS),
        (user, CLASSES),
        (user, SYSTEM_ASSOCIATIONS),
        (machine, CLASSES),
        (machine, SYSTEM_ASSOCIATIONS),
    ] {
        exclude_extension_references(root, key, &mut candidates)?;
    }
    candidates.sort_by_key(|candidate| candidate.name.to_ascii_lowercase());
    Ok(candidates)
}

fn remove_selected(
    user: &RegKey,
    machine: &RegKey,
    current: &Path,
    allow_duplicates: bool,
    requested_names: &[String],
) -> Result<bool, String> {
    if requested_names.is_empty() {
        return Ok(false);
    }
    let candidates = find_candidates(user, machine, current, allow_duplicates).map_err(lookup_error)?;
    let available = |name: &str| candidates.iter().find(|entry| entry.name.eq_ignore_ascii_case(name));
    let mut seen = BTreeSet::new();
    let mut selected = Vec::new();
    for name in requested_names {
        let entry = available(name)
            .ok_or_else(|| "部分打开方式已变化，请刷新后重新选择".to_owned())?;
        if seen.insert(entry.name.to_ascii_lowercase()) {
            selected.push(entry);
        }
    }
    let applications = user.open_subkey_with_flags(APPLICATIONS, LOOKUP_ACCESS).map_err(lookup_error)?;
    let duplicate_dir = duplicate_directory(current, allow_duplicates);
    for entry in selected {
        if inspect_application(&applications, &entry.name, duplicate_dir.as_deref()).map_err(lookup_error)?.as_ref() != Some(entry) {
            return Err("打开方式登记已变化，请刷新后重试".into());
        }
        user.delete_subkey_all(format!(r"{APPLICATIONS}\{}", entry.name)).map_err(lookup_error)?;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf, process, time::{SystemTime, UNIX_EPOCH}};

    const OLD: &str = "墨台-v0.5.0.exe";
    const LIVE: &str = "墨台-v0.5.1.exe";
    const OTHER: &str = "墨台-v0.5.2.exe";

    struct TestHives(PathBuf);

    impl TestHives {
        fn load() -> (Self, RegKey, RegKey) {
            let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let path = std::env::temp_dir().join(format!("motai-legacy-apps-{}-{nonce}", process::id()));
            fs::create_dir(&path).unwrap();
            let hives = Self(path);
            let user = RegKey::load_app_key(hives.0.join("user.hiv"), true).unwrap();
            let machine = RegKey::load_app_key(hives.0.join("machine.hiv"), true).unwrap();
            (hives, user, machine)
        }

        fn register(&self, user: &RegKey, name: &str) -> PathBuf {
            let path = self.0.join("old release directory").join(name);
            let key = user.create_subkey(format!(r"{APPLICATIONS}\{name}\shell\open\command")).unwrap().0;
            key.set_value("", &format!(r#""{}" "%1""#, path.display())).unwrap();
            path
        }
    }

    impl Drop for TestHives {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn accepts_only_older_branded_release_names() {
        assert!(release_version_order(OLD).unwrap().is_lt());
        assert!(release_version_order("墨台-V0.5.0.EXE").unwrap().is_lt());
        assert!(release_version_order("墨台-v9.0.0.exe").unwrap().is_gt());
        for name in ["墨台.exe", "other-v0.5.0.exe", "墨台-v0.5.0.exe.bak", r"x\墨台-v0.5.0.exe"] {
            assert!(release_version_order(name).is_none(), "{name}");
        }
    }

    #[test]
    fn private_hives_remove_confirmed_missing_application_only() {
        let (hives, user, machine) = TestHives::load();
        let path = hives.register(&user, OLD);
        let live = hives.register(&user, LIVE);
        fs::create_dir_all(live.parent().unwrap()).unwrap();
        fs::write(&live, b"present fixture").unwrap();

        let history = user.create_subkey(format!(r"{FILE_EXTENSIONS}\.md\OpenWithList")).unwrap().0;
        history.set_value("a", &OLD).unwrap();
        history.set_value("MRUList", &"a").unwrap();
        let default = user.create_subkey(format!(r"{FILE_EXTENSIONS}\.md\UserChoice")).unwrap().0;
        default.set_value("ProgId", &r"Applications\墨台-v0.6.1.exe").unwrap();
        let applications = user.open_subkey(APPLICATIONS).unwrap();
        let expected = vec![LegacyApplication { name: OLD.into(), path: path.display().to_string(), duplicate: false }];
        let current = Path::new("墨台-v0.6.1.exe");
        assert_eq!(find_candidates(&user, &machine, current, false).unwrap(), expected);
        assert!(find_candidates(&user, &machine, Path::new(OLD), false).unwrap().is_empty());

        assert!(remove_selected(&user, &machine, current, false, &[OLD.into(), LIVE.into()]).is_err());
        assert!(applications.open_subkey(OLD).is_ok());
        assert!(remove_selected(&user, &machine, current, false, &[OLD.into()]).unwrap());
        assert!(open_optional(&applications, OLD).unwrap().is_none());
        assert!(applications.open_subkey(LIVE).is_ok());
        assert_eq!(history.get_value::<String, _>("a").unwrap(), OLD);
        assert_eq!(history.get_value::<String, _>("MRUList").unwrap(), "a");
        assert_eq!(default.get_value::<String, _>("ProgId").unwrap(), r"Applications\墨台-v0.6.1.exe");
    }

    #[test]
    fn private_hives_protect_defaults_other_types_and_non_manual_keys() {
        let (hives, user, machine) = TestHives::load();
        hives.register(&user, OLD);
        hives.register(&user, LIVE);
        hives.register(&user, OTHER);
        let latest = user.create_subkey(format!(r"{FILE_EXTENSIONS}\.md\UserChoiceLatest\ProgId")).unwrap().0;
        latest.set_value("", &format!(r"Applications\{OLD}")).unwrap();
        let text_history = user.create_subkey(format!(r"{FILE_EXTENSIONS}\.txt\OpenWithList")).unwrap().0;
        text_history.set_value("a", &LIVE).unwrap();
        let machine_types = machine.create_subkey(format!(r"{CLASSES}\.cfg\OpenWithProgids")).unwrap().0;
        machine_types.set_value(format!(r"Applications\{OTHER}"), &"").unwrap();
        let applications = user.open_subkey(APPLICATIONS).unwrap();
        let current = Path::new("墨台.exe");
        assert!(find_candidates(&user, &machine, current, false).unwrap().is_empty());

        latest.delete_value("").unwrap();
        text_history.delete_value("a").unwrap();
        machine_types.delete_value(format!(r"Applications\{OTHER}")).unwrap();
        let old = user.create_subkey(format!(r"{APPLICATIONS}\{OLD}\SupportedTypes")).unwrap().0;
        old.set_value(".md", &"").unwrap();
        user.create_subkey(format!(r"{APPLICATIONS}\{LIVE}\shell\print\command")).unwrap();
        let other = user.create_subkey(format!(r"{APPLICATIONS}\{OTHER}\shell\open\command")).unwrap().0;
        other.set_value("", &r#""C:\Example\墨台-v0.5.2.exe" "%1" /another-argument"#).unwrap();
        assert!(find_candidates(&user, &machine, current, false).unwrap().is_empty());
        assert!(remove_selected(&user, &machine, current, false, &[OLD.into(), LIVE.into(), OTHER.into()]).is_err());
        for name in [OLD, LIVE, OTHER] {
            assert!(applications.open_subkey(name).is_ok());
        }
    }

    #[test]
    fn private_hives_remove_same_folder_duplicate_registration_without_removing_programs() {
        let (hives, user, machine) = TestHives::load();
        let duplicate_name = format!("墨台-v{}.exe", env!("CARGO_PKG_VERSION"));
        let duplicate = hives.register(&user, &duplicate_name);
        let other = hives.0.join("other directory").join(OTHER);
        let other_command = user.create_subkey(format!(r"{APPLICATIONS}\{OTHER}\shell\open\command")).unwrap().0;
        other_command.set_value("", &format!(r#""{}" "%1""#, other.display())).unwrap();
        fs::create_dir_all(other.parent().unwrap()).unwrap();
        fs::create_dir_all(duplicate.parent().unwrap()).unwrap();
        let current = duplicate.with_file_name("墨台.exe");
        for program in [&current, &duplicate, &other] {
            fs::write(program, b"program fixture").unwrap();
        }
        assert!(find_candidates(&user, &machine, &current, false).unwrap().is_empty());
        assert!(find_candidates(&user, &machine, &duplicate, true).unwrap().is_empty());

        let default = user.create_subkey(format!(r"{FILE_EXTENSIONS}\.md\UserChoice")).unwrap().0;
        default.set_value("ProgId", &format!(r"Applications\{duplicate_name}")).unwrap();
        assert!(find_candidates(&user, &machine, &current, true).unwrap().is_empty());
        assert!(remove_selected(&user, &machine, &current, true, &[duplicate_name.clone()]).is_err());
        default.set_value("ProgId", &"AnotherEditor.md").unwrap();
        default.set_value("Hash", &"preserve this").unwrap();

        let candidates = find_candidates(&user, &machine, &current, true).unwrap();
        assert_eq!(candidates, vec![LegacyApplication {
            name: duplicate_name.clone(), path: duplicate.display().to_string(), duplicate: true,
        }]);
        assert!(remove_selected(&user, &machine, &current, true, &[duplicate_name.clone()]).unwrap());
        assert!(user.open_subkey(format!(r"{APPLICATIONS}\{duplicate_name}")).is_err());
        assert!(user.open_subkey(format!(r"{APPLICATIONS}\{OTHER}")).is_ok());
        assert_eq!(default.get_value::<String, _>("ProgId").unwrap(), "AnotherEditor.md");
        assert_eq!(default.get_value::<String, _>("Hash").unwrap(), "preserve this");
        assert!(current.is_file() && duplicate.is_file() && other.is_file());
    }

    #[test]
    fn private_hives_scan_non_unicode_registry_names_without_losing_references() {
        let (hives, user, machine) = TestHives::load();
        hives.register(&user, OLD);
        let opaque_name = OsString::from_wide(&[0xd800]);
        let opaque_extension = OsString::from_wide(&[u16::from(b'.'), 0xd800]);
        let applications = user.create_subkey(APPLICATIONS).unwrap().0;
        applications.create_subkey(&opaque_name).unwrap();
        let classes = user.create_subkey(CLASSES).unwrap().0;
        classes.create_subkey(&opaque_name).unwrap();
        let extension = classes.create_subkey(&opaque_extension).unwrap().0;
        let opaque_child = extension.create_subkey(&opaque_name).unwrap().0;
        opaque_child.set_value(&opaque_name, &"Unrelated.Program").unwrap();
        let current = Path::new("墨台.exe");
        let candidates = find_candidates(&user, &machine, current, false).unwrap();
        assert_eq!(candidates[0].name, OLD);

        opaque_child.set_value(&opaque_name, &format!(r"Applications\{OLD}")).unwrap();
        assert!(find_candidates(&user, &machine, current, false).unwrap().is_empty());
        opaque_child.delete_value(&opaque_name).unwrap();

        let reference_units: Vec<u16> = [0xd800].into_iter().chain(OLD.encode_utf16()).collect();
        let opaque_reference_name = OsString::from_wide(&reference_units);
        opaque_child.set_value(&opaque_reference_name, &"").unwrap();
        assert!(find_candidates(&user, &machine, current, false).unwrap().is_empty());
        assert!(remove_selected(&user, &machine, current, false, &[OLD.into()]).is_err());
        assert!(applications.open_subkey(OLD).is_ok());
    }
}
