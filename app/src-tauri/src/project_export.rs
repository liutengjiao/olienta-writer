use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_events::append_system_event;
use crate::project_model::{
    list_chapters, load_chapter, ExportInput, ProjectError, ProjectFileDocument,
};
use crate::project_volumes::{read_project_volumes, volume_for_chapter};

pub fn export_manuscript(input: ExportInput) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(input.root_path);
    let project_name = read_project_name(&root)?;
    let volumes = read_project_volumes(&root).unwrap_or_default();
    let scope = input.scope.as_deref().unwrap_or("all");
    let normalized_format = input.format.to_ascii_lowercase();
    let root_path = root.to_string_lossy().to_string();

    let (manuscript, target_stem) = if scope == "chapter" {
        let chapter_id = input.chapter_id.as_deref().unwrap_or("001");
        let document = load_chapter(root_path.clone(), chapter_id.to_owned())?;
        let content = if is_placeholder_or_empty(&document.content) {
            format!("# 第 {chapter_id} 章\n\n")
        } else {
            format!("{}\n", document.content.trim())
        };
        (content, format!("chapter-{}", chapter_id))
    } else if scope == "selected" {
        let selected_ids = input
            .chapter_ids
            .filter(|ids| !ids.is_empty())
            .or_else(|| input.chapter_id.map(|id| vec![id]))
            .unwrap_or_else(|| vec!["001".to_owned()]);
        let chapters = list_chapters(root_path.clone())?;
        let mut manuscript = format!("# {} 选中章节\n\n", project_name);
        let mut current_volume_id = None;
        for chapter in chapters
            .into_iter()
            .filter(|chapter| selected_ids.iter().any(|id| id == &chapter.id))
        {
            let document = load_chapter(root_path.clone(), chapter.id)?;
            if is_placeholder_or_empty(&document.content) {
                continue;
            }
            append_volume_heading_if_needed(
                &mut manuscript,
                &mut current_volume_id,
                &volumes,
                &document.chapter_id,
            );
            manuscript.push_str(document.content.trim());
            manuscript.push_str("\n\n");
        }
        (manuscript, "selected-chapters".to_owned())
    } else {
        let chapters = list_chapters(root_path.clone())?;
        let mut manuscript = format!("# {}\n\n", project_name);
        let mut current_volume_id = None;

        for chapter in chapters {
            let document = load_chapter(root_path.clone(), chapter.id)?;
            if is_placeholder_or_empty(&document.content) {
                continue;
            }
            append_volume_heading_if_needed(
                &mut manuscript,
                &mut current_volume_id,
                &volumes,
                &document.chapter_id,
            );
            manuscript.push_str(document.content.trim());
            manuscript.push_str("\n\n");
        }
        (manuscript, "manuscript".to_owned())
    };

    let exported = match normalized_format.as_str() {
        "txt" => {
            let relative_path = format!("exports/{target_stem}.txt");
            let content = markdown_to_plain_text(&manuscript);
            let target = ensure_project_path(&root, &relative_path)?;
            atomic_write_text(&target, &content)?;
            ProjectFileDocument {
                relative_path,
                content,
            }
        }
        "docx" | "word" => {
            let relative_path = format!("exports/{target_stem}.docx");
            let target = ensure_project_path(&root, &relative_path)?;
            let bytes = markdown_to_docx(&manuscript)?;
            fs::write(&target, bytes)?;
            ProjectFileDocument {
                content: format!("DOCX exported. Binary content is written to {relative_path}."),
                relative_path,
            }
        }
        _ => {
            let relative_path = format!("exports/{target_stem}.md");
            let target = ensure_project_path(&root, &relative_path)?;
            atomic_write_text(&target, &manuscript)?;
            ProjectFileDocument {
                relative_path,
                content: manuscript,
            }
        }
    };

    append_system_event(
        &root,
        "export_created",
        serde_json::json!({
            "format": normalized_format,
            "scope": scope,
            "path": exported.relative_path
        }),
    )?;
    Ok(exported)
}

pub(crate) fn docx_to_plain_markdown(path: &Path) -> Result<String, ProjectError> {
    let bytes = fs::read(path)?;
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;
    let mut document = String::new();
    archive
        .by_name("word/document.xml")?
        .read_to_string(&mut document)?;

    let mut paragraphs = Vec::new();
    let mut rest = document.as_str();
    while let Some(start) = rest.find("<w:p") {
        rest = &rest[start..];
        let Some(end) = rest.find("</w:p>") else {
            break;
        };
        let paragraph_xml = &rest[..end + "</w:p>".len()];
        let text = extract_docx_paragraph_text(paragraph_xml);
        if !text.trim().is_empty() {
            paragraphs.push(text.trim().to_owned());
        }
        rest = &rest[end + "</w:p>".len()..];
    }

    Ok(paragraphs.join("\n\n"))
}

pub(crate) fn markdown_to_docx(markdown: &str) -> Result<Vec<u8>, ProjectError> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("[Content_Types].xml", options)?;
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>"#,
        )?;

        zip.add_directory("_rels/", options)?;
        zip.start_file("_rels/.rels", options)?;
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
        )?;

        zip.add_directory("word/", options)?;
        zip.add_directory("word/_rels/", options)?;
        zip.start_file("word/_rels/document.xml.rels", options)?;
        zip.write_all(docx_document_rels_xml().as_bytes())?;

        zip.start_file("word/styles.xml", options)?;
        zip.write_all(docx_styles_xml().as_bytes())?;

        zip.start_file("word/header1.xml", options)?;
        zip.write_all(docx_header_xml().as_bytes())?;

        zip.start_file("word/footer1.xml", options)?;
        zip.write_all(docx_footer_xml().as_bytes())?;

        zip.start_file("word/document.xml", options)?;
        zip.write_all(docx_document_xml(markdown).as_bytes())?;
        zip.finish()?;
    }

    Ok(cursor.into_inner())
}

fn read_project_name(root: &Path) -> Result<String, ProjectError> {
    let path = ensure_project_path(root, "project.yaml")?;
    let content = fs::read_to_string(path)?;
    let parsed: serde_yaml::Value = serde_yaml::from_str(&content)?;
    Ok(parsed
        .get("name")
        .and_then(|value| value.as_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Olienta Project")
        .trim()
        .to_owned())
}

fn append_volume_heading_if_needed(
    manuscript: &mut String,
    current_volume_id: &mut Option<String>,
    volumes: &[crate::project_model::VolumeInfo],
    chapter_id: &str,
) {
    let Some(volume) = volume_for_chapter(volumes, chapter_id) else {
        return;
    };
    if current_volume_id.as_deref() == Some(volume.id.as_str()) {
        return;
    }
    manuscript.push_str(&format!("## {}\n\n", volume.title.trim()));
    *current_volume_id = Some(volume.id);
}

fn is_placeholder_or_empty(content: &str) -> bool {
    let trimmed = content.trim();
    trimmed.is_empty() || trimmed.contains("未生成") || trimmed.contains("未命名")
}

fn markdown_to_plain_text(markdown: &str) -> String {
    markdown
        .lines()
        .map(|line| {
            line.trim_start()
                .trim_start_matches('#')
                .trim_start_matches('>')
                .trim_start_matches("- ")
                .trim()
                .to_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_docx_paragraph_text(paragraph_xml: &str) -> String {
    let mut text = String::new();
    let mut rest = paragraph_xml;
    while let Some(start) = rest.find("<w:t") {
        rest = &rest[start..];
        let Some(tag_end) = rest.find('>') else {
            break;
        };
        rest = &rest[tag_end + 1..];
        let Some(text_end) = rest.find("</w:t>") else {
            break;
        };
        text.push_str(&xml_unescape(&rest[..text_end]));
        rest = &rest[text_end + "</w:t>".len()..];
    }
    text
}

fn docx_document_xml(markdown: &str) -> String {
    let mut paragraphs = String::new();
    let mut list_index = 0;
    let mut heading_one_count = 0;
    let mut in_code_block = false;
    let mut code_lines = Vec::new();
    let metadata = docx_metadata(markdown);

    paragraphs.push_str(&docx_cover_xml(&metadata));
    paragraphs.push_str(&docx_toc_xml(&metadata));

    for raw_line in markdown.lines() {
        let line = raw_line.trim();
        if line.starts_with("```") {
            if in_code_block {
                paragraphs.push_str(&docx_paragraph(
                    "CodeBlock",
                    &code_lines.join("\n"),
                    false,
                    false,
                    0,
                    false,
                ));
                code_lines.clear();
                in_code_block = false;
            } else {
                in_code_block = true;
            }
            continue;
        }
        if in_code_block {
            code_lines.push(raw_line.to_owned());
            continue;
        }
        if line.is_empty() {
            continue;
        }
        if line == "---" || line == "***" {
            paragraphs.push_str(&docx_horizontal_rule_paragraph());
            continue;
        }

        let (style, text, first_line, bullet, page_break_before) =
            if let Some(text) = line.strip_prefix("# ") {
                heading_one_count += 1;
                ("Heading1", text.trim(), false, false, heading_one_count > 1)
            } else if let Some(text) = line.strip_prefix("## ") {
                ("Heading2", text.trim(), false, false, false)
            } else if let Some(text) = line.strip_prefix("### ") {
                ("Heading3", text.trim(), false, false, false)
            } else if let Some(text) = line.strip_prefix('>') {
                ("Quote", text.trim(), false, false, false)
            } else if let Some(text) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
                list_index += 1;
                paragraphs.push_str(&docx_marked_paragraph(
                    "BulletList",
                    text.trim(),
                    "-",
                    false,
                ));
                continue;
            } else if let Some((number, text)) = markdown_numbered_item(line) {
                paragraphs.push_str(&docx_marked_paragraph(
                    "NumberedList",
                    text,
                    &format!("{number}."),
                    false,
                ));
                continue;
            } else {
                ("Normal", line, true, false, false)
            };

        paragraphs.push_str(&docx_paragraph(
            style,
            text,
            first_line,
            bullet,
            list_index,
            page_break_before,
        ));
    }
    if in_code_block && !code_lines.is_empty() {
        paragraphs.push_str(&docx_paragraph(
            "CodeBlock",
            &code_lines.join("\n"),
            false,
            false,
            0,
            false,
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {paragraphs}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader1"/>
      <w:footerReference w:type="default" r:id="rIdFooter1"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"#
    )
}

struct DocxMetadata {
    title: String,
    chapters: Vec<String>,
    word_count: usize,
}

fn docx_metadata(markdown: &str) -> DocxMetadata {
    let chapters = markdown
        .lines()
        .filter_map(|line| line.trim().strip_prefix("# "))
        .map(|title| strip_markdown_inline(title.trim()))
        .filter(|title| !title.is_empty())
        .collect::<Vec<_>>();
    let title = chapters
        .first()
        .cloned()
        .unwrap_or_else(|| "Olienta 作品导出".to_owned());
    DocxMetadata {
        title,
        chapters,
        word_count: count_text_units(&markdown_to_plain_text(markdown)),
    }
}

fn docx_cover_xml(metadata: &DocxMetadata) -> String {
    [
        docx_centered_paragraph("Title", &metadata.title),
        docx_centered_paragraph("Subtitle", "Olienta 作品导出"),
        docx_centered_paragraph(
            "ExportMeta",
            &format!(
                "章节数：{} · 字数：{}",
                metadata.chapters.len(),
                metadata.word_count
            ),
        ),
        docx_page_break_paragraph(),
    ]
    .join("")
}

fn docx_toc_xml(metadata: &DocxMetadata) -> String {
    let mut content = String::new();
    content.push_str(&docx_centered_paragraph("Heading1", "目录"));
    if metadata.chapters.is_empty() {
        content.push_str(&docx_paragraph("Normal", "暂无章节。", false, false, 0, false));
    } else {
        for (index, chapter) in metadata.chapters.iter().enumerate() {
            content.push_str(&docx_paragraph(
                "TocEntry",
                &format!("{}. {}", index + 1, chapter),
                false,
                false,
                0,
                false,
            ));
        }
    }
    content.push_str(&docx_page_break_paragraph());
    content
}

fn docx_centered_paragraph(style: &str, text: &str) -> String {
    let escaped = xml_escape(text);
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{style}"/><w:jc w:val="center"/></w:pPr><w:r><w:t>{escaped}</w:t></w:r></w:p>"#
    )
}

fn docx_page_break_paragraph() -> String {
    r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#.to_owned()
}

fn markdown_numbered_item(line: &str) -> Option<(usize, &str)> {
    let (number, rest) = line.split_once('.')?;
    if number.is_empty() || !number.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    let text = rest.trim();
    if text.is_empty() {
        return None;
    }
    Some((number.parse::<usize>().ok()?, text))
}

fn docx_horizontal_rule_paragraph() -> String {
    r#"<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="999999"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>"#.to_owned()
}

fn docx_marked_paragraph(style: &str, text: &str, marker: &str, page_break_before: bool) -> String {
    let marker = xml_escape(marker);
    let runs = docx_text_runs(&strip_markdown_inline(text));
    let page_break_xml = if page_break_before {
        r#"<w:pageBreakBefore/>"#
    } else {
        ""
    };
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{style}"/>{page_break_xml}<w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t>{marker}</w:t><w:tab/></w:r>{runs}</w:p>"#
    )
}

fn docx_paragraph(
    style: &str,
    text: &str,
    first_line: bool,
    bullet: bool,
    index: usize,
    page_break_before: bool,
) -> String {
    let escaped = xml_escape(&strip_markdown_inline(text));
    let style_xml = if style == "Normal" {
        String::new()
    } else {
        format!(r#"<w:pStyle w:val="{style}"/>"#)
    };
    let indent_xml = if first_line {
        r#"<w:ind w:firstLine="420"/>"#.to_owned()
    } else if bullet {
        r#"<w:ind w:left="720" w:hanging="360"/>"#.to_owned()
    } else {
        String::new()
    };
    let page_break_xml = if page_break_before {
        r#"<w:pageBreakBefore/>"#
    } else {
        ""
    };
    let bullet_text = if bullet {
        format!("{}. {escaped}", index)
    } else {
        escaped
    };
    let runs = docx_text_runs(&bullet_text);

    format!(r#"<w:p><w:pPr>{style_xml}{page_break_xml}{indent_xml}</w:pPr>{runs}</w:p>"#)
}

fn docx_text_runs(text: &str) -> String {
    let mut runs = String::new();
    for (index, line) in text.split('\n').enumerate() {
        if index > 0 {
            runs.push_str("<w:r><w:br/></w:r>");
        }
        let escaped = xml_escape(line);
        runs.push_str(&format!(
            r#"<w:r><w:t xml:space="preserve">{escaped}</w:t></w:r>"#
        ));
    }
    runs
}

fn docx_document_rels_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>"#
        .to_owned()
}

fn docx_header_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:t>Olienta 作品导出</w:t></w:r>
  </w:p>
</w:hdr>"#
        .to_owned()
}

fn docx_footer_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:t>第 </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:t> 页</w:t></w:r>
  </w:p>
</w:ftr>"#
        .to_owned()
}

fn docx_styles_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun"/>
        <w:sz w:val="24"/><w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun"/>
      <w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="1800" w:after="280"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr>
    <w:rPr><w:color w:val="666666"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ExportMeta">
    <w:name w:val="ExportMeta"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>
    <w:rPr><w:color w:val="666666"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TocEntry">
    <w:name w:val="TocEntry"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="80"/><w:ind w:left="420"/></w:pPr>
    <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="180" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="420"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BulletList">
    <w:name w:val="BulletList"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="80"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="NumberedList">
    <w:name w:val="NumberedList"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="80"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock">
    <w:name w:val="CodeBlock"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="420"/><w:spacing w:before="120" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="SimSun"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>
  </w:style>
</w:styles>"#
        .to_owned()
}

fn strip_markdown_inline(text: &str) -> String {
    text.replace("**", "").replace('`', "")
}

fn count_text_units(text: &str) -> usize {
    text.chars().filter(|ch| !ch.is_whitespace()).count()
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn xml_unescape(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}
