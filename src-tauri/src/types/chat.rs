use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSnippet {
    pub text: String,
    /// "prd" | "tech_spec" | "design_spec" | "ticket" | "phase"
    pub source_type: String,
    pub source_id: String,
    pub source_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryEntry {
    /// "user" | "assistant"
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactItem {
    /// "prd" | "tech_spec" | "design_spec" | "ticket" | "phase"
    pub document_type: String,
    pub document_id: String,
    pub document_title: String,
    pub section: String,
    pub description: String,
    /// "high" | "medium" | "low"
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactAnalysis {
    pub impacts: Vec<ImpactItem>,
    pub summary: String,
    /// "low" | "medium" | "high"
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChange {
    pub document_type: String,
    pub document_id: String,
    pub new_content: String,
}
