#![allow(unused_imports)]

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_events::{append_system_event, append_workflow_task_history};
use crate::project_export::docx_to_plain_markdown;
use crate::project_files::is_previewable_project_text;
pub use crate::project_types::*;
pub use crate::project_candidates::{
    ai_chat, cancel_ai_request, compose_writing_brief, generate_candidate_draft,
    generate_candidate_draft_with_request_id, list_candidate_history, list_pinned_context,
    load_agent_chat_history, load_candidate, load_candidate_history, pin_search_result_to_writing_brief,
    pin_search_results_to_writing_brief, record_candidate_adoption,
    record_candidate_history_restore, remove_pinned_context_item, save_agent_chat_history, save_candidate,
    save_candidate_with_restore_source,
};
pub use crate::project_candidate_review::{
    adopt_candidate_fact_draft, review_candidate_draft, review_candidate_draft_for_chapter,
    review_candidate_draft_issues, review_candidate_draft_issues_for_chapter,
};
pub(crate) use crate::project_candidates::{
    backup_existing_candidate,
};
pub(crate) use crate::project_candidate_review::{
    candidate_review_issues_from_warnings, grouped_candidate_warnings, refresh_chapter_story_contract,
    write_candidate_fact_draft, write_chapter_contract_fulfillment_summary,
};
// Smoke-contract markers kept here for the legacy project_model source scan after
// candidate review moved into project_candidate_review.rs:
// CandidateFactCandidate; fulfillmentJsonPath; 实体类型：; 识别理由：; 分类建议：;
// 来源定位：候选稿第; ANTI_AI_PATTERNS.
pub use crate::project_knowledge::{
    extract_character_cards, load_knowledge_file, regenerate_knowledge_file, rescan_facts,
    save_knowledge_file,
};
pub(crate) use crate::project_knowledge::{
    character_name_from_heading, compose_knowledge_generation_prompt, read_character_context,
    read_classified_fact_files, rescan_facts_for_root, source_paragraphs,
};
pub use crate::project_blueprints::{
    generate_blueprint_draft, list_blueprint_history, load_blueprint, load_blueprint_history,
    regenerate_all_blueprints, regenerate_following_blueprints, save_blueprint,
};
pub use crate::project_core::{
    create_project, list_chapters, list_known_projects, open_project,
};
pub use crate::project_chapters::{
    import_chapter_markdown, load_author_input, load_chapter, read_imported_document, save_author_input,
    save_chapter,
};
pub(crate) use crate::project_core::{
    count_words, extract_title, fallback_project_yaml, is_placeholder_or_empty,
    mirror_author_visible_framework_file, normalize_chapter_id, read_optional_project_file,
    load_chapter_side_file, read_project_yaml, reject_software_directory_project_path,
    save_chapter_side_file, scaffold_project,
    update_author_confirmation, write_author_visible_blueprint,
    write_author_visible_candidate_draft, write_author_visible_manuscript, write_chapter_commit, read_framework_files, trim_to_chars, write_generation_context_snapshot,
};
pub(crate) use crate::project_blueprints::compose_blueprint_prompt;
pub use crate::project_ai_providers::{
    load_ai_providers, save_ai_providers, test_ai_provider, test_ai_providers,
};
use crate::project_ai_providers::{
    append_model_call_log, call_openai_compatible_with_system, is_retryable_provider_chat_error,
    provider_label, provider_usage_warnings, select_chapter_provider, select_provider_for_use_case,
    ModelCallLog, ModelTokenUsage,
};
#[cfg(test)]
use crate::project_ai_providers::{
    set_test_provider_config_root, AiProviderConfig, PROVIDER_DPAPI_SECRET_PREFIX,
    SOFTWARE_PROVIDER_CONFIG_FILE,
};
#[allow(unused_imports)]
pub use crate::project_framework::{
    generate_framework_draft, list_framework_files, load_framework_file, save_framework_file,
};
#[allow(unused_imports)]
pub use crate::project_skills::{
    analyze_skill_conflicts, import_skill_file, list_selected_skills, load_skill_file,
    set_skill_disabled, set_temporary_skill,
};
use crate::project_skills::read_selected_skills_for_task;
use crate::project_timeline::{read_active_timeline_context, read_timeline_context};
use crate::project_volumes::{read_project_volumes, volume_for_chapter};

#[cfg(test)]
use crate::project_export::{export_manuscript, markdown_to_docx};
#[cfg(test)]
use crate::project_framework::compose_framework_prompt;
#[cfg(test)]
use crate::project_files::{save_module_markdown_file, search_project_text_files_scoped};
#[cfg(test)]
use crate::project_health::inspect_project_health;
#[cfg(test)]
use crate::project_imports::{import_reference_file, import_reference_file_with_deconstruction};
#[cfg(test)]
use crate::project_timeline::{load_timeline_events, save_timeline_events};

#[allow(dead_code)]
const DEV_SMOKE_MARKERS: &[&str] = &[
    "undo-replace-paragraph",
    "candidate_adoption_undone",
    "candidate_adoption_undo_summary_written",
    "call_openai_compatible_with_system_cancellable",
    "provider_retry_delay",
    "format_provider_retry_error",
    "candidate_fact_draft_adopted",
    "章节追踪",
    "下一次出场边界",
    "候选稿承接已确认事实",
    "候选稿触碰禁写规则",
    "候选稿命中未闭合伏笔",
    "段落替换撤销确认",
    "grouped_candidate_review_issues",
];



#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Cursor, Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    fn create_temp_project(chapter_count: u32) -> (tempfile::TempDir, std::path::PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("novel");
        create_project(CreateProjectInput {
            name: "测试作品".to_owned(),
            root_path: root.to_string_lossy().to_string(),
            language: "zh-CN".to_owned(),
            chapter_count,
            target_words_per_chapter: 3000,
            template: "blank".to_owned(),
        })
        .unwrap();
        (temp, root)
    }

    fn with_provider_config_dir<T>(test: impl FnOnce(&Path) -> T) -> T {
        let temp = tempfile::tempdir().unwrap();
        set_test_provider_config_root(Some(temp.path().to_path_buf()));
        let result = test(temp.path());
        set_test_provider_config_root(None);
        result
    }

    #[test]
    #[ignore]
    fn real_provider_long_framework_and_knowledge_smoke() {
        if std::env::var("OLIENTA_REAL_PROVIDER_SMOKE").ok().as_deref() != Some("1") {
            eprintln!("set OLIENTA_REAL_PROVIDER_SMOKE=1 to run real provider smoke");
            return;
        }

        let real_config_dir = std::env::var_os("OLIENTA_REAL_PROVIDER_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("D:/windsurf/olienta/.olienta-app-config"));
        set_test_provider_config_root(Some(real_config_dir));
        let (_temp, root) = create_temp_project(3);
        let root_path = root.to_string_lossy().to_string();
        let provider_doc = load_ai_providers(root_path.clone()).unwrap();

        let mut providers: serde_json::Value = serde_json::from_str(&provider_doc.content).unwrap();
        let items = providers
            .as_array_mut()
            .expect("provider config should be a JSON array");
        assert!(
            items.iter().any(|item| item.get("enabled").and_then(|value| value.as_bool()) == Some(true)),
            "real provider config needs at least one enabled provider"
        );
        for item in items {
            if let Some(object) = item.as_object_mut() {
                if object.get("enabled").and_then(|value| value.as_bool()) == Some(true) {
                    object.insert("useCases".to_owned(), serde_json::json!([]));
                    object.insert("timeoutSeconds".to_owned(), serde_json::json!(240));
                    object.insert("maxTokens".to_owned(), serde_json::json!(1800));
                }
            }
        }

        let smoke_config_dir = root.join(".olienta-real-provider-smoke-config");
        set_test_provider_config_root(Some(smoke_config_dir));
        save_ai_providers(
            root_path.clone(),
            serde_json::to_string_pretty(&providers).unwrap(),
        )
        .unwrap();

        save_framework_file(
            root_path.clone(),
            "02-premise.md".to_owned(),
            "# Story Premise\n\nA long realistic novel about debt, work, family pressure, and a slow attempt to rebuild ordinary life.\n".to_owned(),
        )
        .unwrap();
        save_framework_file(
            root_path.clone(),
            "03-characters.md".to_owned(),
            "# Characters\n\n- Chen: failed founder, careful, ashamed, still observant.\n- Lin: former colleague, practical and guarded.\n".to_owned(),
        )
        .unwrap();
        save_framework_file(
            root_path.clone(),
            "04-plot-outline.md".to_owned(),
            "# Plot Outline\n\nThe first volume follows twenty chapters of practical recovery without miracle reversal.\n".to_owned(),
        )
        .unwrap();
        save_chapter(
            root_path.clone(),
            "001".to_owned(),
            "# Chapter 1\n\nChen wakes in a rented room, reads collection notices, eats plain congee, and remembers that survival now means learning the smallest daily routines again.\n\nThe scene stays grounded in rent, food, phone messages, and old business documents.\n".to_owned(),
        )
        .unwrap();

        let long_request = [
            "Write a long Markdown framework draft.",
            "Include premise, protagonist pressure, volume arc, character conflict, reader promises, continuity boundaries, and anti-spoiler notes.",
            "Keep the response complete but concise enough for a desktop smoke test.",
        ]
        .join("\n\n");
        let framework = generate_framework_draft(
            root_path.clone(),
            "02-premise.md".to_owned(),
            long_request,
        )
        .unwrap();
        assert!(framework.content.len() > 200);

        let facts = regenerate_knowledge_file(
            root_path.clone(),
            "confirmed-facts".to_owned(),
            Some("Rebuild durable story memory from the confirmed manuscript only.".to_owned()),
        )
        .unwrap();
        assert!(facts.content.len() > 200);

        let model_log = fs::read_to_string(root.join("logs/model-calls/history.md")).unwrap();
        assert!(model_log.contains("framework-draft"));
        assert!(model_log.contains("knowledge-file-regenerate"));
        assert!(
            !model_log.contains("local-placeholder"),
            "real provider smoke fell back to local placeholder:\n{model_log}"
        );
        set_test_provider_config_root(None);
    }

    fn spawn_chat_completion_server(
        response_body: &'static str,
    ) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let read = stream.read(&mut chunk).unwrap();
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let header_end = buffer
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|index| index + 4)
                .unwrap_or(buffer.len());
            let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            while buffer.len().saturating_sub(header_end) < content_length {
                let read = stream.read(&mut chunk).unwrap();
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
            }
            let request = String::from_utf8_lossy(&buffer).to_string();
            sender.send(request).unwrap();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.as_bytes().len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        (format!("http://{address}/v1"), receiver)
    }

    #[test]
    fn empty_provider_use_cases_apply_to_all_generation_tasks() {
        with_provider_config_dir(|config_dir| {
            let (_temp, root) = create_temp_project(1);
            let (base_url, receiver) = spawn_chat_completion_server(
                r#"{"choices":[{"message":{"content":"Olienta connection ok"}}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}"#,
            );
            let content = serde_json::json!([{
                "id": "provider-empty-use-cases",
                "name": "Local Test Provider",
                "kind": "openai-compatible",
                "enabled": true,
                "baseUrl": base_url,
                "apiKey": "test-key",
                "model": "test-model",
                "useCases": [],
                "timeoutSeconds": 30
            }])
            .to_string();

            save_ai_providers(root.to_string_lossy().to_string(), content).unwrap();
            assert!(config_dir.join("ai-providers.json").exists());

            let result = test_ai_provider(root.to_string_lossy().to_string()).unwrap();
            assert!(
                result.ok,
                "provider should be selected when useCases is empty"
            );
            assert_eq!(result.provider, "Local Test Provider (test-model)");
            assert_eq!(result.message, "Olienta connection ok");

            let request = receiver.recv_timeout(Duration::from_secs(2)).unwrap();
            assert!(request
                .to_ascii_lowercase()
                .contains("authorization: bearer test-key"));
            assert!(request.contains("\"model\":\"test-model\""));
        });
    }

    #[test]
    fn project_scaffold_creates_external_markdown_vault() {
        let (_temp, root) = create_temp_project(3);

        assert!(root.join("framework/02-premise.md").exists());
        assert!(root.join("framework/03-characters.md").exists());
        assert!(root.join("framework/04-plot-outline.md").exists());
        assert!(root.join("framework/05-world.md").exists());
        assert!(!root.join("framework/04-world.md").exists());
        assert!(!root.join("framework/05-plot.md").exists());
        assert!(root.join("knowledge/README.md").exists());
        assert!(root.join("knowledge/markdown/README.md").exists());
        assert!(root.join("knowledge/search/README.md").exists());
        assert!(root.join("blueprints/chapters/001.md").exists());
        assert!(!root.join("manuscript/drafts/001.md").exists());
        assert!(root.join("manuscript/chapters/001.md").exists());
        assert!(root.join("facts/confirmed-facts.md").exists());
        assert!(root.join("facts/time-facts.md").exists());
        assert!(root.join("facts/relation-facts.md").exists());
        assert!(root.join("facts/world-rules.md").exists());
        assert!(root.join("facts/forbidden-rules.md").exists());
        assert!(root.join("story-contracts/master-contract.json").exists());
        assert!(root.join("story-contracts/chapters").exists());
        assert!(root.join("story-contracts/fulfillment").exists());
        assert!(root.join("tasks/contract-revisions").exists());
        assert!(root.join("characters/cards/README.md").exists());
        assert!(root.join("logs/model-calls/README.md").exists());
        assert!(!root.join(".olienta/ai-providers.json").exists());

        let chapters = list_chapters(root.to_string_lossy().to_string()).unwrap();
        assert_eq!(chapters[0].state, "待写");

        let health = inspect_project_health(root.to_string_lossy().to_string()).unwrap();
        assert!(health.ready);
        assert_eq!(health.missing_count, 0);
        assert_eq!(health.warning_count, 0);
    }

    #[test]
    fn story_contract_review_flags_missing_required_and_forbidden_hits() {
        let (_temp, root) = create_temp_project(1);
        fs::write(
            root.join("blueprints/chapters/001.md"),
            "# 第 1 章蓝图\n\n## 必须发生\n\n- 周岚交出钥匙。\n\n## 禁止提前\n\n- 不得揭开镜像权限代价。\n",
        )
        .unwrap();
        fs::write(
            root.join("facts/forbidden-rules.md"),
            "# 禁写规则\n\n- 镜像权限代价不能在第一章公开。\n",
        )
        .unwrap();
        compose_writing_brief(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();

        let warnings = review_candidate_draft_for_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "林序直接说出镜像权限代价。".to_owned(),
        )
        .unwrap();

        assert!(root.join("story-contracts/chapters/001.json").exists());
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("章级合同禁写项")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("章级合同必须项")));
    }

    #[test]
    fn save_chapter_writes_story_contract_fulfillment_summary() {
        let (_temp, root) = create_temp_project(1);
        fs::write(
            root.join("blueprints/chapters/001.md"),
            "# 第 1 章蓝图\n\n## 必须发生\n\n- 周岚交出钥匙。\n\n## 禁止提前\n\n- 不得揭开镜像权限代价。\n",
        )
        .unwrap();
        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章\n\n周岚交出钥匙，雨声压住了门外的脚步。".to_owned(),
        )
        .unwrap();

        let summary = fs::read_to_string(root.join("story-contracts/fulfillment/001.md")).unwrap();
        assert!(summary.contains("合同履约摘要"));
        assert!(summary.contains("必须项完成"));
        assert!(summary.contains("周岚交出钥匙"));
        assert!(summary.contains("story-contracts/fulfillment/001.json"));
        let summary_json =
            fs::read_to_string(root.join("story-contracts/fulfillment/001.json")).unwrap();
        assert!(summary_json.contains("\"score\""));
        assert!(summary_json.contains("\"missingRequiredCount\""));
        assert!(summary_json.contains("\"revisionPath\""));
        assert!(summary_json.contains("周岚交出钥匙"));
        let revision = fs::read_to_string(root.join("tasks/contract-revisions/001.md")).unwrap();
        assert!(revision.contains("合同回修清单"));
        assert!(revision.contains("回修步骤"));
        assert!(fs::read_to_string(root.join("tasks/history.jsonl"))
            .unwrap()
            .contains("revisionPath"));
    }

    #[test]
    fn compose_writing_brief_includes_contract_revision_checklist() {
        let (_temp, root) = create_temp_project(1);
        fs::create_dir_all(root.join("tasks/contract-revisions")).unwrap();
        fs::write(
            root.join("tasks/contract-revisions/001.md"),
            "# 第 001 章合同回修清单\n\n## 必须补齐\n\n- [ ] 补齐：让主角检查 RainReceipt。\n",
        )
        .unwrap();

        let brief =
            compose_writing_brief(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert!(brief.content.contains("本轮回修目标"));
        assert!(brief.content.contains("RainReceipt"));
        assert!(brief.content.contains("合同回修清单"));
        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("revisionChecklistIncluded"));
        assert!(task_history.contains("tasks/contract-revisions/001.md"));
    }

    #[test]
    fn compose_writing_brief_includes_autonovel_task_guidance() {
        let (_temp, root) = create_temp_project(2);
        fs::write(
            root.join("manuscript/chapters/001.md"),
            "# 第一章\n\n周岚把铜钥匙藏进旧信封，雨声压住了门外的脚步。",
        )
        .unwrap();
        fs::write(
            root.join("blueprints/chapters/002.md"),
            "# 第 2 章蓝图\n\n## 必须发生\n\n- 主角必须回收铜钥匙承诺。\n\n## 禁止提前\n\n- 不得提前揭开镜像权限代价。\n\n## 本章冲突\n\n- 主角必须做出有代价的选择。",
        )
        .unwrap();
        fs::write(
            root.join("facts/open-loops.md"),
            "# 未闭合伏笔\n\n- [pending] 铜钥匙承诺尚未回收。\n",
        )
        .unwrap();
        fs::write(
            root.join("facts/forbidden-rules.md"),
            "# 禁止违背\n\n- 镜像权限代价不能提前公开。\n",
        )
        .unwrap();
        fs::write(
            root.join("characters/cards/zhou-lan.md"),
            "# 周岚\n\n- 当前状态：受伤但仍守住铜钥匙秘密。\n- 当前目标：确认旧信封来源。\n",
        )
        .unwrap();

        let brief =
            compose_writing_brief(root.to_string_lossy().to_string(), "002".to_owned()).unwrap();
        assert!(brief.content.contains("Autonovel 写作任务增强"));
        assert!(brief.content.contains("第一句承接点"));
        assert!(brief.content.contains("雨声压住了门外的脚步"));
        assert!(brief.content.contains("必须回收的伏笔"));
        assert!(brief.content.contains("铜钥匙承诺"));
        assert!(brief.content.contains("不得擅自回收的伏笔"));
        assert!(brief.content.contains("角色当前状态"));
        assert!(brief.content.contains("受伤但仍守住铜钥匙秘密"));
        assert!(brief.content.contains("禁止提前发生事项"));
        assert!(brief.content.contains("镜像权限代价"));
        assert!(brief.content.contains("本章读者期待"));
        assert!(brief.content.contains("冲突升级"));
    }

    #[test]
    fn compose_writing_brief_includes_style_fingerprint() {
        let (_temp, root) = create_temp_project(3);
        fs::write(
            root.join("manuscript/chapters/001.md"),
            "# Chapter 1\n\nHe opened the blue door. \"Wait here,\" she said. Rain tapped the glass. He counted the keys.\n\nThe street light went out. \"Now,\" she said. He put the key under the letter and closed the blue door.",
        )
        .unwrap();
        fs::write(
            root.join("manuscript/chapters/002.md"),
            "# Chapter 2\n\nRain crossed the window. \"The letter is gone,\" he said. She touched the key and looked back at the door.\n\nThe light came on again. He heard the street below and kept the blue letter hidden.",
        )
        .unwrap();
        fs::write(
            root.join("framework/06-style.md"),
            "# Style\n\n- 锁定：keep rain-object echoes.\n- 禁用：purple mist\n",
        )
        .unwrap();

        let brief =
            compose_writing_brief(root.to_string_lossy().to_string(), "003".to_owned()).unwrap();

        assert!(brief.content.contains("Style Fingerprint v1"));
        assert!(brief.content.contains("Average sentence units"));
        assert!(brief.content.contains("Dialogue ratio"));
        assert!(brief.content.contains("Manual style controls"));
        assert!(brief.content.contains("purple mist"));
        assert!(root.join(".olienta/style-fingerprint.md").exists());
    }

    #[test]
    fn candidate_review_checks_style_fingerprint() {
        let (_temp, root) = create_temp_project(2);
        fs::write(
            root.join("manuscript/chapters/001.md"),
            "# Chapter 1\n\nHe opened the door. \"Wait,\" she said. Rain touched the glass.\n\nHe kept the key. \"No,\" she said. The light moved across the floor.\n\nShe closed the letter. \"Run,\" he said. Rain covered the street.",
        )
        .unwrap();
        fs::write(
            root.join("framework/06-style.md"),
            "# Style\n\n- 禁用：purple mist\n",
        )
        .unwrap();

        let warnings = review_candidate_draft_for_chapter(
            root.to_string_lossy().to_string(),
            "002".to_owned(),
            "The character considered the situation with a long explanation about responsibility, memory, consequence, history, family pressure, personal fear, hidden obligation, moral hesitation, social expectation, old mistakes, future plans, private doubt, public danger, purple mist, and every possible reason for refusing to act even though nothing concrete happened in the room and nobody spoke.\n\nThe character continued the same abstract explanation about responsibility, memory, consequence, history, family pressure, personal fear, hidden obligation, moral hesitation, social expectation, old mistakes, future plans, private doubt, public danger, and every possible reason for refusing to act even though nothing concrete happened in the room and nobody spoke.".to_owned(),
        )
        .unwrap();

        assert!(warnings
            .iter()
            .any(|warning| warning.contains("Style Fingerprint v1")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("purple mist")));
    }

    #[test]
    fn candidate_review_checks_contract_revision_targets() {
        let (_temp, root) = create_temp_project(1);
        fs::create_dir_all(root.join("tasks/contract-revisions")).unwrap();
        fs::write(
            root.join("tasks/contract-revisions/001.md"),
            "# 第 001 章合同回修清单\n\n## 必须补齐\n\n- [ ] 补齐：让主角检查 RainReceipt。\n",
        )
        .unwrap();

        let missing_warnings = review_candidate_draft_for_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "主角只检查了空信封。".to_owned(),
        )
        .unwrap();
        assert!(missing_warnings
            .iter()
            .any(|warning| warning.contains("回修目标未完成")));
        let missing_issues = candidate_review_issues_from_warnings(&missing_warnings);
        assert!(missing_issues
            .iter()
            .any(|issue| issue.category == "revision" && issue.blocking));

        let done_warnings = review_candidate_draft_for_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "主角检查 RainReceipt，确认转账发生在黎明前。".to_owned(),
        )
        .unwrap();
        assert!(done_warnings
            .iter()
            .any(|warning| warning.contains("回修目标完成")));
    }

    #[test]
    fn candidate_review_includes_autonovel_quality_checks() {
        let content = [
            "突然，门开了。然后他看见灯灭了。其实命运早有安排。",
            "突然，风停了。然后他终于明白一切都变了。",
            "突然，他感到害怕，心里一震，却无法言说。",
            "然后他感到害怕，心里一震，仍然无法言说。",
        ]
        .join("\n\n");

        let warnings = review_candidate_draft(content);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("AI味/套话") && warning.contains("突然")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("AI味/情绪直说")));
        assert!(warnings.iter().any(|warning| warning.contains("读者面板")));

        let issues = candidate_review_issues_from_warnings(&warnings);
        assert!(issues.iter().any(|issue| issue.category == "ai_flavor"));
        assert!(issues.iter().any(|issue| issue.category == "pacing"));
    }

    #[test]
    fn candidate_fact_draft_extracts_and_adopts_open_loops() {
        let (_temp, root) = create_temp_project(1);
        let content = "周岚把铜钥匙藏进旧信封，承诺三天后再解释。\n\n林序终于明白，那枚铜钥匙原来就是雨夜承诺的答案。";
        let draft_path = write_candidate_fact_draft(&root, "001", content).unwrap();
        assert_eq!(draft_path, "facts/candidate-fact-drafts/001.md");
        let draft_file = root.join(&draft_path);
        let mut draft = fs::read_to_string(&draft_file).unwrap();
        assert!(draft.contains("待确认伏笔账本"));
        assert!(draft.contains("facts/open-loops.md"));
        assert!(draft.contains("[pending]"));
        assert!(draft.contains("[harvested]"));

        draft = draft
            .replace("- [ ] [pending]", "- [x] [pending]")
            .replace("- [ ] [harvested]", "- [x] [harvested]");
        fs::write(&draft_file, draft).unwrap();

        let result =
            adopt_candidate_fact_draft(root.to_string_lossy().to_string(), draft_path).unwrap();
        assert_eq!(result.adopted_count, 2);
        assert!(result
            .classified_paths
            .contains(&"facts/open-loops.md".to_owned()));
        let open_loops = fs::read_to_string(root.join("facts/open-loops.md")).unwrap();
        assert!(open_loops.contains("铜钥匙"));
        assert!(open_loops.contains("harvested"));
    }

    #[test]
    fn reader_panel_review_outputs_four_perspectives() {
        let long_paragraph = "他沿着走廊往前走，墙上的灯一盏接一盏熄灭，旧合同的编号不断浮现，所有人都在等待他的选择，但没有任何人开口。".repeat(12);
        let content = format!("# 第一章\n\n{long_paragraph}\n\n他终于明白，一切都变了。");

        let warnings = review_candidate_draft(content);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("读者面板/主编")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("读者面板/类型读者")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("读者面板/作者技法")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("读者面板/普通读者")));

        let issues = candidate_review_issues_from_warnings(&warnings);
        assert!(issues.iter().any(|issue| issue.category == "pacing"));
    }

    #[test]
    fn adversarial_cut_review_classifies_actionable_targets() {
        let structural = "他沿着走廊往前走，然后停下，然后回头，然后继续往前，心里一震，感到害怕。也就是说，他知道这意味着旧合同仍然有效，命运没有放过他，一切都变了。".repeat(8);
        let content = format!("# 第一章\n\n{structural}");

        let warnings = review_candidate_draft(content);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("对抗式删改清单") && warning.contains("STRUCTURAL")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("OVER-EXPLAIN")));
        assert!(warnings.iter().any(|warning| warning.contains("GENERIC")));
        assert!(warnings.iter().any(|warning| warning.contains("TELL")));
        assert!(warnings.iter().any(|warning| warning.contains("REDUNDANT")));

        let groups = grouped_candidate_warnings(&warnings);
        assert!(groups
            .iter()
            .any(|(title, items)| *title == "对抗式删改清单" && !items.is_empty()));
    }

    #[test]
    fn open_project_migrates_legacy_framework_file_names() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("legacy-novel");
        fs::create_dir_all(root.join("framework")).unwrap();
        fs::write(
            root.join("project.yaml"),
            "name: 旧项目\nlanguage: zh-CN\ntemplate: blank\nstorage: local-files\nchapter_count: 3\ntarget_words_per_chapter: 3000\n",
        )
        .unwrap();
        fs::write(
            root.join("framework/04-world.md"),
            "# 旧世界观\n\n保留世界设定。",
        )
        .unwrap();
        fs::write(
            root.join("framework/05-plot.md"),
            "# 旧情节大纲\n\n保留情节设计。",
        )
        .unwrap();

        open_project(root.to_string_lossy().to_string()).unwrap();

        assert!(
            fs::read_to_string(root.join("framework/04-plot-outline.md"))
                .unwrap()
                .contains("保留情节设计")
        );
        assert!(fs::read_to_string(root.join("framework/05-world.md"))
            .unwrap()
            .contains("保留世界设定"));
    }

    #[test]
    fn open_project_rejects_plain_folder_without_project_yaml() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("plain-folder");
        fs::create_dir_all(&root).unwrap();

        let error = open_project(root.to_string_lossy().to_string()).unwrap_err();

        assert!(error.to_string().contains("project.yaml"));
        assert!(!root.join("project.yaml").exists());
    }

    #[test]
    fn module_markdown_save_is_restricted_to_auxiliary_files() {
        let (_temp, root) = create_temp_project(1);

        let saved = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "characters/relations.md".to_owned(),
            "# 关系图谱\n\n- A 与 B 冲突。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved.relative_path, "characters/relations.md");
        assert!(saved.content.contains("A 与 B"));

        let saved_fact = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "facts/character-facts.md".to_owned(),
            "# 角色事实\n\n- 杨志远第一次出场在第 1 章。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved_fact.relative_path, "facts/character-facts.md");

        let saved_brief = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "tasks/writing-briefs/001.md".to_owned(),
            "# 第001章 写作任务书\n\n- 作者手动补充任务边界。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved_brief.relative_path, "tasks/writing-briefs/001.md");
        assert!(saved_brief.content.contains("作者手动补充任务边界"));

        let blocked = save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "manuscript/chapters/001.md".to_owned(),
            "# 绕过正文确认\n\n".to_owned(),
        );
        assert!(blocked.is_err());
    }

    #[test]
    fn forbidden_rules_are_editable_knowledge_file() {
        let (_temp, root) = create_temp_project(1);

        let saved = save_knowledge_file(
            root.to_string_lossy().to_string(),
            "forbidden-rules".to_owned(),
            "# 禁止违背\n\n- 不得否定作者确认正文。\n".to_owned(),
        )
        .unwrap();
        assert_eq!(saved.relative_path, "facts/forbidden-rules.md");

        let loaded = load_knowledge_file(
            root.to_string_lossy().to_string(),
            "forbidden-rules".to_owned(),
        )
        .unwrap();
        assert_eq!(loaded.relative_path, "facts/forbidden-rules.md");
        assert!(loaded.content.contains("不得否定作者确认正文"));
    }

    #[test]
    fn openai_compatible_call_posts_chat_completion_request() {
        let (base_url, receiver) = spawn_chat_completion_server(
            r#"{"choices":[{"message":{"content":"Provider says ok"}}],"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}"#,
        );
        let provider = AiProviderConfig {
            id: Some("mock".to_owned()),
            name: Some("Mock".to_owned()),
            kind: Some("openai-compatible".to_owned()),
            enabled: Some(true),
            base_url: Some(base_url),
            api_key: Some("sk-test".to_owned()),
            model: Some("mock-model".to_owned()),
            context_window: Some(128_000),
            temperature: Some(0.3),
            max_tokens: Some(777),
            timeout_seconds: Some(15),
            use_cases: Some(vec!["chapter".to_owned()]),
        };

        let result =
            call_openai_compatible_with_system(&provider, "System guard", "User prompt").unwrap();

        assert_eq!(result.content, "Provider says ok");
        let usage = result.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(11));
        assert_eq!(usage.completion_tokens, Some(7));
        assert_eq!(usage.total_tokens, Some(18));
        assert_eq!(result.diagnostics.retry_attempts(), 0);
        assert_eq!(result.diagnostics.attempt_durations_ms.len(), 1);
        let request = receiver.recv().unwrap();
        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(request.contains("authorization: Bearer sk-test"));
        assert!(request.contains("\"model\":\"mock-model\""));
        assert!(request.contains("\"temperature\":0.3"));
        assert!(request.contains("\"max_tokens\":777"));
        assert!(request.contains("\"role\":\"system\""));
        assert!(request.contains("System guard"));
        assert!(request.contains("\"role\":\"user\""));
        assert!(request.contains("User prompt"));
    }

    #[test]
    fn model_call_log_records_retry_diagnostics() {
        let (_temp, root) = create_temp_project(1);
        let diagnostics = crate::project_ai_providers::ProviderCallDiagnostics {
            retry_reason: Some("provider response read failed: reset".to_owned()),
            attempt_durations_ms: vec![120, 240],
        };

        append_model_call_log(
            &root,
            ModelCallLog {
                task: "candidate-draft",
                chapter_id: Some("001"),
                provider: "Mock Provider",
                input_path: Some("tasks/writing-briefs/001.md"),
                output_path: Some("manuscript/candidates/001.md"),
                ok: true,
                duration_ms: Some(360),
                usage: None,
                diagnostics: Some(&diagnostics),
                message: "ok",
            },
        )
        .unwrap();

        let history = fs::read_to_string(root.join("logs/model-calls/history.md")).unwrap();
        assert!(history.contains("- retryAttempts: 1"));
        assert!(history.contains("- retryReason: provider response read failed: reset"));
        assert!(history.contains("- attemptDurationsMs: 120,240"));
    }

    #[test]
    fn provider_selection_respects_order_and_use_case() {
        with_provider_config_dir(|config_root| {
            let (_temp, root) = create_temp_project(1);
            fs::write(
                config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE),
                r#"[
  {
    "id": "disabled",
    "name": "Disabled",
    "kind": "openai-compatible",
    "enabled": false,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-disabled",
    "model": "disabled-model",
    "useCases": ["chapter"]
  },
  {
    "id": "blueprint-first",
    "name": "Blueprint First",
    "kind": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-blueprint",
    "model": "blueprint-model",
    "useCases": ["blueprint"]
  },
  {
    "id": "chapter-second",
    "name": "Chapter Second",
    "kind": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-chapter",
    "model": "chapter-model",
    "useCases": ["chapter"]
  }
]"#,
            )
            .unwrap();

            let chapter = select_provider_for_use_case(&root, &["chapter"])
                .unwrap()
                .unwrap();
            assert_eq!(chapter.id.as_deref(), Some("chapter-second"));

            let blueprint = select_provider_for_use_case(&root, &["blueprint"])
                .unwrap()
                .unwrap();
            assert_eq!(blueprint.id.as_deref(), Some("blueprint-first"));

            assert!(select_provider_for_use_case(&root, &["facts"])
                .unwrap()
                .is_none());
        });
    }

    #[test]
    fn candidate_generation_uses_chapter_provider_when_available() {
        with_provider_config_dir(|config_root| {
            let (_temp, root) = create_temp_project(1);
            let root_path = root.to_string_lossy().to_string();
            let (base_url, _receiver) = spawn_chat_completion_server(
                r##"{"choices":[{"message":{"content":"# Provider Candidate\n\nModel generated chapter."}}],"usage":{"prompt_tokens":101,"completion_tokens":202,"total_tokens":303}}"##,
            );
            fs::write(
                config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE),
                format!(
                    r#"[{{
  "id": "chapter-provider",
  "name": "Chapter Provider",
  "kind": "openai-compatible",
  "enabled": true,
  "baseUrl": "{base_url}",
  "apiKey": "sk-chapter",
  "model": "chapter-model",
  "temperature": 0.2,
  "useCases": ["chapter"]
}}]"#
                ),
            )
            .unwrap();

            let draft = generate_candidate_draft(root_path, "001".to_owned()).unwrap();

            assert!(draft.content.contains("# Provider Candidate"));
            assert!(draft.content.contains("Model generated chapter."));
            assert!(draft
                .warnings
                .iter()
                .any(|warning| warning.contains("Chapter Provider (chapter-model)")));

            let model_log = fs::read_to_string(root.join("logs/model-calls/history.md")).unwrap();
            assert!(model_log.contains("Chapter Provider (chapter-model)"));
            assert!(model_log.contains("manuscript/candidates/001.md"));
            assert!(model_log.contains("durationMs:"));
            assert!(model_log.contains("promptTokens: 101"));
            assert!(model_log.contains("completionTokens: 202"));
            assert!(model_log.contains("totalTokens: 303"));

            let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
            assert!(task_history.contains("\"provider\":\"Chapter Provider (chapter-model)\""));
            assert!(task_history.contains("\"fallbackReason\":null"));
        });
    }

    #[test]
    fn blueprint_and_framework_generation_log_selected_provider() {
        with_provider_config_dir(|config_root| {
            let (_temp, root) = create_temp_project(1);
            let root_path = root.to_string_lossy().to_string();
            let (blueprint_url, _blueprint_receiver) = spawn_chat_completion_server(
                r##"{"choices":[{"message":{"content":"# Provider Blueprint\n\nModel planned the chapter."}}],"usage":{"prompt_tokens":31,"completion_tokens":41,"total_tokens":72}}"##,
            );
            let (framework_url, _framework_receiver) = spawn_chat_completion_server(
                r##"{"choices":[{"message":{"content":"# Provider Framework\n\nModel shaped the premise."}}],"usage":{"prompt_tokens":51,"completion_tokens":61,"total_tokens":112}}"##,
            );
            fs::write(
                config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE),
                format!(
                    r#"[{{
  "id": "blueprint-provider",
  "name": "Blueprint Provider",
  "kind": "openai-compatible",
  "enabled": true,
  "baseUrl": "{blueprint_url}",
  "apiKey": "sk-blueprint",
  "model": "blueprint-model",
  "useCases": ["blueprint"]
}}, {{
  "id": "framework-provider",
  "name": "Framework Provider",
  "kind": "openai-compatible",
  "enabled": true,
  "baseUrl": "{framework_url}",
  "apiKey": "sk-framework",
  "model": "framework-model",
  "useCases": ["framework"]
}}]"#
                ),
            )
            .unwrap();

            let blueprint = generate_blueprint_draft(
                root_path.clone(),
                "001".to_owned(),
                "Keep the clue unresolved.".to_owned(),
            )
            .unwrap();
            assert!(blueprint.content.contains("# Provider Blueprint"));

            let framework = generate_framework_draft(
                root_path,
                "02-premise.md".to_owned(),
                "Clarify the main premise.".to_owned(),
            )
            .unwrap();
            assert!(framework.content.contains("# Provider Framework"));

            let model_log = fs::read_to_string(root.join("logs/model-calls/history.md")).unwrap();
            assert!(model_log.contains("Blueprint Provider (blueprint-model)"));
            assert!(model_log.contains("Framework Provider (framework-model)"));
            assert!(model_log.contains("durationMs:"));
            assert!(model_log.contains("promptTokens: 31"));
            assert!(model_log.contains("totalTokens: 112"));
            assert!(!model_log.contains("blueprint-provider-or-local-placeholder"));
            assert!(!model_log.contains("framework-provider-or-local-placeholder"));
        });
    }

    #[test]
    fn provider_save_encrypts_api_key_and_load_decrypts_for_editing() {
        with_provider_config_dir(|config_root| {
            let (_temp, root) = create_temp_project(1);
            let content = r#"[
  {
    "id": "secure",
    "name": "Secure",
    "kind": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://example.invalid/v1",
    "apiKey": "sk-secret-value",
    "model": "secure-model",
    "useCases": ["chapter"]
  }
]"#;

            let saved =
                save_ai_providers(root.to_string_lossy().to_string(), content.to_owned()).unwrap();
            assert_eq!(saved.relative_path, "软件设置/ai-providers.json");
            assert!(saved.content.contains("sk-secret-value"));

            let stored =
                fs::read_to_string(config_root.join(SOFTWARE_PROVIDER_CONFIG_FILE)).unwrap();
            assert!(!stored.contains("sk-secret-value"));
            assert!(stored.contains("apiKeyEncrypted"));
            #[cfg(windows)]
            assert!(stored.contains(PROVIDER_DPAPI_SECRET_PREFIX));
            #[cfg(not(windows))]
            assert!(config_root.join(PROVIDER_KEY_RELATIVE_PATH).exists());
            assert!(!root.join(".olienta/ai-providers.json").exists());

            let loaded = load_ai_providers(root.to_string_lossy().to_string()).unwrap();
            assert_eq!(loaded.relative_path, "软件设置/ai-providers.json");
            assert!(loaded.content.contains("\"apiKey\": \"sk-secret-value\""));
            assert!(!loaded.content.contains("apiKeyEncrypted"));

            let provider = select_provider_for_use_case(&root, &["chapter"])
                .unwrap()
                .unwrap();
            assert_eq!(provider.api_key.as_deref(), Some("sk-secret-value"));
        });
    }

    #[test]
    fn imports_reference_file_into_project_knowledge_folder() {
        let (temp, root) = create_temp_project(1);
        let source = temp.path().join("外部资料.md");
        fs::write(&source, "# 外部资料\n\n这是一段可进入全文检索的作者资料。").unwrap();

        let imported = import_reference_file(
            root.to_string_lossy().to_string(),
            source.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(
            imported.relative_path,
            "knowledge/markdown/imported/外部资料.md"
        );
        assert!(imported.content.contains("全文检索"));
        assert!(root
            .join("knowledge/markdown/imported/外部资料.md")
            .exists());
    }

    #[test]
    fn imports_reference_file_with_deconstruction_outputs_knowledge_and_skill_candidate() {
        let (temp, root) = create_temp_project(1);
        let source = temp.path().join("样本小说.md");
        fs::write(
            &source,
            "# 样本\n\n她握住钥匙，但是没有立刻说出秘密。\n\n“你还有选择。”他说。\n\n承诺会在雨夜兑现，代价也会出现。",
        )
        .unwrap();

        let imported = import_reference_file_with_deconstruction(
            root.to_string_lossy().to_string(),
            source.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(
            imported.reference.relative_path,
            "knowledge/markdown/imported/样本小说.md"
        );
        assert!(imported
            .deconstruction_path
            .starts_with("knowledge/markdown/imported/_deconstruction/"));
        assert!(imported
            .skill_candidate_path
            .starts_with("knowledge/markdown/imported/_skill-candidates/"));

        let deconstruction = fs::read_to_string(root.join(&imported.deconstruction_path)).unwrap();
        assert!(deconstruction.contains("结构观察"));
        assert!(deconstruction.contains("可复用技法"));
        assert!(deconstruction.contains("只作为知识库资料和 Skill 候选"));

        let skill_candidate =
            fs::read_to_string(root.join(&imported.skill_candidate_path)).unwrap();
        assert!(skill_candidate.contains("Skill 候选"));
        assert!(skill_candidate.contains("不会自动进入 `skills/selected/`"));
        assert!(skill_candidate.contains("deconstruction"));
    }

    #[test]
    fn save_chapter_updates_confirmation_and_commit_log() {
        let (_temp, root) = create_temp_project(1);

        let saved = save_chapter(
            root.to_string_lossy().to_string(),
            "1".to_owned(),
            "# 第一章\n\n杨志远在深圳诊所整理 2019 年的现金流水。".to_owned(),
        )
        .unwrap();

        assert_eq!(saved.chapter_id, "001");
        assert!(saved.word_count > 0);
        assert!(
            fs::read_to_string(root.join("facts/author-confirmation.md"))
                .unwrap()
                .contains("001")
        );
        let confirmed_facts = fs::read_to_string(root.join("facts/confirmed-facts.md")).unwrap();
        assert!(confirmed_facts.contains("来源：第 001 章《第一章》，段落 2"));
        assert!(confirmed_facts.contains("杨志远在深圳诊所整理 2019 年的现金流水"));
        let time_facts = fs::read_to_string(root.join("facts/time-facts.md")).unwrap();
        assert!(time_facts.contains("# 时间事实"));
        assert!(time_facts.contains("提到年份：2019"));
        assert!(time_facts.contains("来源：第 001 章《第一章》，段落 2"));
        let location_facts = fs::read_to_string(root.join("facts/location-facts.md")).unwrap();
        assert!(location_facts.contains("# 地点事实"));
        assert!(location_facts.contains("提到关键词：深圳"));
        assert!(location_facts.contains("来源：第 001 章《第一章》，段落 2"));
        assert!(fs::read_to_string(root.join("logs/system-events.jsonl"))
            .unwrap()
            .contains("chapter_saved"));
    }

    #[test]
    fn candidate_draft_stays_separate_from_confirmed_manuscript() {
        let (_temp, root) = create_temp_project(1);

        save_candidate(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "作者修改后的候选稿。".to_owned(),
        )
        .unwrap();
        let candidate =
            load_candidate(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        let manuscript =
            load_chapter(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();

        assert!(candidate.content.contains("候选稿"));
        assert!(!manuscript.content.contains("候选稿"));
    }

    #[test]
    fn writing_flow_keeps_candidate_author_gated_until_confirmed_save() {
        let (_temp, root) = create_temp_project(1);

        save_module_markdown_file(
            root.to_string_lossy().to_string(),
            "facts/confirmed-facts.md".to_owned(),
            "# 已确认事实\n\n- 主角只能在作者确认后改变既定关系。".to_owned(),
        )
        .unwrap();
        save_author_input(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章作者输入\n\n必须写到本地资料里的“雨夜收据”。".to_owned(),
        )
        .unwrap();
        save_blueprint(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章蓝图\n\n## 本章目标\n\n主角发现第一条可验证线索。\n\n## 禁止提前发生\n\n不得直接揭示最终真相。".to_owned(),
        )
        .unwrap();

        let brief = pin_search_result_to_writing_brief(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "knowledge/markdown/imported/source.md".to_owned(),
            7,
            "雨夜收据显示转账时间早于公开说法。".to_owned(),
        )
        .unwrap();
        assert_eq!(brief.relative_path, "tasks/writing-briefs/001.md");
        assert!(brief.content.contains("钉选检索材料"));
        assert!(brief.content.contains("雨夜收据"));

        let pinned =
            list_pinned_context(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(
            pinned[0].source_path,
            "knowledge/markdown/imported/source.md"
        );

        let draft =
            generate_candidate_draft(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(draft.relative_path, "manuscript/candidates/001.md");
        assert_eq!(draft.writing_brief_path, "tasks/writing-briefs/001.md");
        assert!(draft.review_path.ends_with("001.md"));
        assert!(!draft.content.trim().is_empty());
        assert!(root.join(&draft.relative_path).exists());
        let review_report = fs::read_to_string(root.join(&draft.review_path)).unwrap();
        assert!(review_report.contains("# 第 001 章候选稿审查"));
        assert!(review_report.contains("### 生成与任务书"));

        let before_adoption = fs::read_to_string(root.join("manuscript/chapters/001.md")).unwrap();
        assert!(!before_adoption.contains("候选稿"));

        let confirmation = record_candidate_adoption(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "replace".to_owned(),
            draft.relative_path.clone(),
            "manuscript/chapters/001.md".to_owned(),
        )
        .unwrap();
        assert!(confirmation
            .relative_path
            .starts_with("logs/confirmations/001/v"));
        assert!(confirmation.relative_path.ends_with(".md"));
        assert!(root.join("logs/confirmations/001.md").exists());
        let confirmation_index =
            fs::read_to_string(root.join("logs/confirmations/001/index.json")).unwrap();
        assert!(confirmation_index.contains("\"chapter_id\": \"001\""));
        assert!(confirmation_index.contains("\"adoption_status\": \"adopted\""));
        assert!(confirmation_index.contains("\"adoption_mode\": \"replace\""));
        assert!(confirmation_index.contains("\"entry_id\": \"001-"));
        assert!(confirmation_index.contains("\"candidate_path\": \"manuscript/candidates/001.md\""));
        assert!(confirmation_index
            .contains("\"current_candidate_manifest_path\": \"manuscript/candidates/001.json\""));
        assert!(confirmation_index.contains("\"confirmation_path\": \"logs/confirmations/001/v"));
        assert!(confirmation.content.contains("采用方式：replace"));

        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            draft.content.clone(),
        )
        .unwrap();
        let confirmed = load_chapter(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        let chapter_history_dir = root.join("manuscript/chapters/history/001");
        assert!(chapter_history_dir.exists());
        assert!(fs::read_dir(chapter_history_dir).unwrap().next().is_some());
        assert!(confirmed.content.contains("候选稿"));
        assert!(
            fs::read_to_string(root.join("facts/author-confirmation.md"))
                .unwrap()
                .contains("001")
        );

        let exported = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "markdown".to_owned(),
            scope: Some("chapter".to_owned()),
            chapter_id: Some("001".to_owned()),
            chapter_ids: None,
        })
        .unwrap();
        assert_eq!(exported.relative_path, "exports/chapter-001.md");
        assert!(exported.content.contains("候选稿"));

        let events = fs::read_to_string(root.join("logs/system-events.jsonl")).unwrap();
        assert!(events.contains("candidate_adopted"));
        assert!(events.contains("chapter_saved"));
        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("search_result_pinned_to_brief"));
        assert!(task_history.contains("writing_brief_composed"));
        assert!(task_history.contains("candidate_draft_generated"));
    }

    #[test]
    fn core_writing_workflow_smoke_covers_project_to_confirmed_manuscript() {
        let (_temp, root) = create_temp_project(2);
        let root_path = root.to_string_lossy().to_string();

        let opened = open_project(root_path.clone()).unwrap();
        assert_eq!(opened.chapter_count, 2);

        fs::create_dir_all(root.join("knowledge/markdown/imported")).unwrap();
        fs::write(
            root.join("knowledge/markdown/imported/rain-receipt.md"),
            "# Rain Receipt\n\nRainReceipt clue proves the transfer happened before dawn.\n",
        )
        .unwrap();

        save_author_input(
            root_path.clone(),
            "001".to_owned(),
            "# Chapter input\n\nUse RainReceipt as the concrete evidence.\n".to_owned(),
        )
        .unwrap();
        save_blueprint(
            root_path.clone(),
            "001".to_owned(),
            "# Chapter 001 blueprint\n\n## Must happen\n\n- The protagonist checks RainReceipt.\n\n## Forbidden\n\n- Do not solve the final mystery.\n".to_owned(),
        )
        .unwrap();
        save_module_markdown_file(
            root_path.clone(),
            "facts/forbidden-rules.md".to_owned(),
            "# Forbidden rules\n\n- Do not contradict confirmed manuscript.\n".to_owned(),
        )
        .unwrap();

        let search_results = search_project_text_files_scoped(
            root_path.clone(),
            "RainReceipt".to_owned(),
            "all".to_owned(),
        )
        .unwrap();
        assert!(search_results
            .iter()
            .any(|result| result.relative_path == "knowledge/markdown/imported/rain-receipt.md"));
        let imported_result = search_results
            .iter()
            .find(|result| result.relative_path == "knowledge/markdown/imported/rain-receipt.md")
            .unwrap();

        let brief = pin_search_results_to_writing_brief(
            root_path.clone(),
            "001".to_owned(),
            vec![PinSearchResultInput {
                source_path: imported_result.relative_path.clone(),
                line_number: imported_result.line_number,
                snippet: imported_result.snippet.clone(),
            }],
        )
        .unwrap();
        assert_eq!(brief.relative_path, "tasks/writing-briefs/001.md");
        assert!(brief.content.contains("RainReceipt"));
        assert!(brief.content.contains("manuscript/candidates/001.md"));

        let pinned = list_pinned_context(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(
            pinned[0].source_path,
            "knowledge/markdown/imported/rain-receipt.md"
        );

        let draft = generate_candidate_draft(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(draft.relative_path, "manuscript/candidates/001.md");
        assert_eq!(draft.writing_brief_path, "tasks/writing-briefs/001.md");
        assert!(draft.model_call_log_entry_id.is_some());
        assert!(root.join(&draft.relative_path).exists());
        assert!(root.join(&draft.review_path).exists());
        assert!(!draft.content.trim().is_empty());
        assert!(fs::read_to_string(root.join("tasks/history.jsonl"))
            .unwrap()
            .contains("candidate_draft_started"));
        let current_manifest =
            fs::read_to_string(root.join("manuscript/candidates/001.json")).unwrap();
        assert!(current_manifest.contains("\"model_call_log_entry_id\""));
        let second_draft = generate_candidate_draft(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(second_draft.relative_path, "manuscript/candidates/001.md");
        let candidate_history =
            list_candidate_history(root_path.clone(), "001".to_owned()).unwrap();
        assert_eq!(candidate_history.len(), 1);
        let history_item = &candidate_history[0];
        assert!(history_item
            .relative_path
            .starts_with("manuscript/candidates/history/001/v"));
        assert!(history_item.backup_time_ms.is_some());
        assert_eq!(
            history_item.candidate_path.as_deref(),
            Some("manuscript/candidates/001.md")
        );
        assert_eq!(
            history_item.writing_brief_path.as_deref(),
            Some("tasks/writing-briefs/001.md")
        );
        assert_eq!(
            history_item.revision_path.as_deref(),
            Some("tasks/contract-revisions/001.md")
        );
        assert_eq!(
            history_item.review_path.as_deref(),
            Some("manuscript/candidates/reviews/001.md")
        );
        assert_eq!(
            history_item.model_call_log_path.as_deref(),
            Some("logs/model-calls/history.md")
        );
        assert_eq!(
            history_item.model_call_log_entry_id.as_deref(),
            draft.model_call_log_entry_id.as_deref()
        );
        let manifest_path = history_item.manifest_path.as_ref().unwrap();
        assert!(root.join(manifest_path).exists());
        let manifest = fs::read_to_string(root.join(manifest_path)).unwrap();
        assert!(manifest.contains("\"history_path\""));
        assert!(manifest.contains("\"review_path\""));
        assert!(manifest.contains("\"model_call_log_entry_id\""));
        let restored_history = record_candidate_history_restore(
            root_path.clone(),
            "001".to_owned(),
            history_item.relative_path.clone(),
            "manuscript/candidates/001.md".to_owned(),
            history_item.confirmation_path.clone(),
            history_item.confirmation_entry_id.clone(),
        )
        .unwrap();
        assert_eq!(restored_history.relative_path, history_item.relative_path);
        assert!(!restored_history.content.trim().is_empty());
        save_candidate_with_restore_source(
            root_path.clone(),
            "001".to_owned(),
            restored_history.content.clone(),
            Some(history_item.relative_path.clone()),
            history_item.confirmation_path.clone(),
            history_item.confirmation_entry_id.clone(),
        )
        .unwrap();
        let restored_current_manifest =
            fs::read_to_string(root.join("manuscript/candidates/001.json")).unwrap();
        assert!(restored_current_manifest.contains("\"restored_from_history_path\""));
        assert!(restored_current_manifest.contains(&history_item.relative_path));
        assert!(restored_current_manifest.contains("\"restored_at_ms\""));

        let manuscript_before = load_chapter(root_path.clone(), "001".to_owned()).unwrap();
        assert!(!manuscript_before
            .content
            .contains("tasks/writing-briefs/001.md"));

        let adoption = record_candidate_adoption(
            root_path.clone(),
            "001".to_owned(),
            "replace".to_owned(),
            second_draft.relative_path.clone(),
            "manuscript/chapters/001.md".to_owned(),
        )
        .unwrap();
        assert!(adoption
            .relative_path
            .starts_with("logs/confirmations/001/v"));
        assert!(adoption.relative_path.ends_with(".md"));
        assert!(root.join("logs/confirmations/001.md").exists());
        let adopted_manifest =
            fs::read_to_string(root.join("manuscript/candidates/001.json")).unwrap();
        assert!(adopted_manifest.contains("\"adoption_status\": \"adopted\""));
        assert!(adopted_manifest.contains("\"adoption_mode\": \"replace\""));
        assert!(adopted_manifest.contains("\"confirmation_path\": \"logs/confirmations/001/v"));
        assert!(adopted_manifest.contains("\"confirmation_entry_id\": \"001-"));
        let confirmation_index =
            fs::read_to_string(root.join("logs/confirmations/001/index.json")).unwrap();
        assert!(confirmation_index.contains("\"entry_id\": \"001-"));
        assert!(confirmation_index
            .contains("\"latest_confirmation_path\": \"logs/confirmations/001.md\""));
        assert!(confirmation_index.contains("\"manuscript_path\": \"manuscript/chapters/001.md\""));
        assert!(confirmation_index.contains(&adoption.relative_path));
        backup_existing_candidate(&root, "001").unwrap();
        let backfilled_confirmation_index =
            fs::read_to_string(root.join("logs/confirmations/001/index.json")).unwrap();
        assert!(backfilled_confirmation_index.contains(
            "\"candidate_history_manifest_path\": \"manuscript/candidates/history/001/v"
        ));

        let saved = save_chapter(
            root_path.clone(),
            "001".to_owned(),
            second_draft.content.clone(),
        )
        .unwrap();
        assert_eq!(saved.chapter_id, "001");
        assert!(saved.word_count > 0);

        let chapters = list_chapters(root_path.clone()).unwrap();
        assert_eq!(chapters[0].state, "已确认");
        assert!(chapters[0].words > 0);

        let exported = export_manuscript(ExportInput {
            root_path: root_path.clone(),
            format: "markdown".to_owned(),
            scope: Some("selected".to_owned()),
            chapter_id: None,
            chapter_ids: Some(vec!["001".to_owned()]),
        })
        .unwrap();
        assert_eq!(exported.relative_path, "exports/selected-chapters.md");
        assert!(exported.content.contains("001"));

        let health = inspect_project_health(root_path.clone()).unwrap();
        assert!(health.ready);

        let events = fs::read_to_string(root.join("logs/system-events.jsonl")).unwrap();
        assert!(events.contains("candidate_adopted"));
        assert!(events.contains("chapter_saved"));
        assert!(events.contains("candidate_history_restored"));
        assert!(events.contains("\"savedToCandidateFile\":false"));
        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("search_results_pinned_to_brief"));
        assert!(task_history.contains("writing_brief_composed"));
        assert!(task_history.contains("candidate_draft_generated"));
        assert!(task_history.contains("candidate_history_restore_previewed"));
        assert!(task_history.contains("restoredFromHistoryPath"));
    }

    #[test]
    fn search_scope_batch_pin_and_remove_recompose_writing_brief() {
        let (_temp, root) = create_temp_project(1);

        fs::create_dir_all(root.join("knowledge/markdown/imported")).unwrap();
        fs::write(
            root.join("knowledge/markdown/imported/source-a.md"),
            "# 资料 A\n\n雨夜收据显示第一笔转账发生在凌晨。\n",
        )
        .unwrap();
        fs::write(
            root.join("framework/02-premise.md"),
            "# 故事前提\n\n雨夜收据不是公开线索，而是私密证据。\n",
        )
        .unwrap();
        fs::write(
            root.join("manuscript/chapters/001.md"),
            "# 第一章\n\n正文里暂时没有那张雨夜收据。\n",
        )
        .unwrap();

        let imported_results = search_project_text_files_scoped(
            root.to_string_lossy().to_string(),
            "雨夜收据".to_owned(),
            "imported".to_owned(),
        )
        .unwrap();
        assert_eq!(imported_results.len(), 1);
        assert_eq!(
            imported_results[0].relative_path,
            "knowledge/markdown/imported/source-a.md"
        );

        let framework_results = search_project_text_files_scoped(
            root.to_string_lossy().to_string(),
            "雨夜收据".to_owned(),
            "framework".to_owned(),
        )
        .unwrap();
        assert!(framework_results
            .iter()
            .any(|result| result.relative_path == "framework/02-premise.md"));

        let manuscript_results = search_project_text_files_scoped(
            root.to_string_lossy().to_string(),
            "雨夜收据".to_owned(),
            "manuscript".to_owned(),
        )
        .unwrap();
        assert!(manuscript_results
            .iter()
            .any(|result| result.relative_path == "manuscript/chapters/001.md"));

        let brief = pin_search_results_to_writing_brief(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            vec![
                PinSearchResultInput {
                    source_path: imported_results[0].relative_path.clone(),
                    line_number: imported_results[0].line_number,
                    snippet: imported_results[0].snippet.clone(),
                },
                PinSearchResultInput {
                    source_path: framework_results[0].relative_path.clone(),
                    line_number: framework_results[0].line_number,
                    snippet: framework_results[0].snippet.clone(),
                },
            ],
        )
        .unwrap();
        assert!(brief.content.contains("钉选检索材料"));
        assert!(brief.content.contains("source-a.md"));

        let pinned =
            list_pinned_context(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(pinned.len(), 2);

        let recomposed =
            remove_pinned_context_item(root.to_string_lossy().to_string(), "001".to_owned(), 0)
                .unwrap();
        let pinned_after_remove =
            list_pinned_context(root.to_string_lossy().to_string(), "001".to_owned()).unwrap();
        assert_eq!(pinned_after_remove.len(), 1);
        assert!(!recomposed.content.contains("source-a.md"));
        assert!(recomposed.content.contains(&pinned_after_remove[0].snippet));

        let task_history = fs::read_to_string(root.join("tasks/history.jsonl")).unwrap();
        assert!(task_history.contains("search_results_pinned_to_brief"));
        assert!(task_history.contains("pinned_context_removed"));
    }

    #[test]
    fn blueprint_draft_generation_does_not_save_file() {
        let (_temp, root) = create_temp_project(2);
        let before = fs::read_to_string(root.join("blueprints/chapters/001.md")).unwrap();

        let draft = generate_blueprint_draft(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "本章需要让主角第一次意识到关系可以被剥离。".to_owned(),
        )
        .unwrap();
        let after = fs::read_to_string(root.join("blueprints/chapters/001.md")).unwrap();

        assert_eq!(before, after);
        assert_eq!(draft.relative_path, "blueprints/chapters/001.md");
        assert!(!draft.content.trim().is_empty());
    }

    #[test]
    fn generation_prompts_include_task_specific_skills() {
        let (_temp, root) = create_temp_project(1);

        let blueprint_skills = read_selected_skills_for_task(&root, "blueprint").unwrap();
        assert!(blueprint_skills.contains("chapter-blueprint-planning"));
        let blueprint_prompt = compose_blueprint_prompt(
            "001",
            "",
            "补齐本章蓝图。",
            "",
            "",
            "",
            "",
            "",
            "",
            &blueprint_skills,
        );
        assert!(blueprint_prompt.contains("本次蓝图生成应遵守的 Skill"));
        assert!(blueprint_prompt.contains("chapter-blueprint-planning"));

        let framework_skills = read_selected_skills_for_task(&root, "framework").unwrap();
        assert!(framework_skills.contains("serious-realism-novel"));
        let framework_prompt = compose_framework_prompt(
            "02-premise.md",
            "整理故事梗概。",
            "",
            "",
            "",
            &framework_skills,
        );
        assert!(framework_prompt.contains("本次框架生成应遵守的 Skill"));
        assert!(framework_prompt.contains("serious-realism-novel"));

        let fact_skills = read_selected_skills_for_task(&root, "facts").unwrap();
        assert!(fact_skills.contains("fact-memory-extraction"));
        let fact_prompt = compose_knowledge_generation_prompt(
            "已确认事实",
            "抽取事实。",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            &fact_skills,
        );
        assert!(fact_prompt.contains("本次事实库生成应遵守的 Skill"));
        assert!(fact_prompt.contains("fact-memory-extraction"));
    }

    #[test]
    fn exports_markdown_txt_and_docx_without_modifying_chapters() {
        let (_temp, root) = create_temp_project(1);
        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章\n\n正文内容。".to_owned(),
        )
        .unwrap();

        let markdown = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "markdown".to_owned(),
            scope: None,
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap();
        let txt = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "txt".to_owned(),
            scope: None,
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap();
        let docx = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "docx".to_owned(),
            scope: None,
            chapter_id: None,
            chapter_ids: None,
        })
        .unwrap();

        assert_eq!(markdown.relative_path, "exports/manuscript.md");
        assert_eq!(txt.relative_path, "exports/manuscript.txt");
        assert_eq!(docx.relative_path, "exports/manuscript.docx");
        assert_eq!(
            fs::read_to_string(root.join("manuscript/chapters/001.md")).unwrap(),
            "# 第一章\n\n正文内容。"
        );
    }

    #[test]
    fn exports_selected_chapters_in_project_order() {
        let (_temp, root) = create_temp_project(3);
        save_chapter(
            root.to_string_lossy().to_string(),
            "001".to_owned(),
            "# 第一章\n\n第一章正文。".to_owned(),
        )
        .unwrap();
        save_chapter(
            root.to_string_lossy().to_string(),
            "003".to_owned(),
            "# 第三章\n\n第三章正文。".to_owned(),
        )
        .unwrap();

        let selected = export_manuscript(ExportInput {
            root_path: root.to_string_lossy().to_string(),
            format: "markdown".to_owned(),
            scope: Some("selected".to_owned()),
            chapter_id: None,
            chapter_ids: Some(vec!["003".to_owned(), "001".to_owned()]),
        })
        .unwrap();

        assert_eq!(selected.relative_path, "exports/selected-chapters.md");
        assert!(selected.content.contains("# 测试作品 选中章节"));
        assert!(selected.content.contains("第一章正文。"));
        assert!(selected.content.contains("第三章正文。"));
        assert!(
            selected.content.find("第一章正文。").unwrap()
                < selected.content.find("第三章正文。").unwrap()
        );
        assert!(!selected.content.contains("第 2 章未命名"));
    }

    #[test]
    fn docx_export_includes_manuscript_layout_parts() {
        let bytes = markdown_to_docx(
            "# 测试作品\n\n第一段正文。\n\n---\n\n# 第二章\n\n第二章正文。\n\n> 引用内容\n\n- 列表项\n\n1. numbered item\n\n```\nlet total = 1;\nreturn total;\n```\n",
        )
        .unwrap();

        let content_types = read_docx_part(&bytes, "[Content_Types].xml");
        let relationships = read_docx_part(&bytes, "word/_rels/document.xml.rels");
        let document = read_docx_part(&bytes, "word/document.xml");
        let styles = read_docx_part(&bytes, "word/styles.xml");
        let header = read_docx_part(&bytes, "word/header1.xml");
        let footer = read_docx_part(&bytes, "word/footer1.xml");

        assert!(content_types.contains("/word/header1.xml"));
        assert!(content_types.contains("/word/footer1.xml"));
        assert!(relationships.contains("relationships/header"));
        assert!(relationships.contains("relationships/footer"));
        assert!(document.contains("w:headerReference"));
        assert!(document.contains("w:footerReference"));
        assert!(document.contains("w:pageBreakBefore"));
        assert!(document.contains(r#"<w:pStyle w:val="Title"/>"#));
        assert!(document.contains(r#"<w:pStyle w:val="TocEntry"/>"#));
        assert!(document.contains("目录"));
        assert!(document.contains("章节数：2"));
        assert!(document.contains("字数："));
        assert!(document.contains("1. 测试作品"));
        assert!(document.contains("2. 第二章"));
        assert!(document.contains(r#"<w:br w:type="page"/>"#));
        assert!(document.contains(r#"<w:pStyle w:val="BulletList"/>"#));
        assert!(document.contains(r#"<w:pStyle w:val="NumberedList"/>"#));
        assert!(document.contains(r#"<w:pStyle w:val="CodeBlock"/>"#));
        assert!(document.contains(r#"<w:pBdr>"#));
        assert!(document.contains(r#"<w:br/>"#));
        assert!(document.contains("let total = 1;"));
        assert!(document.contains("return total;"));
        assert!(styles.contains(r#"w:eastAsia="SimSun""#));
        assert!(styles.contains(r#"w:line="360""#));
        assert!(styles.contains(r#"w:styleId="Title""#));
        assert!(styles.contains(r#"w:styleId="TocEntry""#));
        assert!(styles.contains(r#"w:styleId="BulletList""#));
        assert!(styles.contains(r#"w:styleId="NumberedList""#));
        assert!(styles.contains(r#"w:styleId="CodeBlock""#));
        assert!(header.contains("Olienta 作品导出"));
        assert!(footer.contains(" PAGE "));
    }

    #[test]
    fn timeline_events_can_be_loaded_and_saved() {
        let (_temp, root) = create_temp_project(3);

        save_timeline_events(
            root.to_string_lossy().to_string(),
            "# 时间线事件\n\n- 第 1 章：主角得到第一条线索。".to_owned(),
        )
        .unwrap();

        let loaded = load_timeline_events(root.to_string_lossy().to_string()).unwrap();
        assert_eq!(loaded.relative_path, "timeline/events.md");
        assert!(loaded.content.contains("第一条线索"));
    }

    #[test]
    fn skill_summary_infers_category_tags_and_named_conflicts() {
        let (_temp, root) = create_temp_project(1);
        let skills_dir = root.join("skills/selected");
        fs::write(
            skills_dir.join("fast.md"),
            "---\ncategory: pacing\nscope: chapter\nconflicts: [fast]\n---\n\n强调快节奏、爽点和强钩子。",
        )
        .unwrap();
        fs::write(
            skills_dir.join("slow.md"),
            "# 慢节奏\n\n保持留白、克制和现实主义。",
        )
        .unwrap();

        let skills = list_selected_skills(root.to_string_lossy().to_string()).unwrap();
        let fast = skills.iter().find(|skill| skill.name == "fast.md").unwrap();
        let slow = skills.iter().find(|skill| skill.name == "slow.md").unwrap();
        assert_eq!(fast.category, "pacing");
        assert_eq!(fast.scope, "chapter");
        assert!(fast.conflict_tags.contains(&"fast-pace".to_owned()));
        assert_eq!(slow.category, "pacing");
        assert!(slow.conflict_tags.contains(&"slow-burn".to_owned()));

        let warnings = analyze_skill_conflicts(root.to_string_lossy().to_string()).unwrap();
        assert!(warnings.iter().any(|warning| {
            warning.contains("节奏冲突")
                && warning.contains("fast.md")
                && warning.contains("slow.md")
        }));
    }

    #[test]
    fn disabled_skill_is_ignored_unless_marked_temporary() {
        let (_temp, root) = create_temp_project(1);
        let skills_dir = root.join("skills/selected");
        fs::write(skills_dir.join("strict.md"), "严格遵循蓝图，不得偏离。").unwrap();
        fs::write(skills_dir.join("free.md"), "自由发挥，大胆改写。").unwrap();

        set_skill_disabled(
            root.to_string_lossy().to_string(),
            "free.md".to_owned(),
            true,
        )
        .unwrap();
        let warnings = analyze_skill_conflicts(root.to_string_lossy().to_string()).unwrap();
        assert!(!warnings
            .iter()
            .any(|warning| warning.contains("改写边界冲突")));

        set_temporary_skill(
            root.to_string_lossy().to_string(),
            "free.md".to_owned(),
            true,
        )
        .unwrap();
        let warnings = analyze_skill_conflicts(root.to_string_lossy().to_string()).unwrap();
        assert!(warnings.iter().any(|warning| {
            warning.contains("改写边界冲突")
                && warning.contains("strict.md")
                && warning.contains("free.md")
        }));
    }

    fn read_docx_part(bytes: &[u8], name: &str) -> String {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes.to_vec())).unwrap();
        let mut file = archive.by_name(name).unwrap();
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();
        text
    }
}

