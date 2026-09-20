from dataclasses import dataclass, field


@dataclass
class TutorSessionState:
    """Lightweight per-session state (spec.md section 14).

    Stored as the AgentSession's userdata and mutated by canvas tools.
    """

    paused: bool = False
    current_equations: list[dict] = field(default_factory=list)
    active_equation_id: str | None = None
    last_canvas_revision: int = 0
