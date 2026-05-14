use std::fs;
use std::path::{Component, Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum FsSafetyError {
    #[error("project root does not exist: {0}")]
    MissingRoot(PathBuf),
    #[error("unsafe relative path: {0}")]
    UnsafePath(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn ensure_project_path(root: &Path, relative_path: &str) -> Result<PathBuf, FsSafetyError> {
    if !root.exists() {
        return Err(FsSafetyError::MissingRoot(root.to_path_buf()));
    }

    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return Err(FsSafetyError::UnsafePath(relative_path.to_owned()));
    }

    let mut clean = PathBuf::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => clean.push(value),
            Component::CurDir => {}
            _ => return Err(FsSafetyError::UnsafePath(relative_path.to_owned())),
        }
    }

    if clean.as_os_str().is_empty() {
        return Err(FsSafetyError::UnsafePath(relative_path.to_owned()));
    }

    Ok(root.canonicalize()?.join(clean))
}

pub fn atomic_write_text(path: &Path, content: &str) -> Result<(), FsSafetyError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let tmp_path = path.with_extension("tmp");
    let backup_path = path.with_extension("bak");

    fs::write(&tmp_path, content.as_bytes())?;

    if path.exists() {
        fs::copy(path, &backup_path)?;
        fs::remove_file(path)?;
    }

    fs::rename(tmp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_segments() {
        let temp = tempfile::tempdir().unwrap();
        let error = ensure_project_path(temp.path(), "../outside.md").unwrap_err();
        assert!(matches!(error, FsSafetyError::UnsafePath(_)));
    }

    #[test]
    fn writes_text_and_backup() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("file.md");

        atomic_write_text(&target, "first").unwrap();
        atomic_write_text(&target, "second").unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "second");
        assert_eq!(
            fs::read_to_string(temp.path().join("file.bak")).unwrap(),
            "first"
        );
    }
}
