use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_events::{append_system_event, append_workflow_task_history};
use crate::project_model::{
    read_optional_project_file, ProjectError, ProjectFileDocument, ProviderBatchTestResult,
    ProviderTestResult,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiProviderConfig {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) kind: Option<String>,
    pub(crate) enabled: Option<bool>,
    pub(crate) base_url: Option<String>,
    pub(crate) api_key: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) context_window: Option<u32>,
    pub(crate) temperature: Option<f32>,
    pub(crate) max_tokens: Option<u32>,
    pub(crate) timeout_seconds: Option<u64>,
    pub(crate) use_cases: Option<Vec<String>>,
}

#[derive(Clone, Copy)]
pub(crate) struct ModelTokenUsage {
    pub(crate) prompt_tokens: Option<u64>,
    pub(crate) completion_tokens: Option<u64>,
    pub(crate) total_tokens: Option<u64>,
}

#[derive(Clone, Default)]
pub(crate) struct ProviderCallDiagnostics {
    pub(crate) retry_reason: Option<String>,
    pub(crate) attempt_durations_ms: Vec<u128>,
}

impl ProviderCallDiagnostics {
    pub(crate) fn retry_attempts(&self) -> usize {
        self.attempt_durations_ms.len().saturating_sub(1)
    }
}

pub(crate) struct ProviderCallResult {
    pub(crate) content: String,
    pub(crate) usage: Option<ModelTokenUsage>,
    pub(crate) diagnostics: ProviderCallDiagnostics,
}

pub(crate) fn provider_usage_warnings(root: &Path, usage: Option<ModelTokenUsage>) -> Vec<String> {
    let Some(usage) = usage else {
        return Vec::new();
    };
    let Some(completion_tokens) = usage.completion_tokens else {
        return Vec::new();
    };
    let Ok(Some(provider)) = select_chapter_provider(root) else {
        return Vec::new();
    };
    let Some(max_tokens) = provider
        .max_tokens
        .map(u64::from)
        .filter(|value| *value > 0)
    else {
        return Vec::new();
    };
    if completion_tokens + 16 >= max_tokens {
        vec![format!(
            "Provider 输出接近 maxTokens 上限（completionTokens={completion_tokens}, maxTokens={max_tokens}），正文可能被截断。建议调高 maxTokens、启用分段续写，或缩短上下文后重试。"
        )]
    } else {
        Vec::new()
    }
}

pub(crate) fn is_retryable_provider_chat_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("timed out")
        || lower.contains("choices[0]")
        || lower.contains("response read failed")
        || lower.contains("invalid json")
        || lower.contains("max_tokens")
}

fn provider_retry_delay(attempt: usize) -> Duration {
    let base_millis = match attempt {
        0 => 700,
        1 => 1800,
        2 => 3500,
        _ => 6000,
    };
    let jitter = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_millis() as u64
        % 250;
    Duration::from_millis(base_millis + jitter)
}

fn format_provider_retry_error(first_error: &str, last_error: &str) -> String {
    if first_error == last_error {
        last_error.to_owned()
    } else {
        format!("{last_error}; first attempt failed with: {first_error}")
    }
}

pub(crate) struct ModelCallLog<'a> {
    pub(crate) task: &'a str,
    pub(crate) chapter_id: Option<&'a str>,
    pub(crate) provider: &'a str,
    pub(crate) input_path: Option<&'a str>,
    pub(crate) output_path: Option<&'a str>,
    pub(crate) ok: bool,
    pub(crate) duration_ms: Option<u128>,
    pub(crate) usage: Option<ModelTokenUsage>,
    pub(crate) diagnostics: Option<&'a ProviderCallDiagnostics>,
    pub(crate) message: &'a str,
}

pub fn load_ai_providers(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    let has_project_root = !root_path.trim().is_empty();
    let project_root = PathBuf::from(root_path);
    let config_root = software_provider_config_root()?;
    let relative_path = software_provider_display_path();
    let path = config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE);
    let content = if path.exists() {
        let raw = fs::read_to_string(path)?;
        if raw.trim().is_empty() {
            default_ai_provider_config_json()?
        } else {
            decrypt_ai_providers_for_display(&config_root, &raw)?
        }
    } else if has_project_root {
        if let Some(migrated) = read_legacy_project_provider_config_for_display(&project_root)? {
            migrated
        } else {
            default_ai_provider_config_json()?
        }
    } else {
        default_ai_provider_config_json()?
    };

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub fn save_ai_providers(
    root_path: String,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    if content.trim().is_empty() {
        return Err(ProjectError::InvalidInput(
            "AI Provider 配置不能为空。请至少保留一个 Provider 配置。".to_owned(),
        ));
    }
    let has_project_root = !root_path.trim().is_empty();
    let root = PathBuf::from(root_path);
    let config_root = software_provider_config_root()?;
    let parsed = encrypt_ai_providers_for_storage(&config_root, &content)?;
    let provider_summaries = parsed
        .as_array()
        .map(|providers| {
            providers
                .iter()
                .map(|provider| {
                    serde_json::json!({
                        "id": provider.get("id").and_then(|value| value.as_str()).unwrap_or(""),
                        "name": provider.get("name").and_then(|value| value.as_str()).unwrap_or(""),
                        "kind": provider.get("kind").and_then(|value| value.as_str()).unwrap_or(""),
                        "enabled": provider.get("enabled").and_then(|value| value.as_bool()).unwrap_or(true),
                        "model": provider.get("model").and_then(|value| value.as_str()).unwrap_or(""),
                        "models": provider.get("models").cloned().unwrap_or_else(|| serde_json::json!([])),
                        "useCases": provider.get("useCases").cloned().unwrap_or_else(|| serde_json::json!([])),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let enabled_count = provider_summaries
        .iter()
        .filter(|provider| {
            provider
                .get("enabled")
                .and_then(|value| value.as_bool())
                .unwrap_or(true)
        })
        .count();
    let pretty = serde_json::to_string_pretty(&parsed)?;
    let relative_path = software_provider_display_path();
    let path = config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE);
    atomic_write_text(&path, &(pretty + "\n"))?;
    if has_project_root && root.exists() {
        append_system_event(
            &root,
            "providers_saved",
            serde_json::json!({
                "path": relative_path,
                "scope": "software",
                "count": provider_summaries.len(),
                "enabledCount": enabled_count,
                "providers": provider_summaries
            }),
        )?;
    }

    Ok(ProjectFileDocument {
        relative_path,
        content: decrypt_ai_providers_for_display(
            &config_root,
            &serde_json::to_string_pretty(&parsed)?,
        )?,
    })
}

pub fn test_ai_provider(root_path: String) -> Result<ProviderTestResult, ProjectError> {
    let root = PathBuf::from(root_path);
    let has_project_root = !root.as_os_str().is_empty() && root.exists();
    let started_at = Instant::now();
    let mut usage = None;
    let result: ProviderTestResult = match select_chapter_provider(&root) {
        Ok(Some(provider)) => {
            let label = provider_label(&provider);
            match call_openai_compatible(&provider, "只回复：Olienta connection ok") {
                Ok(result) => {
                    usage = result.usage;
                    ProviderTestResult {
                        ok: true,
                        provider: label,
                        message: trim_for_status(&result.content),
                        log_entry_id: None,
                    }
                }
                Err(error) => ProviderTestResult {
                    ok: false,
                    provider: label,
                    message: error,
                    log_entry_id: None,
                },
            }
        }
        Ok(None) => ProviderTestResult {
            ok: false,
            provider: "none".to_owned(),
            message: "没有启用的 OpenAI-compatible Provider。".to_owned(),
            log_entry_id: None,
        },
        Err(error) => ProviderTestResult {
            ok: false,
            provider: "invalid-config".to_owned(),
            message: error.to_string(),
            log_entry_id: None,
        },
    };
    let log_entry_id = if has_project_root {
        Some(append_model_call_log(
            &root,
            ModelCallLog {
                task: "provider-test",
                chapter_id: None,
                provider: &result.provider,
                input_path: Some("软件设置/ai-providers.json"),
                output_path: Some("logs/model-calls/history.md"),
                ok: result.ok,
                duration_ms: Some(started_at.elapsed().as_millis()),
                usage,
                diagnostics: None,
                message: &result.message,
            },
        )?)
    } else {
        None
    };
    let result = ProviderTestResult {
        log_entry_id,
        ..result
    };
    if has_project_root {
        append_workflow_task_history(
            &root,
            "provider_tested",
            if result.ok { "done" } else { "failed" },
            serde_json::json!({
                "provider": result.provider,
                "message": result.message,
                "configPath": "软件设置/ai-providers.json"
            }),
        )?;
    }
    Ok(result)
}

pub fn test_ai_providers(root_path: String) -> Result<ProviderBatchTestResult, ProjectError> {
    let result = test_ai_provider(root_path)?;
    Ok(ProviderBatchTestResult {
        total: 1,
        passed: usize::from(result.ok),
        failed: usize::from(!result.ok),
        results: vec![result],
    })
}


pub(crate) fn append_model_call_log(root: &Path, log: ModelCallLog<'_>) -> Result<String, ProjectError> {
    fs::create_dir_all(ensure_project_path(root, "logs/model-calls")?)?;
    let target = ensure_project_path(root, "logs/model-calls/history.md")?;
    let mut content =
        fs::read_to_string(&target).unwrap_or_else(|_| "# Model Call History\n\n".to_owned());
    let entry_id = model_call_log_entry_id(log.task);
    content.push_str(&format!(
        "\n## {}\n\n- id: {}\n- status: {}\n- provider: {}\n- chapter: {}\n- input: {}\n- output: {}\n- durationMs: {}\n- promptTokens: {}\n- completionTokens: {}\n- totalTokens: {}\n- message: {}\n",
        log.task,
        entry_id,
        if log.ok { "ok" } else { "failed" },
        log.provider,
        log.chapter_id.unwrap_or("-"),
        log.input_path.unwrap_or("-"),
        log.output_path.unwrap_or("-"),
        log.duration_ms
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_owned()),
        format_optional_u64(log.usage.and_then(|usage| usage.prompt_tokens)),
        format_optional_u64(log.usage.and_then(|usage| usage.completion_tokens)),
        format_optional_u64(log.usage.and_then(|usage| usage.total_tokens)),
        log.message
    ));
    let retry_attempts = log
        .diagnostics
        .map(ProviderCallDiagnostics::retry_attempts)
        .unwrap_or(0);
    let retry_reason = log
        .diagnostics
        .and_then(|diagnostics| diagnostics.retry_reason.as_deref())
        .unwrap_or("-");
    let attempt_durations_ms = log
        .diagnostics
        .filter(|diagnostics| !diagnostics.attempt_durations_ms.is_empty())
        .map(|diagnostics| {
            diagnostics
                .attempt_durations_ms
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_else(|| "-".to_owned());
    content.push_str(&format!(
        "- retryAttempts: {}\n- retryReason: {}\n- attemptDurationsMs: {}\n",
        retry_attempts, retry_reason, attempt_durations_ms
    ));
    atomic_write_text(&target, &content)?;
    Ok(entry_id)
}

fn model_call_log_entry_id(task: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis();
    let safe_task: String = task
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect();
    format!("{safe_task}-{millis}")
}

fn format_optional_u64(value: Option<u64>) -> String {
    value
        .map(|item| item.to_string())
        .unwrap_or_else(|| "-".to_owned())
}

pub(crate) const SOFTWARE_PROVIDER_CONFIG_FILE: &str = "ai-providers.json";
pub(crate) const PROVIDER_KEY_RELATIVE_PATH: &str = "provider-secret.key";
pub(crate) const PROVIDER_SECRET_PREFIX: &str = "olienta:v1:";
pub(crate) const PROVIDER_DPAPI_SECRET_PREFIX: &str = "olienta:dpapi:v1:";
const SOFTWARE_PROVIDER_DISPLAY_PREFIX: &str = "软件设置";

#[cfg(test)]
thread_local! {
    static TEST_PROVIDER_CONFIG_ROOT: std::cell::RefCell<Option<PathBuf>> = std::cell::RefCell::new(None);
}

fn software_provider_display_path() -> String {
    format!("{SOFTWARE_PROVIDER_DISPLAY_PREFIX}/{SOFTWARE_PROVIDER_CONFIG_FILE}")
}

fn software_provider_config_root() -> Result<PathBuf, ProjectError> {
    #[cfg(test)]
    {
        if let Some(path) = TEST_PROVIDER_CONFIG_ROOT.with(|value| value.borrow().clone()) {
            fs::create_dir_all(&path)?;
            return Ok(path);
        }
        let path = std::env::current_dir()?.join(".olienta-test-config");
        fs::create_dir_all(&path)?;
        Ok(path)
    }

    #[cfg(not(test))]
    {
        if let Some(value) = std::env::var_os("OLIENTA_CONFIG_DIR") {
            let path = PathBuf::from(value);
            fs::create_dir_all(&path)?;
            return Ok(path);
        }

        if let Ok(current_dir) = std::env::current_dir() {
            let path = current_dir.join(".olienta-app-config");
            if fs::create_dir_all(&path).is_ok() {
                return Ok(path);
            }
        }

        if let Some(value) = std::env::var_os("APPDATA") {
            let path = PathBuf::from(value).join("com.olienta.writer");
            fs::create_dir_all(&path)?;
            return Ok(path);
        }

        if let Some(value) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let path = PathBuf::from(value)
                .join(".config")
                .join("com.olienta.writer");
            fs::create_dir_all(&path)?;
            return Ok(path);
        }

        let path = PathBuf::from(".olienta-app");
        fs::create_dir_all(&path)?;
        Ok(path)
    }
}

fn default_ai_provider_config_json() -> Result<String, ProjectError> {
    Ok(serde_json::to_string_pretty(&serde_json::json!([{
        "id": "openai-compatible-default",
        "name": "OpenAI-compatible",
        "kind": "OpenAI-compatible",
        "enabled": false,
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "",
        "model": "gpt-4o-mini",
        "contextWindow": 128000,
        "temperature": 0.7,
        "stream": false,
        "maxTokens": 4096,
        "timeoutSeconds": 180,
        "inputPricePerMillionTokens": 0,
        "outputPricePerMillionTokens": 0,
        "useCases": ["chapter", "blueprint", "framework"]
    }]))?
        + "\n")
}

fn read_legacy_project_provider_config_for_display(
    root: &Path,
) -> Result<Option<String>, ProjectError> {
    let path = match ensure_project_path(root, ".olienta/ai-providers.json") {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path)?;
    decrypt_ai_providers_for_display(root, &raw).map(Some)
}

fn encrypt_ai_providers_for_storage(
    root: &Path,
    content: &str,
) -> Result<serde_json::Value, ProjectError> {
    let mut parsed: serde_json::Value = serde_json::from_str(content)?;

    if let Some(providers) = parsed.as_array_mut() {
        for provider in providers {
            let Some(object) = provider.as_object_mut() else {
                continue;
            };
            let api_key = object
                .get("apiKey")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_owned();
            if api_key.is_empty() {
                continue;
            }
            let encrypted = if is_provider_secret_encrypted(&api_key) {
                api_key
            } else {
                encrypt_provider_secret(root, &api_key)?
            };
            object.insert(
                "apiKeyEncrypted".to_owned(),
                serde_json::Value::String(encrypted),
            );
            object.remove("apiKey");
        }
    }

    Ok(parsed)
}

fn decrypt_ai_providers_for_display(root: &Path, content: &str) -> Result<String, ProjectError> {
    let mut parsed: serde_json::Value = match serde_json::from_str(content) {
        Ok(value) => value,
        Err(_) => {
            return Ok(if content.ends_with('\n') {
                content.to_owned()
            } else {
                format!("{content}\n")
            });
        }
    };

    if let Some(providers) = parsed.as_array_mut() {
        for provider in providers {
            let Some(object) = provider.as_object_mut() else {
                continue;
            };
            let encrypted = object
                .get("apiKeyEncrypted")
                .and_then(|value| value.as_str())
                .map(str::to_owned);
            if let Some(encrypted) = encrypted {
                if let Some(decrypted) = decrypt_provider_secret(root, &encrypted)? {
                    object.insert("apiKey".to_owned(), serde_json::Value::String(decrypted));
                    object.remove("apiKeyEncrypted");
                }
            }
        }
    }

    Ok(serde_json::to_string_pretty(&parsed)? + "\n")
}

fn is_provider_secret_encrypted(value: &str) -> bool {
    value.starts_with(PROVIDER_DPAPI_SECRET_PREFIX) || value.starts_with(PROVIDER_SECRET_PREFIX)
}

fn read_or_create_provider_secret(root: &Path) -> Result<Vec<u8>, ProjectError> {
    let path = ensure_project_path(root, PROVIDER_KEY_RELATIVE_PATH)?;
    if path.exists() {
        let content = fs::read_to_string(&path)?;
        if let Some(bytes) = decode_hex(content.trim()) {
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
    }

    let seed = format!(
        "{}:{}",
        root.to_string_lossy(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let bytes = derive_provider_secret_bytes(&seed);
    atomic_write_text(&path, &(encode_hex(&bytes) + "\n"))?;
    Ok(bytes)
}

fn derive_provider_secret_bytes(seed: &str) -> Vec<u8> {
    let seed_bytes = seed.as_bytes();
    let mut bytes = vec![0_u8; 32];
    for index in 0..bytes.len() {
        let source = seed_bytes
            .get(index % seed_bytes.len())
            .copied()
            .unwrap_or(0);
        bytes[index] = source
            .wrapping_add((index as u8).wrapping_mul(37))
            .rotate_left((index % 8) as u32);
    }
    bytes
}

fn encrypt_provider_secret(root: &Path, value: &str) -> Result<String, ProjectError> {
    #[cfg(windows)]
    if let Some(encrypted) = protect_provider_secret_with_os(value.as_bytes()) {
        return Ok(format!(
            "{PROVIDER_DPAPI_SECRET_PREFIX}{}",
            encode_hex(&encrypted)
        ));
    }

    let key = read_or_create_provider_secret(root)?;
    let encrypted = xor_provider_secret(value.as_bytes(), &key);
    Ok(format!(
        "{PROVIDER_SECRET_PREFIX}{}",
        encode_hex(&encrypted)
    ))
}

fn decrypt_provider_secret(root: &Path, value: &str) -> Result<Option<String>, ProjectError> {
    if let Some(payload) = value.strip_prefix(PROVIDER_DPAPI_SECRET_PREFIX) {
        let Some(encrypted) = decode_hex(payload) else {
            return Ok(None);
        };
        #[cfg(windows)]
        {
            return Ok(unprotect_provider_secret_with_os(&encrypted)
                .and_then(|bytes| String::from_utf8(bytes).ok()));
        }
        #[cfg(not(windows))]
        {
            return Ok(None);
        }
    }

    let Some(payload) = value.strip_prefix(PROVIDER_SECRET_PREFIX) else {
        return Ok(None);
    };
    let key = read_or_create_provider_secret(root)?;
    let Some(encrypted) = decode_hex(payload) else {
        return Ok(None);
    };
    let decrypted = xor_provider_secret(&encrypted, &key);
    Ok(String::from_utf8(decrypted).ok())
}

fn xor_provider_secret(input: &[u8], key: &[u8]) -> Vec<u8> {
    input
        .iter()
        .enumerate()
        .map(|(index, byte)| {
            let key_byte = key.get(index % key.len()).copied().unwrap_or(0);
            byte ^ key_byte ^ ((index as u8).wrapping_mul(31))
        })
        .collect()
}

#[cfg(windows)]
#[repr(C)]
struct ProviderDataBlob {
    cb_data: u32,
    pb_data: *mut u8,
}

#[cfg(windows)]
#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(
        data_in: *mut ProviderDataBlob,
        data_descr: *const u16,
        optional_entropy: *mut ProviderDataBlob,
        reserved: *mut std::ffi::c_void,
        prompt_struct: *mut std::ffi::c_void,
        flags: u32,
        data_out: *mut ProviderDataBlob,
    ) -> i32;

    fn CryptUnprotectData(
        data_in: *mut ProviderDataBlob,
        data_descr: *mut *mut u16,
        optional_entropy: *mut ProviderDataBlob,
        reserved: *mut std::ffi::c_void,
        prompt_struct: *mut std::ffi::c_void,
        flags: u32,
        data_out: *mut ProviderDataBlob,
    ) -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn LocalFree(mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
}

#[cfg(windows)]
fn protect_provider_secret_with_os(input: &[u8]) -> Option<Vec<u8>> {
    provider_secret_dpapi(input, true)
}

#[cfg(windows)]
fn unprotect_provider_secret_with_os(input: &[u8]) -> Option<Vec<u8>> {
    provider_secret_dpapi(input, false)
}

#[cfg(windows)]
fn provider_secret_dpapi(input: &[u8], protect: bool) -> Option<Vec<u8>> {
    if input.is_empty() || input.len() > u32::MAX as usize {
        return None;
    }

    let mut input = input.to_vec();
    let mut data_in = ProviderDataBlob {
        cb_data: input.len() as u32,
        pb_data: input.as_mut_ptr(),
    };
    let mut data_out = ProviderDataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };

    let ok = unsafe {
        if protect {
            CryptProtectData(
                &mut data_in,
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
                &mut data_out,
            )
        } else {
            CryptUnprotectData(
                &mut data_in,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
                &mut data_out,
            )
        }
    };

    if ok == 0 || data_out.pb_data.is_null() || data_out.cb_data == 0 {
        return None;
    }

    let output = unsafe {
        let slice = std::slice::from_raw_parts(data_out.pb_data, data_out.cb_data as usize);
        let output = slice.to_vec();
        LocalFree(data_out.pb_data.cast());
        output
    };
    Some(output)
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn decode_hex(value: &str) -> Option<Vec<u8>> {
    if value.len() % 2 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(value.len() / 2);
    let chars = value.as_bytes();
    for index in (0..chars.len()).step_by(2) {
        let high = decode_hex_digit(chars[index])?;
        let low = decode_hex_digit(chars[index + 1])?;
        bytes.push((high << 4) | low);
    }
    Some(bytes)
}

fn decode_hex_digit(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

pub(crate) fn select_provider_for_use_case(
    root: &Path,
    use_cases: &[&str],
) -> Result<Option<AiProviderConfig>, ProjectError> {
    let config_root = software_provider_config_root()?;
    let config_path = config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE);
    let raw = if config_path.exists() {
        fs::read_to_string(config_path)?
    } else {
        read_optional_project_file(root, ".olienta/ai-providers.json")?
    };
    if raw.trim().is_empty() {
        return Ok(None);
    }
    let decrypt_root = if config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE).exists() {
        &config_root
    } else {
        root
    };
    let display_json = decrypt_ai_providers_for_display(decrypt_root, &raw)?;
    let providers: Vec<AiProviderConfig> = serde_json::from_str(&display_json)?;
    Ok(providers.into_iter().find(|provider| {
        provider.enabled.unwrap_or(false)
            && provider
                .use_cases
                .as_ref()
                .map(|items| {
                    if items.is_empty() {
                        return true;
                    }
                    items.iter().any(|item| {
                        use_cases
                            .iter()
                            .any(|requested| item.eq_ignore_ascii_case(requested))
                    })
                })
                .unwrap_or(true)
    }))
}

pub(crate) fn select_chapter_provider(root: &Path) -> Result<Option<AiProviderConfig>, ProjectError> {
    select_provider_for_use_case(root, &["chapter"])
}

pub(crate) fn provider_label(provider: &AiProviderConfig) -> String {
    let name = provider
        .name
        .as_deref()
        .or(provider.id.as_deref())
        .unwrap_or("provider")
        .to_owned();
    match provider
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        Some(model) => format!("{name} ({model})"),
        None => name,
    }
}

fn call_openai_compatible(
    provider: &AiProviderConfig,
    prompt: &str,
) -> Result<ProviderCallResult, String> {
    call_openai_compatible_with_system(provider, "", prompt)
}

pub(crate) fn call_openai_compatible_with_system(
    provider: &AiProviderConfig,
    system: &str,
    prompt: &str,
) -> Result<ProviderCallResult, String> {
    let kind = provider.kind.as_deref().unwrap_or("OpenAI-compatible");
    if kind.to_ascii_lowercase().contains("anthropic") {
        return call_anthropic_messages(provider, system, prompt);
    }
    let is_ollama = kind.to_ascii_lowercase().contains("ollama");
    let api_key = provider.api_key.as_deref().unwrap_or("").trim();
    if api_key.is_empty() && !is_ollama {
        return Err("provider api key is empty".to_owned());
    }

    let base_url = provider
        .base_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("https://api.openai.com/v1");
    let model = provider
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("unspecified-model");
    let _context_window = provider.context_window.unwrap_or(0);
    let temperature = provider.temperature.unwrap_or(0.7);
    let timeout_seconds = provider.timeout_seconds.unwrap_or(180).clamp(5, 600);

    let mut messages = Vec::new();
    if !system.trim().is_empty() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": system.trim()
        }));
    }
    messages.push(serde_json::json!({
        "role": "user",
        "content": prompt.trim()
    }));

    let endpoint = chat_completions_endpoint(base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .tcp_nodelay(true)
        .pool_idle_timeout(Duration::from_secs(30))
        .no_brotli()
        .no_zstd()
        .build()
        .map_err(|error| format!("provider http client init failed: {error}"))?;
    let mut request_body = serde_json::json!({
        "model": model,
        "temperature": temperature,
        "messages": messages
    });
    if let Some(max_tokens) = provider.max_tokens.filter(|value| *value > 0) {
        if let Some(object) = request_body.as_object_mut() {
            object.insert("max_tokens".to_owned(), serde_json::json!(max_tokens));
        }
    }
    let mut first_error: Option<String> = None;
    let mut last_error = String::new();
    let mut attempt_durations_ms = Vec::new();
    for attempt in 0..4 {
        let attempt_started_at = Instant::now();
        let mut request = client.post(&endpoint).json(&request_body);
        if !api_key.is_empty() {
            request = request.bearer_auth(api_key);
        }
        let result = read_provider_response_body(request, timeout_seconds)
            .and_then(|body| extract_chat_completion_result(&body));
        attempt_durations_ms.push(attempt_started_at.elapsed().as_millis());
        match result {
            Ok(mut value) => {
                value.diagnostics = ProviderCallDiagnostics {
                    retry_reason: first_error.clone(),
                    attempt_durations_ms,
                };
                return Ok(value);
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error.clone());
                }
                last_error = error;
                if attempt >= 3 || !is_retryable_provider_chat_error(&last_error) {
                    break;
                }
                std::thread::sleep(provider_retry_delay(attempt));
            }
        }
    }
    Err(format_provider_retry_error(
        first_error.as_deref().unwrap_or(&last_error),
        &last_error,
    ))
}

fn read_provider_response_body(
    request: reqwest::blocking::RequestBuilder,
    timeout_seconds: u64,
) -> Result<String, String> {
    let response = request.send().map_err(|error| {
        if error.is_timeout() {
            format!("provider request timed out after {timeout_seconds}s; reduce context, lower maxTokens, or retry")
        } else {
            format!("provider request failed: {error}")
        }
    })?;
    let status = response.status();
    let body_bytes = response
        .bytes()
        .map_err(|error| format!("provider response read failed: {error}"))?;
    let body = String::from_utf8_lossy(&body_bytes).to_string();
    if !status.is_success() {
        return Err(format!(
            "provider returned HTTP {status}: {}",
            trim_for_status(&body)
        ));
    }
    Ok(body)
}

fn chat_completions_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_owned()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn call_anthropic_messages(
    provider: &AiProviderConfig,
    system: &str,
    prompt: &str,
) -> Result<ProviderCallResult, String> {
    let api_key = provider.api_key.as_deref().unwrap_or("").trim();
    if api_key.is_empty() {
        return Err("provider api key is empty".to_owned());
    }

    let base_url = provider
        .base_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("https://api.anthropic.com/v1");
    let model = provider
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("unspecified-model");
    let timeout_seconds = provider.timeout_seconds.unwrap_or(180).clamp(5, 600);
    let max_tokens = provider
        .max_tokens
        .filter(|value| *value > 0)
        .unwrap_or(4096);
    let temperature = provider.temperature.unwrap_or(0.7);

    let endpoint = anthropic_messages_endpoint(base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .tcp_nodelay(true)
        .pool_idle_timeout(Duration::from_secs(30))
        .no_brotli()
        .no_zstd()
        .build()
        .map_err(|error| format!("provider http client init failed: {error}"))?;

    let mut request_body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{
            "role": "user",
            "content": prompt.trim()
        }]
    });
    if !system.trim().is_empty() {
        if let Some(object) = request_body.as_object_mut() {
            object.insert("system".to_owned(), serde_json::json!(system.trim()));
        }
    }

    let mut first_error: Option<String> = None;
    let mut last_error = String::new();
    let mut attempt_durations_ms = Vec::new();
    for attempt in 0..4 {
        let attempt_started_at = Instant::now();
        let request = client
            .post(&endpoint)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&request_body);
        let result = read_provider_response_body(request, timeout_seconds)
            .and_then(|body| extract_anthropic_result(&body));
        attempt_durations_ms.push(attempt_started_at.elapsed().as_millis());
        match result {
            Ok(mut value) => {
                value.diagnostics = ProviderCallDiagnostics {
                    retry_reason: first_error.clone(),
                    attempt_durations_ms,
                };
                return Ok(value);
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error.clone());
                }
                last_error = error;
                if attempt >= 3 || !is_retryable_provider_chat_error(&last_error) {
                    break;
                }
                std::thread::sleep(provider_retry_delay(attempt));
            }
        }
    }
    Err(format_provider_retry_error(
        first_error.as_deref().unwrap_or(&last_error),
        &last_error,
    ))
}

fn anthropic_messages_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/messages") {
        trimmed.to_owned()
    } else {
        format!("{trimmed}/messages")
    }
}

fn extract_chat_completion_result(body: &str) -> Result<ProviderCallResult, String> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("provider returned invalid JSON: {error}"))?;
    let content = parsed
        .get("choices")
        .and_then(|value| value.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| {
            choice
                .get("message")
                .and_then(|message| message.get("content"))
                .or_else(|| choice.get("text"))
        })
        .and_then(provider_content_to_text)
        .unwrap_or_default()
        .trim()
        .to_owned();
    if content.is_empty() {
        Err(format!(
            "provider response did not contain choices[0].message.content; {}",
            summarize_provider_response_shape(&parsed)
        ))
    } else {
        Ok(ProviderCallResult {
            content,
            usage: parse_token_usage(&parsed),
            diagnostics: ProviderCallDiagnostics::default(),
        })
    }
}

fn extract_anthropic_result(body: &str) -> Result<ProviderCallResult, String> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("provider returned invalid JSON: {error}"))?;
    let content = parsed
        .get("content")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
        .trim()
        .to_owned();
    if content.is_empty() {
        Err(format!(
            "provider response did not contain content[].text; {}",
            summarize_provider_response_shape(&parsed)
        ))
    } else {
        Ok(ProviderCallResult {
            content,
            usage: parse_anthropic_usage(&parsed),
            diagnostics: ProviderCallDiagnostics::default(),
        })
    }
}

fn provider_content_to_text(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_owned());
    }
    let items = value.as_array()?;
    let text = items
        .iter()
        .filter_map(|item| {
            item.get("text")
                .and_then(|value| value.as_str())
                .or_else(|| item.get("content").and_then(|value| value.as_str()))
        })
        .collect::<Vec<_>>()
        .join("");
    (!text.trim().is_empty()).then_some(text)
}

fn summarize_provider_response_shape(parsed: &serde_json::Value) -> String {
    if let Some(message) = parsed
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(|value| value.as_str())
    {
        return format!("provider error: {}", trim_to_chars(message, 400));
    }
    let choices = parsed
        .get("choices")
        .and_then(|value| value.as_array())
        .map(|choices| choices.len())
        .unwrap_or(0);
    let finish_reason = parsed
        .get("choices")
        .and_then(|value| value.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(|value| value.as_str())
        .unwrap_or("-");
    let top_keys = parsed
        .as_object()
        .map(|object| object.keys().take(8).cloned().collect::<Vec<_>>().join(","))
        .unwrap_or_default();
    format!("choices={choices}, finish_reason={finish_reason}, top_level_keys=[{top_keys}]")
}

fn parse_token_usage(parsed: &serde_json::Value) -> Option<ModelTokenUsage> {
    let usage = parsed.get("usage")?;
    let prompt_tokens = usage.get("prompt_tokens").and_then(|value| value.as_u64());
    let completion_tokens = usage
        .get("completion_tokens")
        .and_then(|value| value.as_u64());
    let total_tokens = usage.get("total_tokens").and_then(|value| value.as_u64());
    (prompt_tokens.is_some() || completion_tokens.is_some() || total_tokens.is_some()).then_some(
        ModelTokenUsage {
            prompt_tokens,
            completion_tokens,
            total_tokens,
        },
    )
}

fn parse_anthropic_usage(parsed: &serde_json::Value) -> Option<ModelTokenUsage> {
    let usage = parsed.get("usage")?;
    let prompt_tokens = usage.get("input_tokens").and_then(|value| value.as_u64());
    let completion_tokens = usage.get("output_tokens").and_then(|value| value.as_u64());
    let total_tokens = match (prompt_tokens, completion_tokens) {
        (Some(input), Some(output)) => Some(input + output),
        _ => None,
    };
    (prompt_tokens.is_some() || completion_tokens.is_some()).then_some(ModelTokenUsage {
        prompt_tokens,
        completion_tokens,
        total_tokens,
    })
}


fn trim_for_status(content: &str) -> String {
    let single_line = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if single_line.chars().count() <= 240 {
        single_line
    } else {
        format!("{}...", single_line.chars().take(240).collect::<String>())
    }
}

fn trim_to_chars(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    let mut output = String::new();
    for (index, ch) in trimmed.chars().enumerate() {
        if index >= max_chars {
            output.push_str("...");
            return output;
        }
        output.push(ch);
    }
    output
}

#[cfg(test)]
pub(crate) fn set_test_provider_config_root(path: Option<PathBuf>) {
    TEST_PROVIDER_CONFIG_ROOT.with(|value| {
        *value.borrow_mut() = path;
    });
}
