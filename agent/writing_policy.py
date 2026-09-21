"""Writing permission comes from the student's current request, never a model plan."""
import re


def declines_writing(text: str) -> bool:
    text = ' '.join(text.lower().replace('’', "'").split())
    return bool(re.search(r"\b(?:don't|do not|never|stop|avoid|no need to|let me|i'll|i will|i want to|i need to)\b.{0,45}\b(?:write|writing|draw|drawing|fill|record|put)\b", text))


def ai_writing(preferences: dict | None) -> bool:
    return bool(preferences and preferences.get('aiWrites') is True)


def requests_writing(text: str) -> bool:
    text = ' '.join(text.lower().replace('’', "'").split())
    action = r'(?:write|draw|fill|record|put)'
    # Err toward guidance for negation, self-directed work or questions about
    # what the student should write. These are not requests for AI handwriting.
    if declines_writing(text):
        return False
    modifiers = r'(?:(?:please|just|also|actually|now)\s+|go ahead and\s+)*'
    patterns = [
        rf'^(?:(?:okay|ok|yes|yeah|sure)[, ]+)?{modifiers}{action}\b',
        rf'\b(?:can|could|would|will) you {modifiers}{action}\b',
        rf"\b(?:i want|i need|i would like|i'd like) you to {action}\b",
        rf'\b(?:please|mimir)[, ]+{modifiers}{action}\b',
    ]
    return any(re.search(pattern, text) for pattern in patterns)
