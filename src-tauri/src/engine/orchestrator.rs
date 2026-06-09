use crate::types::EpicStatus;

/// Validates whether a state transition is allowed
pub fn can_transition(from: &EpicStatus, to: &EpicStatus) -> bool {
    matches!(
        (from, to),
        // Forward flow
        (EpicStatus::Draft, EpicStatus::Speccing)
            | (EpicStatus::Speccing, EpicStatus::Decomposing)
            | (EpicStatus::Decomposing, EpicStatus::Planning)
            | (EpicStatus::Planning, EpicStatus::Ready)
            | (EpicStatus::Ready, EpicStatus::Executing)
            | (EpicStatus::Executing, EpicStatus::Verifying)
            | (EpicStatus::Verifying, EpicStatus::Completed)
            // Failure paths
            | (EpicStatus::Verifying, EpicStatus::Executing) // remediation
            | (_, EpicStatus::Failed)
            // Pause from any active state
            | (EpicStatus::Draft, EpicStatus::Paused)
            | (EpicStatus::Speccing, EpicStatus::Paused)
            | (EpicStatus::Decomposing, EpicStatus::Paused)
            | (EpicStatus::Planning, EpicStatus::Paused)
            | (EpicStatus::Ready, EpicStatus::Paused)
            | (EpicStatus::Executing, EpicStatus::Paused)
            | (EpicStatus::Verifying, EpicStatus::Paused)
            // Resume from paused (back to ready or executing)
            | (EpicStatus::Paused, EpicStatus::Ready)
            | (EpicStatus::Paused, EpicStatus::Executing)
            // Retry from failed
            | (EpicStatus::Failed, EpicStatus::Executing)
            | (EpicStatus::Failed, EpicStatus::Planning)
    )
}

/// Get the next status in the normal forward flow
pub fn next_status(current: &EpicStatus) -> Option<EpicStatus> {
    match current {
        EpicStatus::Draft => Some(EpicStatus::Speccing),
        EpicStatus::Speccing => Some(EpicStatus::Decomposing),
        EpicStatus::Decomposing => Some(EpicStatus::Planning),
        EpicStatus::Planning => Some(EpicStatus::Ready),
        EpicStatus::Ready => Some(EpicStatus::Executing),
        EpicStatus::Executing => Some(EpicStatus::Verifying),
        EpicStatus::Verifying => Some(EpicStatus::Completed),
        _ => None,
    }
}
