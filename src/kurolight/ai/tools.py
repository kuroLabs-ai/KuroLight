"""Kuro AI Assistant tool definitions, parameter schemas, and execution payloads."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolParameter(BaseModel):
    """Specification for a single tool argument."""
    name: str
    type: str  # "string", "number", "integer", "boolean", "object", "array"
    description: str
    required: bool = True
    default: Optional[Any] = None
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    enum: Optional[List[str]] = None


class ToolDefinition(BaseModel):
    """OpenAI / Gemini function calling compatible tool signature."""
    name: str
    description: str
    parameters: List[ToolParameter] = Field(default_factory=list)

    def to_function_schema(self) -> Dict[str, Any]:
        """Export as standard JSON Schema for LLM tool calling."""
        props = {}
        required = []
        for p in self.parameters:
            schema: Dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum:
                schema["enum"] = p.enum
            if p.minimum is not None:
                schema["minimum"] = p.minimum
            if p.maximum is not None:
                schema["maximum"] = p.maximum
            if p.default is not None:
                schema["default"] = p.default

            props[p.name] = schema
            if p.required:
                required.append(p.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": props,
                    "required": required,
                },
            },
        }


@dataclass
class ToolExecutionResult:
    """Outcome of a tool invocation."""
    success: bool
    data: Any
    message: str
    proposed_edits: Optional[Dict[str, Any]] = None
