use serde::Serialize;
use std::path::Path;

/// Read a text file from disk. Bypasses Tauri frontend fs plugin permissions
/// by using std::fs directly from the backend.
#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write a text file to disk. Bypasses Tauri frontend fs plugin permissions.
#[tauri::command]
pub fn write_file_text(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[derive(Debug, Serialize, Clone)]
pub struct FileTreeEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String, // "file" or "directory"
    pub children: Vec<FileTreeEntry>,
}

#[tauri::command]
pub fn list_directory_tree(path: String, max_depth: u32) -> Result<Vec<FileTreeEntry>, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    build_tree(root, &path, 0, max_depth)
}

fn build_tree(dir: &Path, base: &str, depth: u32, max_depth: u32) -> Result<Vec<FileTreeEntry>, String> {
    if depth >= max_depth {
        return Ok(vec![]);
    }

    let mut entries: Vec<FileTreeEntry> = Vec::new();

    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs, node_modules, target, .git, dist, build
        if name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "build"
            || name == "__pycache__"
        {
            continue;
        }

        let full_path = entry.path();
        let relative_path = full_path
            .strip_prefix(base)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");

        let is_dir = full_path.is_dir();
        let children = if is_dir {
            build_tree(&full_path, base, depth + 1, max_depth).unwrap_or_default()
        } else {
            vec![]
        };

        entries.push(FileTreeEntry {
            name,
            path: relative_path,
            entry_type: if is_dir { "directory".to_string() } else { "file".to_string() },
            children,
        });
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        let a_is_dir = a.entry_type == "directory";
        let b_is_dir = b.entry_type == "directory";
        if a_is_dir != b_is_dir {
            return b_is_dir.cmp(&a_is_dir);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });

    Ok(entries)
}
