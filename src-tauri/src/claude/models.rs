use crate::types::config::{ClaudeModel, ModelFamily, available_models};

/// Look up a model by its CLI id
pub fn find_model(model_id: &str) -> Option<ClaudeModel> {
    available_models().into_iter().find(|m| m.id == model_id)
}

/// Get the UI color for a model family
pub fn family_color(family: &ModelFamily) -> &'static str {
    match family {
        ModelFamily::Opus => "#8B5CF6",
        ModelFamily::Sonnet => "#3B82F6",
        ModelFamily::Haiku => "#10B981",
    }
}

/// Get display name for a model family
pub fn family_name(family: &ModelFamily) -> &'static str {
    match family {
        ModelFamily::Opus => "Opus",
        ModelFamily::Sonnet => "Sonnet",
        ModelFamily::Haiku => "Haiku",
    }
}
